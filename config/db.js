require('dotenv').config();
const bcrypt = require('bcrypt');

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

const SEED_QUESTIONS = [
    // EASY (10 pts)
    ['What is the output of the following code?','x = 10\nif x > 5:\n    print("big")\nelse:\n    print("small")','small','big','Error','Nothing is printed','B','x = 10 is greater than 5, so the if-condition is True and "big" is printed.','easy','if-else',10],
    ['What is the output of the following code?','for i in range(3):\n    print(i)','1 2 3','0 1 2 3','0\n1\n2','1\n2','C','range(3) generates 0, 1, 2. Each is printed on its own line.','easy','for-loop',10],
    ['Which keyword skips the rest of the current loop iteration and moves to the next one?',null,'skip','break','continue','pass','C','continue skips remaining statements in the current iteration and jumps to the next one.','easy','loop-control',10],
    ['What is the output of the following code?','x = 5\nif x > 10:\n    print("A")\nelif x > 3:\n    print("B")\nelse:\n    print("C")','A','B','C','A and B','B','x = 5 fails x > 10 but satisfies x > 3, so "B" is printed.','easy','if-elif-else',10],
    ['How many times will the loop body execute?','for i in range(5):\n    pass','4','5','6','0','B','range(5) produces five values (0-4). The loop body runs once per value: 5 times total.','easy','for-loop',10],
    ['What is the output of the following code?','x = 7\nif x % 2 == 0:\n    print("even")\nelse:\n    print("odd")','even','odd','7','Error','B','7 % 2 = 1, not 0, so the condition is False and the else block prints "odd".','easy','if-else',10],
    ['Which keyword immediately exits the nearest enclosing loop?',null,'exit','stop','end','break','D','break immediately terminates the loop and transfers control to the statement after it.','easy','loop-control',10],
    ['What does the following code print?','x = 0\nwhile x < 3:\n    x += 1\nprint(x)','0','2','3','4','C','x increments until it reaches 3. print(x) after the loop outputs 3.','easy','while-loop',10],
    ['What is the output of the following code?','for i in range(1, 4):\n    print(i)','0\n1\n2\n3','1\n2\n3\n4','1\n2\n3','0\n1\n2','C','range(1, 4) starts at 1 and stops before 4, generating 1, 2, 3.','easy','for-loop',10],
    ['What is the output of the following code?','if True:\n    print("yes")\nelse:\n    print("no")','yes','no','True','Error','A','The condition is True, so the if block runs and prints "yes".','easy','if-else',10],
    // MEDIUM (20 pts)
    ['What is the output of the following code?','numbers = [1, 2, 3, 4, 5]\nfor n in numbers:\n    if n % 2 == 0:\n        continue\n    print(n)','1\n2\n3\n4\n5','2\n4','1\n3\n5','1\n2\n3','C','continue skips even numbers. Only odd numbers 1, 3, 5 are printed.','medium','loop-control',20],
    ['What does the following code print?','total = 0\nfor i in range(1, 6):\n    total += i\nprint(total)','10','15','21','5','B','1+2+3+4+5 = 15. range(1, 6) generates 1 through 5.','medium','for-loop',20],
    ['What is the output of the following code?','x = 15\nif x > 20:\n    print("A")\nelif x > 10:\n    print("B")\nelif x > 5:\n    print("C")\nelse:\n    print("D")','A','B','C','B and C','B','x = 15 satisfies x > 10, so "B" is printed. Remaining branches are skipped.','medium','if-elif-else',20],
    ['What is the output of the following code?','for i in range(4):\n    if i == 2:\n        break\n    print(i)','0\n1\n2','0\n1','0\n1\n2\n3','0','B','Prints 0 and 1. When i == 2, break exits the loop before print(i) runs.','medium','loop-control',20],
    ['What is the output of the following code?','result = []\nfor i in range(5):\n    if i % 2 == 0:\n        result.append(i)\nprint(result)','[1, 3]','[0, 2, 4]','[0, 1, 2, 3, 4]','[2, 4]','B','Even values in range(5) are 0, 2, 4. These are appended to result.','medium','for-loop',20],
    ['What is printed by the following code?','x = 5\ny = 10\nif x > 3 and y < 20:\n    print("yes")\nelse:\n    print("no")','yes','no','Error','yes\nno','A','Both x > 3 and y < 20 are True, so "yes" is printed.','medium','if-else',20],
    ['What is the value of i printed after the loop?','i = 10\nwhile i > 0:\n    i -= 3\nprint(i)','0','1','-2','-3','C','i goes 10→7→4→1→-2. At -2 the condition i > 0 is False, loop ends.','medium','while-loop',20],
    ['How many times is count incremented?','count = 0\nfor i in range(10):\n    if i % 2 == 0:\n        count += 1\nprint(count)','4','5','6','10','B','Even numbers in range(10): 0,2,4,6,8 — five of them.','medium','for-loop',20],
    ['What does the pass statement do inside a loop?','for i in range(3):\n    pass','Exits the loop immediately','Skips to the next iteration','Does nothing; acts as a placeholder','Pauses execution for 1 second','C','pass is a no-op placeholder. The loop still runs all iterations; each body does nothing.','medium','loop-control',20],
    ['What is the output of the following code?','x = True\nif x:\n    if not x:\n        print("A")\n    else:\n        print("B")\nelse:\n    print("C")','A','B','C','Error','B','Outer if: x is True. Inner if: not x is False → inner else prints "B".','medium','if-else',20],
    // HARD (30 pts)
    ['What is the output of the following code?','x = [i**2 for i in range(4) if i % 2 == 0]\nprint(x)','[0, 4, 16]','[0, 4]','[1, 4, 9, 16]','[0, 1, 4, 9]','B','range(4) = 0,1,2,3. Even i: 0 and 2. 0**2=0, 2**2=4. Result: [0, 4].','hard','comprehension',30],
    ['What is the output of the following code?','result = 0\nfor i in range(5):\n    if i % 2 == 0:\n        result += i\n    else:\n        result -= i\nprint(result)','2','-2','10','0','A','Evens add: 0+2+4=6. Odds subtract: 1+3=4. 6-4=2.','hard','for-loop',30],
    ['What is the output of the following code?','i = 0\nwhile True:\n    i += 1\n    if i == 5:\n        break\nprint(i)','4','5','Infinite loop — never prints','6','B','while True runs until break. break fires when i == 5, then print(i) outputs 5.','hard','while-loop',30],
    ['What does the following code print?','for i in range(1, 4):\n    for j in range(1, 4):\n        if i == j:\n            continue\n        if i + j == 5:\n            print(i, j)','1 4\n4 1','2 3\n3 2','1 4','2 3','B','With i,j in 1-3: 2+3=5 (2≠3) and 3+2=5 (3≠2). Prints "2 3" then "3 2".','hard','nested-loops',30],
    ['What is the output of the following code?','found = False\nfor i in range(1, 10):\n    if i * i == 49:\n        found = True\n        break\nprint(found)','False','True','7','Error','B','When i=7, 7*7=49. found is set True and break exits. print(found) outputs True.','hard','loop-control',30],
    ['What is the output of the following code?','matrix = [[1,2],[3,4],[5,6]]\ntotal = 0\nfor row in matrix:\n    for val in row:\n        total += val\nprint(total)','15','21','12','18','B','1+2+3+4+5+6 = 21. The nested loop sums every element in the 2D list.','hard','nested-loops',30],
    ['What is the output of the following code?','x = 5\nresult = "big" if x > 3 else "small"\nprint(result)','big','small','True','Error','A','Conditional expression: x > 3 is True, so result = "big".','hard','if-else',30],
    ['What does the following code print?','nums = [1, 2, 3, 4, 5, 6]\nprint(len([x for x in nums if x % 2 == 0]),\n      len([x for x in nums if x % 2 != 0]))','3 3','2 4','4 2','3 4','A','Evens: [2,4,6] length 3. Odds: [1,3,5] length 3. Output: "3 3".','hard','comprehension',30],
    ['What is the output of the following code?','def check(n):\n    if n < 0:\n        return "negative"\n    elif n == 0:\n        return "zero"\n    else:\n        return "positive"\nprint(check(-5))','positive','zero','negative','Error','C','n=-5: n < 0 is True, so "negative" is returned and printed.','hard','if-elif-else',30],
    ['What is the output of the following code?','count = 0\nfor i in range(10):\n    if i % 3 == 0:\n        count += 1\nprint(count)','3','4','5','2','B','Multiples of 3 in range(10): 0,3,6,9 — four values. count is incremented 4 times.','hard','for-loop',30],
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
    if (parseInt(qs[0].count) === 0) {
        for (const q of SEED_QUESTIONS) {
            await execute(
                `INSERT INTO questions
                 (question_text, code_snippet, option_a, option_b, option_c, option_d,
                  correct_answer, explanation, difficulty, category, points)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                q
            );
        }
        console.log('30 questions seeded');
    }
}

module.exports = { execute, init };
