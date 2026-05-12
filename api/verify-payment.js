// api/verify-payment.js — Ready4Exam Vercel Serverless Function
const crypto = require('crypto');
const admin  = require('firebase-admin');

// ─── Email helper (nodemailer — add to root package.json: "nodemailer": "^6.9.x")
// Env vars required in Vercel dashboard:
//   SMTP_FROM  — Gmail address used to send (e.g. noreply@ready4exam.com)
//   SMTP_PASS  — Gmail App Password (16-char, generated from Google Account > Security > App Passwords)
// If either var is missing, email is skipped gracefully — payment is NOT affected.
async function sendConfirmationEmail({ toEmail, studentName, planLabel, durationLabel, amountPaise, expiryDate }) {
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

        <!-- Header -->
        <tr><td style="background:#1a3e6a;padding:32px 40px;border-radius:16px 16px 0 0;text-align:center;">
          <h1 style="margin:0;color:#ffbe0b;font-size:26px;font-weight:900;letter-spacing:-0.5px;">Ready4Exam</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.65);font-size:11px;text-transform:uppercase;letter-spacing:2px;">Payment Confirmation</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;padding:40px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;">

          <p style="margin:0 0 8px;color:#0f172a;font-size:17px;font-weight:700;">Dear ${studentName},</p>
          <p style="margin:0 0 28px;color:#475569;font-size:14px;line-height:1.7;">
            Your payment has been successfully received and your Ready4Exam account is now active.
            Here are your subscription details:
          </p>

          <!-- Details table -->
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

          <!-- CTA -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
            <tr><td align="center">
              <a href="https://karnkeshav.github.io/"
                 style="display:inline-block;background:#1a3e6a;color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:12px;font-size:14px;font-weight:900;letter-spacing:0.3px;">
                Access Your Dashboard →
              </a>
            </td></tr>
          </table>

          <!-- Login note -->
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin-bottom:28px;">
            <p style="margin:0;color:#166534;font-size:13px;font-weight:600;line-height:1.6;">
              <strong>Login tip:</strong> Use the username and password you set during registration.
              Your parent email (<strong>${toEmail}</strong>) is registered for communication and password recovery.
            </p>
          </div>

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

        console.log(`[EMAIL] Confirmation sent to ${toEmail}`);

    } catch (emailErr) {
        // Email failure must NOT roll back a successful payment
        console.error('[EMAIL] Failed to send confirmation email:', emailErr.message);
    }
}

