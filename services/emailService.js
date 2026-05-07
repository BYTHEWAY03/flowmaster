const https = require('https');

async function sendOTP(email, otp, purpose) {
    const isLogin  = purpose === 'login';
    const subject  = isLogin ? 'Your FlowMaster Login Code'    : 'Verify Your FlowMaster Account';
    const heading  = isLogin ? 'Login Verification'            : 'Email Verification';
    const bodyText = isLogin
        ? 'Someone (hopefully you) is trying to sign in to FlowMaster. Use the code below to complete your login.'
        : 'Welcome to FlowMaster! Use the code below to verify your email and activate your account.';

    const html = buildEmailHTML(heading, bodyText, otp);

    if (!process.env.BREVO_API_KEY) {
        console.log('\n' + '═'.repeat(52));
        console.log(`  OTP  →  ${otp}  (to: ${email})`);
        console.log(`  Purpose: ${purpose}  |  Expires in 5 minutes`);
        console.log('═'.repeat(52) + '\n');
        return;
    }

    await sendViaBrevo(email, subject, html);
}

// ── Brevo HTTP API ───────────────────────────────────────────────────────────
function sendViaBrevo(to, subject, html) {
    const senderEmail = process.env.BREVO_SENDER || 'kafi.iyad2004@gmail.com';

    const payload = JSON.stringify({
        sender:      { name: 'FlowMaster', email: senderEmail },
        to:          [{ email: to }],
        subject,
        htmlContent: html
    });

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.brevo.com',
            path:     '/v3/smtp/email',
            method:   'POST',
            headers: {
                'Content-Type':   'application/json',
                'api-key':        process.env.BREVO_API_KEY,
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const parsed = (() => { try { return JSON.parse(data); } catch { return {}; } })();
                if (res.statusCode >= 400) {
                    const msg = parsed.message || data;
                    console.error(`[Email] Brevo error ${res.statusCode}: ${msg}`);
                    reject(new Error(`Brevo ${res.statusCode}: ${msg}`));
                } else {
                    console.log(`[Email] OTP sent to ${to} — id: ${parsed.messageId}`);
                    resolve();
                }
            });
        });

        req.on('error', (err) => {
            console.error('[Email] Brevo request failed:', err.message);
            reject(err);
        });

        req.write(payload);
        req.end();
    });
}

// ── HTML Template ────────────────────────────────────────────────────────────
function buildEmailHTML(heading, bodyText, otp) {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0a0a1a;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr><td align="center" style="padding:40px 16px">
      <table width="520" cellpadding="0" cellspacing="0" role="presentation"
             style="max-width:520px;width:100%;background:#0d0d1f;border-radius:16px;overflow:hidden;border:1px solid #1e1e3a">
        <tr>
          <td style="background:linear-gradient(135deg,#7c3aed 0%,#a855f7 100%);padding:36px 32px;text-align:center">
            <div style="font-size:2rem;font-weight:900;color:#fff;letter-spacing:-1px">⚡ FlowMaster</div>
            <div style="color:rgba(255,255,255,0.65);font-size:.85rem;margin-top:4px">Educational Hybrid Game</div>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 32px">
            <h2 style="color:#f1f5f9;font-size:1.25rem;margin:0 0 12px">${heading}</h2>
            <p style="color:#94a3b8;line-height:1.7;margin:0 0 28px;font-size:.9rem">${bodyText}</p>
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="background:#12122a;border:2px solid #7c3aed;border-radius:12px;padding:28px 24px;text-align:center">
                  <div style="color:#94a3b8;font-size:.7rem;text-transform:uppercase;letter-spacing:.12rem;margin-bottom:12px">Your one-time code</div>
                  <div style="font-size:2.8rem;font-weight:800;letter-spacing:.55rem;color:#a855f7;font-family:'Courier New',Courier,monospace">${otp}</div>
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:20px">
              <tr>
                <td style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);border-radius:8px;padding:12px 16px">
                  <p style="color:#fca5a5;margin:0;font-size:.82rem;line-height:1.5">
                    ⏱ This code expires in <strong>5 minutes</strong>. Never share it with anyone.
                  </p>
                </td>
              </tr>
            </table>
            <p style="color:#475569;font-size:.75rem;margin:24px 0 0;line-height:1.5">
              If you did not request this code, you can safely ignore this email.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#080814;padding:20px 32px;text-align:center;border-top:1px solid #1e1e3a">
            <p style="color:#334155;font-size:.72rem;margin:0">© 2026 FlowMaster · CT117-3-2-FWDD Assignment</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

module.exports = { sendOTP };
