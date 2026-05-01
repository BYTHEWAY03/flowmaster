const nodemailer = require('nodemailer');

function createTransporter() {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
    if (process.env.EMAIL_HOST) {
        return nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: parseInt(process.env.EMAIL_PORT) || 587,
            secure: false,
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });
    }
    return nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
}

async function sendOTP(email, otp, purpose) {
    const isLogin   = purpose === 'login';
    const subject   = isLogin ? 'Your FlowMaster Login Code' : 'Verify Your FlowMaster Account';
    const heading   = isLogin ? 'Login Verification' : 'Email Verification';
    const body      = isLogin
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
            ⏱ This code expires in <strong>5 minutes</strong>. Do not share it with anyone — FlowMaster staff will never ask for it.
          </p>
        </div>

        <p style="color:#64748b;font-size:.78rem;margin:0">
          If you did not request this code, you can safely ignore this email. Your account remains secure.
        </p>
      </div>
      <div style="background:#0f0f20;padding:1rem;text-align:center">
        <p style="color:#475569;font-size:.75rem;margin:0">© 2026 FlowMaster · CT117-3-2-FWDD Assignment</p>
      </div>
    </div>`;

    const transporter = createTransporter();
    if (!transporter) {
        // Console fallback — shown in the terminal when no Gmail is configured
        console.log('\n' + '═'.repeat(52));
        console.log(`  OTP  →  ${otp}  (sent to: ${email})`);
        console.log(`  Purpose: ${purpose}  |  Valid for 5 minutes`);
        console.log('═'.repeat(52) + '\n');
        return;
    }

    await transporter.sendMail({
        from: `"FlowMaster Security" <${process.env.EMAIL_USER}>`,
        to:   email,
        subject,
        html
    });
}

module.exports = { sendOTP };