// ─── Main handler ────────────────────────────────────────────────────────────
module.exports = async (req, res) => {

    // ── CORS ─────────────────────────────────────────────────────────────────
    const origin = req.headers.origin;
    const allowedOrigins = [
        'https://karnkeshav.github.io',
        'https://masterpage-1.vercel.app',
        process.env.ALLOWED_ORIGIN
    ].filter(Boolean);

    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') { return res.status(405).json({ error: 'Method Not Allowed' }); }

    // ── Firebase init ─────────────────────────────────────────────────────────
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
        const {
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature,
            pendingRegistrationId,
            verificationToken
        } = req.body;

        if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !pendingRegistrationId || !verificationToken) {
            return res.status(400).json({ error: 'Missing payment verification data.' });
        }

        // ── 1. Verify Razorpay signature ──────────────────────────────────────
        const secret = process.env.RAZORPAY_KEY_SECRET;
        if (!secret) {
            console.error("RAZORPAY_KEY_SECRET not set.");
            return res.status(500).json({ error: 'Payment gateway misconfigured. Contact support.' });
        }

        const generatedSignature = crypto
            .createHmac('sha256', secret)
            .update(razorpay_order_id + '|' + razorpay_payment_id)
            .digest('hex');

        if (generatedSignature !== razorpay_signature) {
            console.error("Signature mismatch.");
            return res.status(400).json({ error: 'Invalid payment signature.' });
        }

        // ── 2. Fetch & atomically lock pending registration ────────────────────
        const pendingRef = db.collection('pending_registrations').doc(pendingRegistrationId);

        const pendingData = await db.runTransaction(async (t) => {
            const pendingDoc = await t.get(pendingRef);
            if (!pendingDoc.exists)               throw new Error("Registration record not found.");
            const data = pendingDoc.data();
            if (data.status === 'completed')      throw new Error("Order already processed.");
            if (data.verificationToken !== verificationToken) throw new Error("Invalid session token.");
            t.update(pendingRef, { status: 'processing' });
            return data;
        });

        // ── 3. Create Firebase Auth account ───────────────────────────────────
        let userRecord;
        const stableUid = crypto.randomUUID();
        try {
            const userImportResult = await auth.importUsers([{
                uid:          stableUid,
                email:        pendingData.profileData.email,
                displayName:  pendingData.profileData.displayName,
                passwordHash: Buffer.from(pendingData.hashedPassword)
            }], { hash: { algorithm: 'BCRYPT' } });

            if (userImportResult.errors.length > 0) {
                if (userImportResult.errors[0].error.code === 'auth/email-already-exists') {
                    userRecord = await auth.getUserByEmail(pendingData.profileData.email);
                } else {
                    throw new Error(userImportResult.errors[0].error.message);
                }
            } else {
                userRecord = await auth.getUser(stableUid);
            }
        } catch (err) {
            // Mark as failed (terminal) — do NOT revert to 'pending' to avoid duplicate accounts
            await pendingRef.update({ status: 'failed', failReason: err.message }).catch(() => {});
            throw err;
        }

        // ── 4. Calculate expiry based on duration ──────────────────────────────
        const expiry   = new Date();
        const duration = pendingData.duration || '3m';

        if (duration === '3y') {
            expiry.setFullYear(expiry.getFullYear() + 3);      // 3 years
        } else if (duration === '1y') {
            expiry.setFullYear(expiry.getFullYear() + 1);      // 1 year
        } else {
            expiry.setDate(expiry.getDate() + 90);             // 3 months = 90 days
        }

        // ── 5. Assign active modules by plan ──────────────────────────────────
        // Base: every paid plan gets all quiz tiers
        const activeModules = ["SimpleQuizzes", "MediumQuizzes", "AdvancedQuizzes"];
        const pID = pendingData.planID;

        // Analytics tier (strategist, sync)
        if (['strategist', 'sync'].includes(pID)) {
            activeModules.push("MistakeNotebook", "KnowledgeHub", "BehavioralAnalytics", "DiagnosticConsole");
        }

        // Parent console (sync, board_parent)
        if (['sync', 'board_parent'].includes(pID)) {
            activeModules.push("ParentConsole");
        }

        // Board exam tools (board_self, board_parent, backward-compat board_ready)
        if (['board_self', 'board_parent', 'board_ready'].includes(pID)) {
            activeModules.push("PYQ_Insights", "WeightageAnalytics", "MarkingGuides");
        }

        // ── 6. Write user profile + ledger in a single batch ──────────────────
        const revenueAmt     = pendingData.amountPaise / 100;
        const userProfileRef = db.collection('users').doc(userRecord.uid);
        const batch          = db.batch();

        batch.set(userProfileRef, {
            ...pendingData.profileData,
            uid:               userRecord.uid,
            status:            "active",
            activeModules,
            subscriptionTier:  pID,
            duration,                                        // stored for owner dashboard
            durationLabel:     pendingData.durationLabel || '3 Months',
            razorpayPaymentId: razorpay_payment_id,
            revenue:           revenueAmt,
            accessExpiryDate:  admin.firestore.Timestamp.fromDate(expiry),
            activationDate:    admin.firestore.FieldValue.serverTimestamp()
        });

        batch.update(pendingRef, {
            status:      'completed',
            uid:         userRecord.uid,
            completedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Financial event — written to both collections for owner dashboard
        const financialPayload = {
            type:       "B2C_REVENUE",
            amount:     revenueAmt,
            uid:        userRecord.uid,
            entityType: "b2c",
            school_id:  "B2C_REVENUE",
            // Human-readable in owner ledger table
            details:    `${pendingData.planLabel || pID} — ${pendingData.durationLabel || duration}`,
            timestamp:  admin.firestore.FieldValue.serverTimestamp()
        };
        batch.set(db.collection('ledger_events').doc(),    financialPayload);
        batch.set(db.collection('financial_events').doc(), financialPayload);

        await batch.commit();

        // ── 7. Send confirmation email (non-blocking — never breaks payment) ──
        await sendConfirmationEmail({
            toEmail:       pendingData.profileData.parentEmail,
            studentName:   pendingData.profileData.displayName,
            planLabel:     pendingData.planLabel     || pID,
            durationLabel: pendingData.durationLabel || duration,
            amountPaise:   pendingData.amountPaise,
            expiryDate:    expiry
        });

        // ── 8. Return custom token for client-side sign-in ─────────────────────
        const customToken = await auth.createCustomToken(userRecord.uid);
        return res.status(200).json({ success: true, customToken });

    } catch (error) {
        console.error("Verification Error:", error);
        return res.status(500).json({ error: error.message });
    }
};
