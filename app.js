const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const db             = require('./config/db');
const authRoutes     = require('./routes/authRoutes');
const gameRoutes     = require('./routes/gameRoutes');
const questionRoutes = require('./routes/questionRoutes');
const adminRoutes    = require('./routes/adminRoutes');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Use PostgreSQL session store in production, memory store locally
const sessionStore = process.env.DATABASE_URL
    ? (() => {
        const { Pool } = require('pg');
        const pgPool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        });
        return new (require('connect-pg-simple')(session))({
            pool: pgPool,
            createTableIfMissing: true
        });
      })()
    : undefined;

const sessionMiddleware = session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'flowmaster-secret-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000, secure: !!process.env.DATABASE_URL }
});
app.use(sessionMiddleware);

// Share express-session with Socket.io
io.use((socket, next) => sessionMiddleware(socket.request, {}, next));

// ── API Routes ──────────────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/game',      gameRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/admin',     adminRoutes);

// ── Page Routes ─────────────────────────────────────────────────────────────
const view = (name) => (req, res) => res.sendFile(path.join(__dirname, 'views', name));

app.get('/',                view('index.html'));
app.get('/login',           view('login.html'));
app.get('/register',        view('register.html'));
app.get('/dashboard',       view('dashboard.html'));
app.get('/setup',           view('setup.html'));
app.get('/lobby/:code',     view('lobby.html'));
app.get('/game/:code',      view('game.html'));
app.get('/leaderboard/:code', view('leaderboard.html'));
app.get('/admin',           view('admin.html'));
app.get('/q/:questionId',   view('question.html'));

// ── Socket.io Game Engine ───────────────────────────────────────────────────
// rooms[code] = { players: { [socketId]: {username,userId,score,hasAnswered} },
//                 currentQuestion, answers: {}, round }
const rooms = {};

