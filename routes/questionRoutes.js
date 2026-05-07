const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireLogin, requireInstructor } = require('../middleware/auth');

// Get questions with optional filters
router.get('/', requireLogin, async (req, res) => {
    const { difficulty, limit, category } = req.query;

    try {
        let query = 'SELECT * FROM questions WHERE 1=1';
        const params = [];

        if (difficulty && difficulty !== 'mixed') {
            query += ' AND difficulty = ?';
            params.push(difficulty);
        }
        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }

        query += ' ORDER BY RANDOM()';

        if (limit && !isNaN(parseInt(limit))) {
            query += ' LIMIT ?';
            params.push(parseInt(limit));
        }

        const [rows] = await db.execute(query, params);
        res.json({ questions: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get single question by ID
router.get('/:id', async (req, res) => {
    if (isNaN(parseInt(req.params.id))) return res.status(400).json({ error: 'Invalid ID' });
    try {
        const [rows] = await db.execute('SELECT * FROM questions WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Question not found' });
        res.json({ question: rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Add question (instructor only)
router.post('/', requireInstructor, async (req, res) => {
    const { question_text, code_snippet, option_a, option_b, option_c, option_d,
        correct_answer, explanation, difficulty, category, points } = req.body;

    if (!question_text || !option_a || !option_b || !option_c || !option_d ||
        !correct_answer || !explanation || !difficulty || !category) {
        return res.status(400).json({ error: 'All required fields must be filled' });
    }
    if (!['A', 'B', 'C', 'D'].includes(correct_answer.toUpperCase())) {
        return res.status(400).json({ error: 'Correct answer must be A, B, C, or D' });
    }
    if (!['easy', 'medium', 'hard', 'expert'].includes(difficulty)) {
        return res.status(400).json({ error: 'Difficulty must be easy, medium, hard, or expert' });
    }

    try {
        const [result] = await db.execute(
            `INSERT INTO questions
             (question_text, code_snippet, option_a, option_b, option_c, option_d,
              correct_answer, explanation, difficulty, category, points)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [question_text, code_snippet || null, option_a, option_b, option_c, option_d,
             correct_answer.toUpperCase(), explanation, difficulty, category, parseInt(points) || 10]
        );
        res.status(201).json({ message: 'Question added', id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update question (instructor only)
router.put('/:id', requireInstructor, async (req, res) => {
    const { question_text, code_snippet, option_a, option_b, option_c, option_d,
        correct_answer, explanation, difficulty, category, points } = req.body;

    if (!question_text || !option_a || !option_b || !option_c || !option_d ||
        !correct_answer || !explanation || !difficulty || !category) {
        return res.status(400).json({ error: 'All required fields must be filled' });
    }

    try {
        await db.execute(
            `UPDATE questions SET question_text=?, code_snippet=?, option_a=?, option_b=?,
             option_c=?, option_d=?, correct_answer=?, explanation=?, difficulty=?,
             category=?, points=? WHERE id=?`,
            [question_text, code_snippet || null, option_a, option_b, option_c, option_d,
             correct_answer.toUpperCase(), explanation, difficulty, category,
             parseInt(points) || 10, req.params.id]
        );
        res.json({ message: 'Question updated' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete question (instructor only)
router.delete('/:id', requireInstructor, async (req, res) => {
    try {
        await db.execute('DELETE FROM questions WHERE id = ?', [req.params.id]);
        res.json({ message: 'Question deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
