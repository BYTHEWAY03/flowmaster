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

    // Host starts the game — all clients navigate to /game/:code
    socket.on('start-game', ({ code }) => {
        if (rooms[code]) io.to(code).emit('game-started', { code });
    });

    // Host sends a question (random or card-specific) to all players
    socket.on('send-question', ({ code, question }) => {
        if (!rooms[code]) return;
        rooms[code].currentQuestion = question;
        rooms[code].answers = {};
        rooms[code].round  += 1;
        for (const id in rooms[code].players) rooms[code].players[id].hasAnswered = false;

        // Strip correct_answer and explanation so clients cannot inspect them
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
            round: rooms[code].round
        });
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

        // Private result to the answering player
        socket.emit('answer-result', {
            isCorrect,
            correctAnswer: question.correct_answer,
            explanation:   question.explanation,
            points,
            totalScore:    player.score
        });

        // Broadcast updated scores to everyone
        io.to(code).emit('score-update', { players: _playerList(code) });

        // Auto-reveal when all players have answered
        const allDone = Object.values(room.players).every(p => p.hasAnswered);
        if (allDone) _revealAnswers(code);
    });

    // Host manually reveals answer before all players have answered
    socket.on('reveal-answer', ({ code }) => _revealAnswers(code));

    // Host ends the game
    socket.on('end-game', ({ code }) => {
        const room = rooms[code];
        if (!room) return;
        const finalScores = Object.values(room.players).sort((a, b) => b.score - a.score);
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
        return Object.values(rooms[code]?.players || {}).map(p => ({
            username:   p.username,
            score:      p.score,
            hasAnswered: p.hasAnswered
        }));
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
