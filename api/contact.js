// api/contact.js — Onboarding request handler
// Sends notification email to ready4urexam@gmail.com and saves to Firestore.
//
// Required Vercel env vars:
//   GMAIL_USER            = ready4urexam@gmail.com
//   GMAIL_APP_PASSWORD    = 16-char App Password from Google Account → Security → App Passwords
//   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY  (same as other API fns)

const nodemailer = require('nodemailer');
const admin = require('firebase-admin');

const ALLOWED_ORIGINS = [
    'https://karnkeshav.github.io',
    'https://masterpage-1.vercel.app',
    process.env.ALLOWED_ORIGIN,
].filter(Boolean);

function setCORS(req, res) {
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
}

function initFirebase() {
    if (admin.apps.length) return admin.firestore();
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId:   process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
    });
    return admin.firestore();
}

module.exports = async (req, res) => {
    setCORS(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' });

    const { board, cls, contact } = req.body || {};
    if (!board || !cls || !contact) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    const submittedAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    // ── 1. Save to Firestore (non-fatal) ─────────────────────────────────────
    try {
        const db = initFirebase();
        await db.collection('onboarding_requests').add({
            board,
            cls,
            contact,
            status: 'new',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
    } catch (e) {
        console.warn('Firestore save skipped:', e.message);
    }

    // ── 2. Send email ─────────────────────────────────────────────────────────
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
        console.warn('Email env vars not set — skipping email delivery.');
        return res.status(200).json({ success: true });
    }

    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.GMAIL_USER,
                pass: process.env.GMAIL_APP_PASSWORD,
            },
        });

        await transporter.sendMail({
            from:    `"Ready4Exam Portal" <${process.env.GMAIL_USER}>`,
            to:      'ready4urexam@gmail.com',
            subject: `📋 New Onboarding Request — ${board} (Class ${cls})`,
            html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;">
    <div style="background:linear-gradient(135deg,#1a3e6a,#0f2849);padding:24px 28px;border-radius:14px 14px 0 0;">
      <p style="color:#f5a623;font-size:20px;font-weight:800;margin:0;">🎓 New Onboarding Request</p>
      <p style="color:rgba(255,255,255,0.55);font-size:12px;margin:6px 0 0;">Ready4Exam · Academic Portal</p>
    </div>
    <div style="background:#fff;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 14px 14px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;font-weight:600;width:120px;">Board</td>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#1e293b;font-weight:700;">${board}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;font-weight:600;">Class</td>
          <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#1e293b;font-weight:700;">${cls}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#64748b;font-weight:600;">Contact</td>
          <td style="padding:10px 0;color:#1a3e6a;font-weight:700;">${contact}</td>
        </tr>
      </table>
      <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;">Submitted: ${submittedAt} IST</p>
      <hr style="border:none;border-top:1px solid #f1f5f9;margin:16px 0;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">This request is also saved in Firestore under <code>onboarding_requests</code>.</p>
    </div>
  </div>
</body>
</html>`,
        });

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Email send error:', error);
        // Still return success — the Firestore backup is in place
        return res.status(200).json({ success: true, note: 'saved' });
    }
};
