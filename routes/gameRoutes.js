const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireLogin } = require('../middleware/auth');

const generateCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

// Create game session
router.post('/create', requireLogin, async (req, res) => {
    const { difficulty, maxPlayers, totalRounds } = req.body;
    const hostId = req.session.user.id;

    if (!difficulty) return res.status(400).json({ error: 'Difficulty is required' });

    let code;
    let attempts = 0;
    while (attempts < 10) {
        code = generateCode();
        const [existing] = await db.execute('SELECT id FROM game_sessions WHERE session_code = ?', [code]);
        if (existing.length === 0) break;
        attempts++;
    }

    try {
        const [result] = await db.execute(
            'INSERT INTO game_sessions (session_code, host_id, difficulty, max_players, total_rounds) VALUES (?, ?, ?, ?, ?)',
            [code, hostId, difficulty, parseInt(maxPlayers) || 6, parseInt(totalRounds) || 10]
        );
        await db.execute(
            'INSERT INTO game_players (session_id, user_id, is_host) VALUES (?, ?, 1)',
            [result.insertId, hostId]
        );

        req.session.currentGame = code;
        res.json({ sessionCode: code, sessionId: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create game session' });
    }
});

// Join game session
router.post('/join', requireLogin, async (req, res) => {
    const { sessionCode } = req.body;
    const userId = req.session.user.id;

    if (!sessionCode) return res.status(400).json({ error: 'Session code is required' });

    try {
        const [sessions] = await db.execute(
            "SELECT * FROM game_sessions WHERE session_code = ? AND status = 'waiting'",
            [sessionCode.toUpperCase()]
        );
        if (sessions.length === 0) return res.status(404).json({ error: 'Game not found or already started' });

        const session = sessions[0];
        const [players] = await db.execute(
            'SELECT COUNT(*) as count FROM game_players WHERE session_id = ?',
            [session.id]
        );
        if (players[0].count >= session.max_players) return res.status(400).json({ error: 'Game is full' });

        const [existing] = await db.execute(
            'SELECT id FROM game_players WHERE session_id = ? AND user_id = ?',
            [session.id, userId]
        );
        if (existing.length === 0) {
            await db.execute('INSERT INTO game_players (session_id, user_id) VALUES (?, ?)', [session.id, userId]);
        }

        req.session.currentGame = sessionCode.toUpperCase();
        res.json({ sessionCode: session.session_code, sessionId: session.id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to join game session' });
    }
});

// Get session details
router.get('/:code', requireLogin, async (req, res) => {
    try {
        const [sessions] = await db.execute(
            `SELECT gs.*, u.username AS host_name
             FROM game_sessions gs JOIN users u ON gs.host_id = u.id
             WHERE gs.session_code = ?`,
            [req.params.code.toUpperCase()]
        );
        if (sessions.length === 0) return res.status(404).json({ error: 'Game not found' });

        const session = sessions[0];
        const [players] = await db.execute(
            `SELECT gp.*, u.username FROM game_players gp
             JOIN users u ON gp.user_id = u.id
             WHERE gp.session_id = ? ORDER BY gp.score DESC`,
            [session.id]
        );
        res.json({ session, players });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Start game (host only)
router.post('/:code/start', requireLogin, async (req, res) => {
    try {
        const [sessions] = await db.execute(
            'SELECT * FROM game_sessions WHERE session_code = ? AND host_id = ?',
            [req.params.code.toUpperCase(), req.session.user.id]
        );
        if (sessions.length === 0) return res.status(403).json({ error: 'Only the host can start the game' });

        await db.execute("UPDATE game_sessions SET status = 'active' WHERE session_code = ?", [req.params.code.toUpperCase()]);
        res.json({ message: 'Game started' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Submit answer and persist to DB
router.post('/:code/answer', requireLogin, async (req, res) => {
    const { questionId, answer } = req.body;
    const userId = req.session.user.id;

    if (!questionId || !answer) return res.status(400).json({ error: 'Question ID and answer are required' });
    if (!['A', 'B', 'C', 'D'].includes(answer.toUpperCase())) {
        return res.status(400).json({ error: 'Answer must be A, B, C, or D' });
    }

    try {
        const [sessions] = await db.execute('SELECT * FROM game_sessions WHERE session_code = ?', [req.params.code.toUpperCase()]);
        if (sessions.length === 0) return res.status(404).json({ error: 'Game not found' });

        const session = sessions[0];
        const [questions] = await db.execute('SELECT * FROM questions WHERE id = ?', [questionId]);
        if (questions.length === 0) return res.status(404).json({ error: 'Question not found' });

        const question = questions[0];
        const isCorrect = answer.toUpperCase() === question.correct_answer;
        const pointsAwarded = isCorrect ? question.points : 0;

        const [players] = await db.execute(
            'SELECT * FROM game_players WHERE session_id = ? AND user_id = ?',
            [session.id, userId]
        );
        if (players.length === 0) return res.status(403).json({ error: 'You are not in this game' });

        const player = players[0];
        await db.execute(
            'INSERT INTO game_rounds (session_id, question_id, player_id, answer_given, is_correct, points_awarded) VALUES (?, ?, ?, ?, ?, ?)',
            [session.id, questionId, player.id, answer.toUpperCase(), isCorrect ? 1 : 0, pointsAwarded]
        );
        if (isCorrect) {
            await db.execute(
                'UPDATE game_players SET score = score + ?, position = position + ? WHERE id = ?',
                [pointsAwarded, pointsAwarded, player.id]
            );
        }

        res.json({
            isCorrect,
            correctAnswer: question.correct_answer,
            explanation: question.explanation,
            pointsAwarded,
            totalScore: player.score + pointsAwarded
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get leaderboard
router.get('/:code/leaderboard', requireLogin, async (req, res) => {
    try {
        const [sessions] = await db.execute('SELECT * FROM game_sessions WHERE session_code = ?', [req.params.code.toUpperCase()]);
        if (sessions.length === 0) return res.status(404).json({ error: 'Game not found' });

        const [players] = await db.execute(
            `SELECT gp.*, u.username
             FROM game_players gp JOIN users u ON gp.user_id = u.id
             WHERE gp.session_id = ? ORDER BY gp.score DESC`,
            [sessions[0].id]
        );
        res.json({ leaderboard: players, session: sessions[0] });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// End game (host only)
router.post('/:code/end', requireLogin, async (req, res) => {
    try {
        const [sessions] = await db.execute(
            'SELECT * FROM game_sessions WHERE session_code = ? AND host_id = ?',
            [req.params.code.toUpperCase(), req.session.user.id]
        );
        if (sessions.length === 0) return res.status(403).json({ error: 'Only the host can end the game' });

        await db.execute("UPDATE game_sessions SET status = 'finished' WHERE session_code = ?", [req.params.code.toUpperCase()]);
        res.json({ message: 'Game ended' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