io.on('connection', (socket) => {
    const sessionUser = socket.request.session?.user;

    // Join lobby or active game room
    socket.on('join-room', ({ code, username, userId }) => {
        socket.join(code);
        if (!rooms[code]) {
            rooms[code] = { players: {}, currentQuestion: null, answers: {}, round: 0 };
        }
        rooms[code].players[socket.id] = {
            socketId: socket.id,
            username: username || sessionUser?.username || 'Guest',
            userId:   userId   || sessionUser?.id,
            score:    0,
            hasAnswered: false
        };
        io.to(code).emit('room-update', { players: _playerList(code) });
    });

    // Host starts the game — bots array: [{name, difficulty}]
    socket.on('start-game', ({ code, bots = [] }) => {
        if (!rooms[code]) return;
        const BOT_NAMES = ['PyBot', 'CodeBot', 'LoopBot', 'FlowBot'];
        rooms[code].bots = bots.slice(0, 4).map((b, i) => ({
            id:         `bot_${i}`,
            username:   `🤖 ${b.name || BOT_NAMES[i] || 'Bot' + (i + 1)}`,
            difficulty: b.difficulty || 'medium',
            score:      0,
            hasAnswered: false
        }));
        io.to(code).emit('game-started', { code });
        // Send initial room update including bots
        io.to(code).emit('room-update', { players: _playerList(code) });
    });

    // Host sends a question (random or card-specific) to all players
    socket.on('send-question', ({ code, question }) => {
        if (!rooms[code]) return;
        const room = rooms[code];
        room.currentQuestion = question;
        room.answers = {};
        room.round  += 1;
        for (const id in room.players) room.players[id].hasAnswered = false;
        for (const bot of (room.bots || [])) bot.hasAnswered = false;

        io.to(code).emit('new-question', {
            question: {
                id:            question.id,
                question_text: question.question_text,
                code_snippet:  question.code_snippet,
                option_a:      question.option_a,
                option_b:      question.option_b,
                option_c:      question.option_c,
                option_d:      question.option_d,
                difficulty:    question.difficulty,
                category:      question.category,
                points:        question.points
            },
            round: room.round
        });

        // Schedule bot answers
        const accuracy = { easy: 0.35, medium: 0.55, hard: 0.80 };
        const delay    = { easy: [6000,12000], medium: [3000,8000], hard: [2000,5000] };
        for (const bot of (room.bots || [])) {
            const [dMin, dMax] = delay[bot.difficulty] || [4000, 9000];
            const wait = dMin + Math.random() * (dMax - dMin);
            setTimeout(() => {
                if (!rooms[code] || rooms[code].currentQuestion !== question || bot.hasAnswered) return;
                const acc     = accuracy[bot.difficulty] || 0.5;
                const correct = Math.random() < acc;
                const options = ['A', 'B', 'C', 'D'];
                const ans     = correct
                    ? question.correct_answer
                    : options.filter(o => o !== question.correct_answer)[Math.floor(Math.random() * 3)];
                const isCorrect   = ans === question.correct_answer;
                const pts         = isCorrect ? question.points : 0;
                bot.hasAnswered   = true;
                bot.score        += pts;
                room.answers[bot.id] = { username: bot.username, answer: ans, isCorrect, points: pts };
                io.to(code).emit('score-update', { players: _playerList(code) });
                const allDone = Object.values(room.players).every(p => p.hasAnswered)
                             && (room.bots || []).every(b => b.hasAnswered);
                if (allDone) _revealAnswers(code);
            }, wait);
        }
    });

    // Player submits answer — evaluate server-side
    socket.on('submit-answer', ({ code, answer }) => {
        const room   = rooms[code];
        if (!room || !room.currentQuestion) return;
        const player = room.players[socket.id];
        if (!player || player.hasAnswered) return;

        const question  = room.currentQuestion;
        const isCorrect = answer.toUpperCase() === question.correct_answer;
        const points    = isCorrect ? question.points : 0;

        player.hasAnswered = true;
        player.score      += points;
        room.answers[socket.id] = { username: player.username, answer, isCorrect, points };

        socket.emit('answer-result', {
            isCorrect,
            correctAnswer: question.correct_answer,
            explanation:   question.explanation,
            points,
            totalScore:    player.score
        });

        io.to(code).emit('score-update', { players: _playerList(code) });

        const allDone = Object.values(room.players).every(p => p.hasAnswered)
                     && (room.bots || []).every(b => b.hasAnswered);
        if (allDone) _revealAnswers(code);
    });

    // Host manually reveals answer
    socket.on('reveal-answer', ({ code }) => _revealAnswers(code));

    // Host ends the game
    socket.on('end-game', ({ code }) => {
        const room = rooms[code];
        if (!room) return;
        const finalScores = _playerList(code).sort((a, b) => b.score - a.score);
        io.to(code).emit('game-over', { finalScores, code });
        delete rooms[code];
    });

    socket.on('disconnect', () => {
        for (const code in rooms) {
            if (rooms[code].players[socket.id]) {
                delete rooms[code].players[socket.id];
                io.to(code).emit('room-update', { players: _playerList(code) });
                if (Object.keys(rooms[code].players).length === 0) delete rooms[code];
            }
        }
    });

    // ── helpers ──
    function _playerList(code) {
        const room = rooms[code];
        if (!room) return [];
        const humans = Object.values(room.players).map(p => ({
            username: p.username, score: p.score, hasAnswered: p.hasAnswered, isBot: false
        }));
        const bots = (room.bots || []).map(b => ({
            username: b.username, score: b.score, hasAnswered: b.hasAnswered, isBot: true
        }));
        return [...humans, ...bots];
    }

    function _revealAnswers(code) {
        const room = rooms[code];
        if (!room?.currentQuestion) return;
        io.to(code).emit('all-answered', {
            answers:       Object.values(room.answers),
            correctAnswer: room.currentQuestion.correct_answer,
            explanation:   room.currentQuestion.explanation
        });
    }
});

// ── Start Server ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

async function main() {
    await db.init();
    server.listen(PORT, () => {
        console.log(`\nFlowMaster running → http://localhost:${PORT}\n`);
    });
}
main().catch(err => { console.error('Startup failed:', err); process.exit(1); });

module.exports = { app, server };
