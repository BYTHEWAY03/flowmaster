const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcrypt');
const crypto   = require('crypto');
const db       = require('../config/db');
const { sendOTP } = require('../services/emailService');

// ── In-memory OTP store ─────────────────────────────────────────
// { email → { code, purpose, attempts, expiresAt, pendingUser } }
const otpStore = new Map();

function generateOTP() {
    return crypto.randomInt(100000, 999999).toString();
}

function maskEmail(email) {
    const [local, domain] = email.split('@');
    return local.slice(0, 2) + '***@' + domain;
}

function storeOTP(email, code, purpose, pendingUser = null) {
    otpStore.set(email.toLowerCase(), {
        code,
        purpose,
        attempts:    0,
        expiresAt:   Date.now() + 5 * 60 * 1000,
        pendingUser
    });
}

function validateOTP(email, code, purpose) {
    const key   = email.toLowerCase();
    const entry = otpStore.get(key);

    if (!entry)                     return { valid: false, error: 'No verification code found. Please request a new one.' };
    if (Date.now() > entry.expiresAt) { otpStore.delete(key); return { valid: false, error: 'Code has expired. Please request a new one.' }; }
    if (entry.purpose !== purpose)  return { valid: false, error: 'Invalid verification attempt.' };

    entry.attempts++;
    if (entry.attempts > 3) {
        otpStore.delete(key);
        return { valid: false, error: 'Too many failed attempts. Please request a new code.' };
    }
    if (entry.code !== code) {
        const left = 4 - entry.attempts;
        return { valid: false, error: `Incorrect code. ${left} attempt${left !== 1 ? 's' : ''} remaining.` };
    }

    const pendingUser = entry.pendingUser;
    otpStore.delete(key);
    return { valid: true, pendingUser };
}

// ── REGISTER — Step 1: validate input, send OTP ─────────────────
router.post('/register', async (req, res) => {
    const { username, email, password, role } = req.body;

    if (!username || !email || !password)
        return res.status(400).json({ error: 'All fields are required' });
    if (username.trim().length < 3)
        return res.status(400).json({ error: 'Username must be at least 3 characters' });
    if (password.length < 6)
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return res.status(400).json({ error: 'Invalid email address' });

    try {
        // Check duplicates before sending OTP
        const [existing] = await db.execute(
            'SELECT id FROM users WHERE email = ? OR username = ?',
            [email.toLowerCase(), username.trim()]
        );
        if (existing.length > 0)
            return res.status(409).json({ error: 'Username or email already exists' });

        const passwordHash = await bcrypt.hash(password, 10);
        const safeRole     = role === 'instructor' ? 'instructor' : 'student';
        const otp          = generateOTP();

        storeOTP(email, otp, 'register', {
            username: username.trim(),
            email:    email.toLowerCase(),
            passwordHash,
            role: safeRole
        });

        await sendOTP(email, otp, 'register');
        res.json({ requiresOtp: true, maskedEmail: maskEmail(email), message: 'Verification code sent to your email' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── REGISTER — Step 2: verify OTP and create account ───────────
router.post('/verify-register', async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp)
        return res.status(400).json({ error: 'Email and code are required' });

    const result = validateOTP(email, otp.trim(), 'register');
    if (!result.valid)
        return res.status(400).json({ error: result.error });

    const { username, email: userEmail, passwordHash, role } = result.pendingUser;
    try {
        const [row] = await db.execute(
            'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
            [username, userEmail, passwordHash, role]
        );
        req.session.user = { id: row.insertId, username, email: userEmail, role };
        res.status(201).json({ message: 'Account created successfully', user: req.session.user });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY')
            return res.status(409).json({ error: 'Username or email already exists' });
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── LOGIN — Step 1: validate credentials, send OTP ─────────────
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
        return res.status(400).json({ error: 'Email and password are required' });

    try {
        const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
        if (rows.length === 0)
            return res.status(401).json({ error: 'Invalid email or password' });

        const user    = rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch)
            return res.status(401).json({ error: 'Invalid email or password' });

        const otp = generateOTP();
        storeOTP(user.email, otp, 'login', {
            id: user.id, username: user.username, email: user.email, role: user.role
        });

        await sendOTP(user.email, otp, 'login');
        res.json({ requiresOtp: true, maskedEmail: maskEmail(user.email), message: 'Verification code sent to your email' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── LOGIN — Step 2: verify OTP and create session ──────────────
router.post('/verify-login', async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp)
        return res.status(400).json({ error: 'Email and code are required' });

    const result = validateOTP(email, otp.trim(), 'login');
    if (!result.valid)
        return res.status(400).json({ error: result.error });

    req.session.user = result.pendingUser;
    res.json({ message: 'Login successful', user: req.session.user });
});

// ── RESEND OTP ─────────────────────────────────────────────────
router.post('/resend-otp', async (req, res) => {
    const { email, purpose } = req.body;
    if (!email || !purpose)
        return res.status(400).json({ error: 'Email and purpose are required' });

    const existing = otpStore.get(email.toLowerCase());
    if (!existing)
        return res.status(400).json({ error: 'No pending verification. Please start over.' });

    const otp = generateOTP();
    storeOTP(email, otp, purpose, existing.pendingUser);

    try {
        await sendOTP(email, otp, purpose);
        res.json({ message: 'New code sent', maskedEmail: maskEmail(email) });
    } catch (err) {
        res.status(500).json({ error: 'Failed to send email' });
    }
});

// ── LOGOUT ─────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
    req.session.destroy(() => res.json({ message: 'Logged out successfully' }));
});

// ── GET CURRENT USER ───────────────────────────────────────────
router.get('/me', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
    res.json({ user: req.session.user });
});

module.exports = router;
