require('dotenv').config();
const bcrypt = require('bcrypt');
const SEED_QUESTIONS = require('../data/questions');

const isPg = !!process.env.DATABASE_URL;

// ── Adapters ────────────────────────────────────────────────────
let pgPool, sqlite;

if (isPg) {
    const { Pool } = require('pg');
    pgPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
} else {
    const Database = require('better-sqlite3');
    const path = require('path');
    const dbPath = path.join(__dirname, '..', 'database', 'flowmaster.db');
    sqlite = new Database(dbPath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
}

// Convert ? placeholders → $1, $2, ... for PostgreSQL
function pgify(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
}

async function execute(sql, params = []) {
    if (isPg) {
        const upper = sql.trim().toUpperCase();
        let finalSql = pgify(sql);
        if (upper.startsWith('INSERT') && !upper.includes('RETURNING')) {
            finalSql = finalSql.replace(/;?\s*$/, ' RETURNING id');
        }
        try {
            const result = await pgPool.query(finalSql, params);
            if (upper.startsWith('SELECT') || upper.startsWith('WITH')) {
                return [result.rows, []];
            } else if (upper.startsWith('INSERT')) {
                return [{ insertId: result.rows[0]?.id ?? null, affectedRows: result.rowCount }, []];
            } else {
                return [{ insertId: null, affectedRows: result.rowCount }, []];
            }
        } catch (err) {
            if (err.code === '23505') err.code = 'ER_DUP_ENTRY';
            throw err;
        }
    } else {
        return new Promise((resolve, reject) => {
            try {
                const stmt  = sqlite.prepare(sql);
                const upper = sql.trim().toUpperCase();
                if (upper.startsWith('SELECT') || upper.startsWith('PRAGMA')) {
                    resolve([stmt.all(...params), []]);
                } else {
                    const info = stmt.run(...params);
                    resolve([{ insertId: info.lastInsertRowid, affectedRows: info.changes }, []]);
                }
            } catch (err) {
                if (err.message?.includes('UNIQUE constraint failed')) err.code = 'ER_DUP_ENTRY';
                reject(err);
            }
        });
    }
}

// ── Schemas ─────────────────────────────────────────────────────
const PG_TABLES = [
    `CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        username      TEXT UNIQUE NOT NULL,
        email         TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role          TEXT DEFAULT 'student',
        created_at    TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS questions (
        id             SERIAL PRIMARY KEY,
        question_text  TEXT NOT NULL,
        code_snippet   TEXT,
        option_a       TEXT NOT NULL,
        option_b       TEXT NOT NULL,
        option_c       TEXT NOT NULL,
        option_d       TEXT NOT NULL,
        correct_answer TEXT NOT NULL,
        explanation    TEXT NOT NULL,
        difficulty     TEXT NOT NULL,
        category       TEXT NOT NULL,
        points         INTEGER DEFAULT 10,
        created_at     TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS game_sessions (
        id            SERIAL PRIMARY KEY,
        session_code  TEXT UNIQUE NOT NULL,
        host_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        difficulty    TEXT DEFAULT 'mixed',
        status        TEXT DEFAULT 'waiting',
        max_players   INTEGER DEFAULT 6,
        total_rounds  INTEGER DEFAULT 10,
        current_round INTEGER DEFAULT 0,
        created_at    TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS game_players (
        id         SERIAL PRIMARY KEY,
        session_id INTEGER NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        score      INTEGER DEFAULT 0,
        position   INTEGER DEFAULT 0,
        is_host    INTEGER DEFAULT 0,
        joined_at  TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(session_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS game_rounds (
        id             SERIAL PRIMARY KEY,
        session_id     INTEGER NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
        question_id    INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
        player_id      INTEGER NOT NULL REFERENCES game_players(id) ON DELETE CASCADE,
        answer_given   TEXT,
        is_correct     INTEGER,
        points_awarded INTEGER DEFAULT 0,
        answered_at    TIMESTAMPTZ DEFAULT NOW()
    )`
];

const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT DEFAULT 'student',
    created_at    TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS questions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    question_text  TEXT NOT NULL,
    code_snippet   TEXT,
    option_a       TEXT NOT NULL,
    option_b       TEXT NOT NULL,
    option_c       TEXT NOT NULL,
    option_d       TEXT NOT NULL,
    correct_answer TEXT NOT NULL,
    explanation    TEXT NOT NULL,
    difficulty     TEXT NOT NULL,
    category       TEXT NOT NULL,
    points         INTEGER DEFAULT 10,
    created_at     TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS game_sessions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_code  TEXT UNIQUE NOT NULL,
    host_id       INTEGER NOT NULL,
    difficulty    TEXT DEFAULT 'mixed',
    status        TEXT DEFAULT 'waiting',
    max_players   INTEGER DEFAULT 6,
    total_rounds  INTEGER DEFAULT 10,
    current_round INTEGER DEFAULT 0,
    created_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS game_players (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    score      INTEGER DEFAULT 0,
    position   INTEGER DEFAULT 0,
    is_host    INTEGER DEFAULT 0,
    joined_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)    REFERENCES users(id)         ON DELETE CASCADE,
    UNIQUE(session_id, user_id)
);
CREATE TABLE IF NOT EXISTS game_rounds (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id     INTEGER NOT NULL,
    question_id    INTEGER NOT NULL,
    player_id      INTEGER NOT NULL,
    answer_given   TEXT,
    is_correct     INTEGER,
    points_awarded INTEGER DEFAULT 0,
    answered_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id)  REFERENCES game_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id)     ON DELETE CASCADE,
    FOREIGN KEY (player_id)   REFERENCES game_players(id)  ON DELETE CASCADE
);`;

// ── Seed data ────────────────────────────────────────────────────
const SEED_ACCOUNTS = [
    { username: 'instructor', email: 'instructor@flowmaster.com', password: 'admin123', role: 'instructor' },
    { username: 'student1',   email: 'student1@flowmaster.com',   password: 'pass123',  role: 'student' },
    { username: 'student2',   email: 'student2@flowmaster.com',   password: 'pass123',  role: 'student' },
];

// ── Init: create schema and seed ─────────────────────────────────
async function init() {
    if (isPg) {
        for (const sql of PG_TABLES) await pgPool.query(sql);
        console.log('PostgreSQL schema ready');
    } else {
        sqlite.exec(SQLITE_SCHEMA);
        console.log('SQLite schema ready');
    }

    const [users] = await execute('SELECT COUNT(*) as count FROM users');
    if (parseInt(users[0].count) === 0) {
        for (const a of SEED_ACCOUNTS) {
            const hash = await bcrypt.hash(a.password, 10);
            await execute(
                'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
                [a.username, a.email, hash, a.role]
            );
        }
        console.log('Default accounts created (instructor/admin123, student1/pass123)');
    }

    const [qs] = await execute('SELECT COUNT(*) as count FROM questions');
    const currentCount = parseInt(qs[0].count);
    if (currentCount < SEED_QUESTIONS.length) {
        let added = 0;
        for (const q of SEED_QUESTIONS) {
            try {
                await execute(
                    `INSERT INTO questions
                     (question_text, code_snippet, option_a, option_b, option_c, option_d,
                      correct_answer, explanation, difficulty, category, points)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    q
                );
                added++;
            } catch (e) {
                if (e.code !== 'ER_DUP_ENTRY') throw e;
            }
        }
        console.log(`${added} questions seeded (total: ${currentCount + added})`);
    }
}

module.exports = { execute, init };
