// js/guest-google-auth.js
// ─────────────────────────────────────────────────────────────────────────────
// Intercepts the "Start Quiz" button on index.html.
// Forces Google Sign-In for guests, then writes to Firestore guests collection.
// ─────────────────────────────────────────────────────────────────────────────

import { getApp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, setDoc, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ── Inject modal styles once ──────────────────────────────────────────────────
const STYLE = `
  #gauth-overlay {
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0,0,0,0.72);
    backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
    animation: gauthFadeIn 0.2s ease;
  }
  @keyframes gauthFadeIn { from { opacity:0 } to { opacity:1 } }

  #gauth-card {
    background: #0f172a;
    border: 1px solid rgba(255,255,255,0.10);
    border-radius: 24px;
    padding: 36px 32px 28px;
    width: 100%; max-width: 380px;
    text-align: center;
    box-shadow: 0 32px 64px rgba(0,0,0,0.6);
    animation: gauthSlideUp 0.25s cubic-bezier(.34,1.56,.64,1);
  }
  @keyframes gauthSlideUp {
    from { transform: translateY(24px); opacity:0 }
    to   { transform: translateY(0);    opacity:1 }
  }

  #gauth-icon { font-size: 52px; margin-bottom: 12px; display: block; }

  #gauth-title {
    color: #fff; font-size: 20px; font-weight: 800;
    margin: 0 0 8px; font-family: inherit;
  }
  #gauth-sub {
    color: rgba(255,255,255,0.55); font-size: 13px;
    line-height: 1.55; margin: 0 0 24px;
  }

  #gauth-btn {
    width: 100%; background: #fff; color: #1e293b;
    border: none; border-radius: 14px;
    padding: 14px 20px; font-size: 14px; font-weight: 700;
    cursor: pointer; display: flex; align-items: center;
    justify-content: center; gap: 10px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.35);
    transition: transform 0.15s, box-shadow 0.15s;
  }
  #gauth-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  }
  #gauth-btn:disabled { opacity: 0.6; cursor: not-allowed; }

  #gauth-error {
    color: #f87171; font-size: 11px; font-weight: 700;
    margin-top: 12px; min-height: 16px;
  }

  #gauth-cancel {
    background: transparent; border: none;
    color: rgba(255,255,255,0.35); font-size: 12px;
    margin-top: 14px; cursor: pointer;
    text-decoration: underline; text-underline-offset: 2px;
    transition: color 0.15s;
  }
  #gauth-cancel:hover { color: rgba(255,255,255,0.65); }

  #gauth-badge {
    margin-top: 18px; padding-top: 16px;
    border-top: 1px solid rgba(255,255,255,0.08);
    font-size: 10px; color: rgba(255,255,255,0.25);
    letter-spacing: 0.05em; text-transform: uppercase;
  }
`;

function injectStyles() {
  if (document.getElementById('gauth-styles')) return;
  const s = document.createElement('style');
  s.id = 'gauth-styles';
  s.textContent = STYLE;
  document.head.appendChild(s);
}

// ── Google SVG logo ───────────────────────────────────────────────────────────
const GOOGLE_SVG = `
  <svg width="18" height="18" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.1 29.3 35 24 35
      c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.3 1 7.2 2.7l5.7-5.7
      C33.5 7.1 29 5 24 5 13 5 4 14 4 25s9 20 20 20 20-9 20-20
      c0-1.3-.1-2.6-.4-3.9z"/>
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16.1 19 13 24 13
      c2.8 0 5.3 1 7.2 2.7l5.7-5.7C33.5 7.1 29 5 24 5
      C16.3 5 9.7 9 6.3 14.7z"/>
    <path fill="#4CAF50" d="M24 45c4.9 0 9.4-1.9 12.8-4.9l-5.9-5
      c-1.8 1.3-4 2.1-6.9 2.1-5.2 0-9.6-3.5-11.2-8.3l-6.5 5
      C9.5 41 16.3 45 24 45z"/>
    <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.6
      l5.9 5C40 35.9 44 31 44 25c0-1.3-.1-2.6-.4-3.9z"/>
  </svg>`;

// ── Show the modal ────────────────────────────────────────────────────────────
function showModal(auth, db, onSuccess) {
  injectStyles();

  const overlay = document.createElement('div');
  overlay.id = 'gauth-overlay';
  overlay.innerHTML = `
    <div id="gauth-card">
      <span id="gauth-icon">🔐</span>
      <h3 id="gauth-title">One quick step!</h3>
      <p id="gauth-sub">
        Sign in with Google to take your free quiz.<br>
        No password — just one click.
      </p>
      <button id="gauth-btn">
        ${GOOGLE_SVG}
        Continue with Google
      </button>
      <div id="gauth-error"></div>
      <button id="gauth-cancel">Cancel</button>
      <div id="gauth-badge">🔒 Secured by Google · Ready4Exam</div>
    </div>
  `;
  document.body.appendChild(overlay);

  const btn    = overlay.querySelector('#gauth-btn');
  const errEl  = overlay.querySelector('#gauth-error');
  const cancel = overlay.querySelector('#gauth-cancel');

  // Close on backdrop click
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });
  cancel.addEventListener('click', () => overlay.remove());

  // Sign-in flow
  btn.addEventListener('click', async () => {
    btn.disabled     = true;
    btn.innerHTML    = '<span style="opacity:.6;font-size:13px;">Signing in…</span>';
    errEl.textContent = '';

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      const result = await signInWithPopup(auth, provider);
      const user   = result.user;

      // ── Write to Firestore guests collection ──────────────────────────────
      await setDoc(
        doc(db, 'guests', user.uid),
        {
          uid        : user.uid,
          name       : user.displayName ?? '',
          email      : user.email       ?? '',
          photoURL   : user.photoURL    ?? '',
          lastQuizAt : serverTimestamp(),    // updates on every visit
          // createdAt is only written the very first time (merge won't overwrite it)
        },
        { merge: true }
      );

      // Also set createdAt only on first write
      // (Firestore doesn't support conditional field writes natively,
      //  so we use a second call guarded by checking if the doc is new)
      const { getDoc } = await import(
        'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'
      );
      const snap = await getDoc(doc(db, 'guests', user.uid));
      if (!snap.data()?.createdAt) {
        await setDoc(
          doc(db, 'guests', user.uid),
          { createdAt: serverTimestamp() },
          { merge: true }
        );
      }

      overlay.remove();
      onSuccess();                          // ← starts the quiz

    } catch (err) {
      console.error('[GuestAuth]', err.code, err.message);

      const messages = {
        'auth/popup-closed-by-user'     : 'Sign-in cancelled. Please try again.',
        'auth/popup-blocked'            : 'Popup was blocked. Allow popups for this site.',
        'auth/network-request-failed'   : 'Network error. Check your connection.',
      };

      errEl.textContent  = messages[err.code] ?? 'Sign-in failed. Please try again.';
      btn.disabled       = false;
      btn.innerHTML      = `${GOOGLE_SVG} Continue with Google`;
    }
  });
}

// ── Boot: intercept the quiz button ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const quizBtn = document.getElementById('start-quiz-btn');
  if (!quizBtn) return;

  // Remove the inline onclick so we fully own the click
  quizBtn.removeAttribute('onclick');

  quizBtn.addEventListener('click', () => {
    const auth = getAuth(getApp());
    const db   = getFirestore(getApp());

    // If already signed in (returning guest or platform user), go straight to quiz
    if (auth.currentUser) {
      window.startQuiz?.();
      return;
    }

    // Otherwise gate with Google auth
    showModal(auth, db, () => window.startQuiz?.());
  });
});
