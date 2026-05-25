// api/verify-payment.js — Ready4Exam Vercel Serverless Function
const crypto = require('crypto');
const admin  = require('firebase-admin');

// ─── Email helper with Username and Reset Link Support ──────────────────────
async function sendConfirmationEmail({ toEmail, studentName, username, planLabel, durationLabel, amountPaise, expiryDate, resetLink }) {
    try {
        const smtpFrom = process.env.SMTP_FROM;
        const smtpPass = process.env.SMTP_PASS;

        if (!smtpFrom || !smtpPass) {
            console.warn('[EMAIL] SMTP_FROM or SMTP_PASS not set — skipping confirmation email.');
            return;
        }

        const nodemailer   = require('nodemailer');
        const transporter  = nodemailer.createTransport({
            service: 'gmail',
            auth:    { user: smtpFrom, pass: smtpPass }
        });

        const amountINR = (amountPaise / 100).toLocaleString('en-IN');
        const expiryStr = expiryDate.toLocaleDateString('en-IN', {
            day: 'numeric', month: 'long', year: 'numeric'
        });

        const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <tr><td style="background:#1a3e6a;padding:32px 40px;border-radius:16px 16px 0 0;text-align:center;">
          <h1 style="margin:0;color:#ffbe0b;font-size:26px;font-weight:900;letter-spacing:-0.5px;">Ready4Exam</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.65);font-size:11px;text-transform:uppercase;letter-spacing:2px;">Payment Confirmation</p>
        </td></tr>

        <tr><td style="background:#ffffff;padding:40px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;">

          <p style="margin:0 0 8px;color:#0f172a;font-size:17px;font-weight:700;">Dear ${studentName},</p>
          <p style="margin:0 0 28px;color:#475569;font-size:14px;line-height:1.7;">
            Your payment has been successfully received and your Ready4Exam account is now active.
          </p>

          <div style="background:#f1f5f9; border-radius:12px; padding:20px; margin-bottom:32px; border: 1px dashed #cbd5e1;">
            <p style="margin:0 0 10px; color:#64748b; font-size:12px; font-weight:700; text-transform:uppercase;">Your Login Credentials</p>
            <p style="margin:0 0 5px; color:#0f172a; font-size:14px;"><strong>Username:</strong> <code style="background:#fff; padding:2px 6px; border-radius:4px; border:1px solid #e2e8f0;">${username}</code></p>
            <p style="margin:0; color:#475569; font-size:12px;">Password: (The one you chose during registration)</p>
          </div>

          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:0;margin-bottom:32px;">
            <tr style="border-bottom:1px solid #e2e8f0;">
              <td style="padding:14px 20px;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Plan</td>
              <td style="padding:14px 20px;color:#0f172a;font-size:14px;font-weight:700;text-align:right;">${planLabel}</td>
            </tr>
            <tr style="border-bottom:1px solid #e2e8f0;">
              <td style="padding:14px 20px;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Duration</td>
              <td style="padding:14px 20px;color:#0f172a;font-size:14px;font-weight:700;text-align:right;">${durationLabel}</td>
            </tr>
            <tr style="border-bottom:1px solid #e2e8f0;">
              <td style="padding:14px 20px;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Amount Paid</td>
              <td style="padding:14px 20px;color:#16a34a;font-size:20px;font-weight:900;text-align:right;">₹${amountINR}</td>
            </tr>
            <tr>
              <td style="padding:14px 20px;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Access Valid Until</td>
              <td style="padding:14px 20px;color:#1a3e6a;font-size:14px;font-weight:700;text-align:right;">${expiryStr}</td>
            </tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
            <tr>
              <td align="center" style="padding-bottom:15px;">
                <a href="https://ready4exam.in/"
                   style="display:inline-block;background:#1a3e6a;color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:12px;font-size:14px;font-weight:900;letter-spacing:0.3px;width:200px;">
                  Login to Dashboard
                </a>
              </td>
            </tr>
            <tr>
              <td align="center">
                <a href="${resetLink}"
                   style="display:inline-block;background:#ffffff;color:#1a3e6a;text-decoration:none;padding:12px 40px;border-radius:12px;font-size:13px;font-weight:700;border:1px solid #1a3e6a;width:200px;">
                  Reset Password
                </a>
              </td>
            </tr>
          </table>

          <p style="margin:0 0 6px;color:#94a3b8;font-size:12px;">
            Need help? WhatsApp us at <strong style="color:#64748b;">+91 85209 77573</strong>
          </p>
          <p style="margin:0;color:#cbd5e1;font-size:11px;">
            &copy; 2026 Ready4Exam Academic Portal. All rights reserved.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

        await transporter.sendMail({
            from:    `"Ready4Exam Academy" <${smtpFrom}>`,
            to:      toEmail,
            subject: `✅ Payment Confirmed — ${planLabel} (${durationLabel})`,
            html
        });
    } catch (emailErr) {
        console.error('[EMAIL] Failed to send confirmation email:', emailErr.message);
    }
}

