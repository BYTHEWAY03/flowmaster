const express = require('express');
const router = express.Router();
const db = require('../config/db');
const QRCode = require('qrcode');
const { requireInstructor } = require('../middleware/auth');

// Dashboard stats
router.get('/stats', requireInstructor, async (req, res) => {
    try {
        const [[students]] = await db.execute("SELECT COUNT(*) AS count FROM users WHERE role = 'student'");
        const [[questions]] = await db.execute('SELECT COUNT(*) AS count FROM questions');
        const [[sessions]] = await db.execute('SELECT COUNT(*) AS count FROM game_sessions');
        const [[answers]] = await db.execute('SELECT COUNT(*) AS count FROM game_rounds');
        res.json({
            totalStudents: students.count,
            totalQuestions: questions.count,
            totalSessions: sessions.count,
            totalAnswers: answers.count
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// All game sessions
router.get('/sessions', requireInstructor, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT gs.*, u.username AS host_name,
                    (SELECT COUNT(*) FROM game_players gp WHERE gp.session_id = gs.id) AS player_count
             FROM game_sessions gs
             JOIN users u ON gs.host_id = u.id
             ORDER BY gs.created_at DESC`
        );
        res.json({ sessions: rows });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// All users
router.get('/users', requireInstructor, async (req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC'
        );
        res.json({ users: rows });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// All questions
router.get('/questions', requireInstructor, async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM questions ORDER BY difficulty, id');
        res.json({ questions: rows });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Generate QR code for a question (physical card integration)
router.get('/qr/:questionId', requireInstructor, async (req, res) => {
    const baseUrl = req.protocol + '://' + req.get('host');
    const questionUrl = `${baseUrl}/q/${req.params.questionId}`;

    try {
        const qrDataUrl = await QRCode.toDataURL(questionUrl, {
            width: 300,
            margin: 2,
            color: { dark: '#6c3483', light: '#ffffff' }
        });
        res.json({ qrCode: qrDataUrl, url: questionUrl, questionId: req.params.questionId });
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});

// Delete a game session
router.delete('/sessions/:id', requireInstructor, async (req, res) => {
    try {
        await db.execute('DELETE FROM game_sessions WHERE id = ?', [req.params.id]);
        res.json({ message: 'Session deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
