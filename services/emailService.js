const https = require('https');
const nodemailer = require('nodemailer');

async function sendOTP(email, otp, purpose) {
    const isLogin = purpose === 'login';
    const subject = isLogin ? 'Your FlowMaster Login Code' : 'Verify Your FlowMaster Account';
    const heading = isLogin ? 'Login Verification' : 'Email Verification';
    const body    = isLogin
        ? 'Someone (hopefully you) is trying to sign in to FlowMaster. Use the code below to complete login.'
        : 'Welcome! Use the code below to verify your email and activate your account.';

    const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0a0a1a;border-radius:16px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#7c3aed,#a855f7);padding:2rem;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:1.8rem;letter-spacing:-1px">⚡ FlowMaster</h1>
        <p style="color:rgba(255,255,255,0.7);margin:.25rem 0 0">Educational Hybrid Game</p>
      </div>
      <div style="padding:2rem;color:#f1f5f9">
        <h2 style="font-size:1.2rem;margin:0 0 .75rem">${heading}</h2>
        <p style="color:#94a3b8;line-height:1.6;margin:0 0 1.5rem">${body}</p>
        <div style="background:#1e1e3a;border:2px solid #7c3aed;border-radius:12px;padding:1.75rem;text-align:center;margin-bottom:1.5rem">
          <p style="color:#94a3b8;font-size:.8rem;margin:0 0 .5rem;text-transform:uppercase;letter-spacing:.1rem">Your one-time code</p>
          <span style="font-size:3rem;font-weight:800;letter-spacing:.6rem;color:#a855f7;font-family:'Courier New',monospace">${otp}</span>
        </div>
        <div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:8px;padding:.75rem 1rem;margin-bottom:1.5rem">
          <p style="color:#fca5a5;margin:0;font-size:.85rem">
            ⏱ This code expires in <strong>5 minutes</strong>. Do not share it with anyone.
          </p>
        </div>
        <p style="color:#64748b;font-size:.78rem;margin:0">
          If you did not request this code, you can safely ignore this email.
        </p>
      </div>
      <div style="background:#0f0f20;padding:1rem;text-align:center">
        <p style="color:#475569;font-size:.75rem;margin:0">© 2026 FlowMaster · CT117-3-2-FWDD Assignment</p>
      </div>
    </div>`;

    // ── Brevo HTTP API (preferred — works on all platforms) ──────
    if (process.env.BREVO_API_KEY) {
        const payload = JSON.stringify({
            sender:      { name: 'FlowMaster Security', email: 'noreply@flowmaster-game.com' },
            to:          [{ email }],
            subject,
            htmlContent: html
        });
        await new Promise((resolve, reject) => {
            const req = https.request({
                hostname: 'api.brevo.com',
                path:     '/v3/smtp/email',
                method:   'POST',
                headers: {
                    'Content-Type':  'application/json',
                    'api-key':       process.env.BREVO_API_KEY,
                    'Content-Length': Buffer.byteLength(payload)
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 400) reject(new Error(`Brevo API error ${res.statusCode}: ${data}`));
                    else resolve();
                });
            });
            req.on('error', reject);
            req.write(payload);
            req.end();
        });
        return;
    }

    // ── Gmail fallback ───────────────────────────────────────────
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });
        await transporter.sendMail({
            from: `"FlowMaster Security" <${process.env.EMAIL_USER}>`,
            to: email, subject, html
        });
        return;
    }

    // ── Console fallback (no email configured) ───────────────────
    console.log('\n' + '═'.repeat(52));
    console.log(`  OTP  →  ${otp}  (sent to: ${email})`);
    console.log(`  Purpose: ${purpose}  |  Valid for 5 minutes`);
    console.log('═'.repeat(52) + '\n');
}

module.exports = { sendOTP };