// ─── Main handler ────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
    // ... CORS AND FIREBASE INIT REMAIN THE SAME ...
    const origin = req.headers.origin;
    const allowedOrigins = ['https://ready4exam.in','https://www.ready4exam.in','https://karnkeshav.github.io','https://masterpage-1.vercel.app',process.env.ALLOWED_ORIGIN].filter(Boolean);
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') { return res.status(405).json({ error: 'Method Not Allowed' }); }

    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId:   process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
            })
        });
    }
    const db   = admin.firestore();
    const auth = admin.auth();

    try {
        const { razorpay_payment_id, razorpay_order_id, razorpay_signature, pendingRegistrationId, verificationToken } = req.body;

        // Signature and Transaction logic remain same...
        const secret = process.env.RAZORPAY_KEY_SECRET;
        const generatedSignature = crypto.createHmac('sha256', secret).update(razorpay_order_id + '|' + razorpay_payment_id).digest('hex');
        if (generatedSignature !== razorpay_signature) return res.status(400).json({ error: 'Invalid payment signature.' });

        const pendingRef = db.collection('pending_registrations').doc(pendingRegistrationId);
        const pendingData = await db.runTransaction(async (t) => {
            const pendingDoc = await t.get(pendingRef);
            if (!pendingDoc.exists) throw new Error("Registration record not found.");
            const data = pendingDoc.data();
            if (data.status === 'completed') throw new Error("Order already processed.");
            if (data.verificationToken !== verificationToken) throw new Error("Invalid verification token.");
            t.update(pendingRef, { status: 'processing' });
            return data;
        });

        // Create/Import User logic remains same...
        let userRecord;
        const stableUid = crypto.randomUUID();
        const userImportResult = await auth.importUsers([{
            uid: stableUid,
            email: pendingData.profileData.email,
            displayName: pendingData.profileData.displayName,
            passwordHash: Buffer.from(pendingData.hashedPassword)
        }], { hash: { algorithm: 'BCRYPT' } });

        if (userImportResult.errors.length > 0 && userImportResult.errors[0].error.code === 'auth/email-already-exists') {
            userRecord = await auth.getUserByEmail(pendingData.profileData.email);
        } else {
            userRecord = await auth.getUser(stableUid);
        }

        // Expiry calculation and activeModules assignment...
        const expiry = new Date();
        const duration = pendingData.duration || '3m';
        if (duration === '3y') expiry.setFullYear(expiry.getFullYear() + 3);
        else if (duration === '1y') expiry.setFullYear(expiry.getFullYear() + 1);
        else expiry.setDate(expiry.getDate() + 90);

        const activeModules = ["SimpleQuizzes", "MediumQuizzes", "AdvancedQuizzes"];
        const pID = pendingData.planID;
        if (['strategist', 'sync'].includes(pID)) activeModules.push("MistakeNotebook", "KnowledgeHub", "BehavioralAnalytics", "DiagnosticConsole");
        if (['sync', 'board_parent'].includes(pID)) activeModules.push("ParentConsole");
        if (['board_self', 'board_parent', 'board_ready'].includes(pID)) activeModules.push("PYQ_Insights", "WeightageAnalytics", "MarkingGuides");

        // Batch write profile and ledger events...
        const batch = db.batch();
        batch.set(db.collection('users').doc(userRecord.uid), {
            ...pendingData.profileData,
            uid: userRecord.uid,
            status: "active",
            activeModules,
            subscriptionTier: pID,
            duration,
            accessExpiryDate: admin.firestore.Timestamp.fromDate(expiry),
            activationDate: admin.firestore.FieldValue.serverTimestamp()
        });
        batch.update(pendingRef, { status: 'completed', uid: userRecord.uid, completedAt: admin.firestore.FieldValue.serverTimestamp() });
        await batch.commit();

        // ── NEW: Generate Password Reset Link ────────────────────────────────
        // We generate the link for the student's email, but send it to the parent address.
        const resetLink = await auth.generatePasswordResetLink(pendingData.profileData.email);

        // ── UPDATED: Call email helper with Username and Reset Link ──────────
        await sendConfirmationEmail({
            toEmail:       pendingData.profileData.parentEmail,
            studentName:   pendingData.profileData.displayName,
            username:      pendingData.profileData.username, // From profileData
            planLabel:     pendingData.planLabel     || pID,
            durationLabel: pendingData.durationLabel || duration,
            amountPaise:   pendingData.amountPaise,
            expiryDate:    expiry,
            resetLink:     resetLink // Newly generated link
        });

        const customToken = await auth.createCustomToken(userRecord.uid);
        return res.status(200).json({ success: true, customToken });

    } catch (error) {
        console.error("Verification Error:", error);
        return res.status(500).json({ error: error.message });
    }
};
