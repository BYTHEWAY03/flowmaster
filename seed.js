// Run with: node seed.js
// Creates default instructor and sample student accounts.
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function seed() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'flowmaster'
    });

    const users = [
        { username: 'instructor', email: 'instructor@flowmaster.com', password: 'admin123', role: 'instructor' },
        { username: 'student1',   email: 'student1@flowmaster.com',   password: 'pass123',  role: 'student' },
        { username: 'student2',   email: 'student2@flowmaster.com',   password: 'pass123',  role: 'student' }
    ];

    for (const u of users) {
        const hash = await bcrypt.hash(u.password, 10);
        try {
            await conn.execute(
                'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
                [u.username, u.email, hash, u.role]
            );
            console.log(`Created: ${u.username} (${u.role}) — password: ${u.password}`);
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                console.log(`Already exists: ${u.username}`);
            } else {
                throw err;
            }
        }
    }

    await conn.end();
    console.log('\nSeed complete. You can now login with the accounts above.');
}

seed().catch(console.error);
