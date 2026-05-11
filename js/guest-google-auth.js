// js/guest-google-auth.js
// Self-contained — initializes its own Firebase instance safely.
// Works regardless of what firebase-master-config.js uses (compat or modular).

import { initializeApp, getApps, getApp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ─── PASTE YOUR FIREBASE CONFIG HERE ────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey            : "AIzaSyAXdKiYRxBKAj280YcNuNwlKKDp85xpOWQ",
  authDomain        : "quiz-signon.firebaseapp.com",
  projectId         : "quiz-signon",
  storageBucket     : "quiz-signon.firebasestorage.app",
  messagingSenderId : "863414222321",
  appId             : "1:863414222321:web:819f5564825308bcd9d850"
};
// ─────────────────────────────────────────────────────────────────────────────

// Safe init: reuse existing app if already initialized (avoids duplicate-app error)
const APP_NAME = 'guest-auth';
const app = getApps().find(a => a.name === APP_NAME) ?? initializeApp(FIREBASE_CONFIG, APP_NAME);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── Modal styles ─────────────────────────────────────────────────────────────
const STYLE = `
  #gauth-overlay {
    position:fixed;inset:0;z-index:9999;
    background:rgba(0,0,0,0.75);
    backdrop-filter:blur(8px);
    display:flex;align-items:center;justify-content:center;padding:16px;
    animation:gauthIn .2s ease;
  }
  @keyframes gauthIn{from{opacity:0}to{opacity:1}}

  #gauth-card {
    background:#0f172a;
    border:1px solid rgba(255,255,255,0.12);
    border-radius:24px;padding:36px 32px 28px;
    width:100%;max-width:380px;text-align:center;
    box-shadow:0 32px 64px rgba(0,0,0,.6);
    animation:gauthUp .25s cubic-bezier(.34,1.56,.64,1);
  }
  @keyframes gauthUp{from{transform:translateY(28px);opacity:0}to{transform:translateY(0);opacity:1}}

  #gauth-icon{font-size:48px;display:block;margin-bottom:12px}
  #gauth-title{color:#fff;font-size:20px;font-weight:800;margin:0 0 8px}
  #gauth-sub{color:rgba(255,255,255,.55);font-size:13px;line-height:1.6;margin:0 0 24px}

  #gauth-btn{
    width:100%;background:#fff;color:#1e293b;border:none;border-radius:14px;
    padding:14px 20px;font-size:14px;font-weight:700;cursor:pointer;
    display:flex;align-items:center;justify-content:center;gap:10px;
    box-shadow:0 4px 16px rgba(0,0,0,.3);
    transition:transform .15s,box-shadow .15s;
  }
  #gauth-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 8px 24px rgba(0,0,0,.4)}
  #gauth-btn:disabled{opacity:.55;cursor:not-allowed}

  #gauth-spinner{
    width:16px;height:16px;border:2px solid #cbd5e1;
    border-top-color:#1e293b;border-radius:50%;
    animation:spin .7s linear infinite;display:none;
  }
  @keyframes spin{to{transform:rotate(360deg)}}

  #gauth-error{color:#f87171;font-size:11px;font-weight:700;margin-top:12px;min-height:16px}
  #gauth-cancel{
    background:transparent;border:none;color:rgba(255,255,255,.35);
    font-size:12px;margin-top:14px;cursor:pointer;
    text-decoration:underline;text-underline-offset:2px;transition:color .15s;
  }
  #gauth-cancel:hover{color:rgba(255,255,255,.65)}
  #gauth-badge{
    margin-top:18px;padding-top:16px;
    border-top:1px solid rgba(255,255,255,.08);
    font-size:10px;color:rgba(255,255,255,.25);
    letter-spacing:.05em;text-transform:uppercase;
  }
`;

const GOOGLE_SVG = `<svg width="18" height="18" viewBox="0 0 48 48">
  <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.1 29.3 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.3 1 7.2 2.7l5.7-5.7C33.5 7.1 29 5 24 5 13 5 4 14 4 25s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16.1 19 13 24 13c2.8 0 5.3 1 7.2 2.7l5.7-5.7C33.5 7.1 29 5 24 5 16.3 5 9.7 9 6.3 14.7z"/>
  <path fill="#4CAF50" d="M24 45c4.9 0 9.4-1.9 12.8-4.9l-5.9-5c-1.8 1.3-4 2.1-6.9 2.1-5.2 0-9.6-3.5-11.2-8.3l-6.5 5C9.5 41 16.3 45 24 45z"/>
  <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.6l5.9 5C40 35.9 44 31 44 25c0-1.3-.1-2.6-.4-3.9z"/>
</svg>`;

// ── Firestore write ───────────────────────────────────────────────────────────
async function saveGuest(user) {
  const ref = doc(db, 'guests', user.uid);

  // Always update name / email / photo + lastQuizAt
  await setDoc(ref, {
    uid        : user.uid,
    name       : user.displayName ?? '',
    email      : user.email       ?? '',
    photoURL   : user.photoURL    ?? '',
    lastQuizAt : serverTimestamp(),
  }, { merge: true });

  // Set createdAt only on very first sign-in
  const snap = await getDoc(ref);
  if (!snap.data()?.createdAt) {
    await setDoc(ref, { createdAt: serverTimestamp() }, { merge: true });
  }
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function showAuthModal(onSuccess) {
  if (!document.getElementById('gauth-styles')) {
    const s = document.createElement('style');
    s.id = 'gauth-styles';
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  // Remove any existing overlay
  document.getElementById('gauth-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'gauth-overlay';
  overlay.innerHTML = `
    <div id="gauth-card">
      <span id="gauth-icon">🔐</span>
      <h3 id="gauth-title">One quick step!</h3>
      <p id="gauth-sub">
        Sign in with Google to start your free quiz.<br>
        No password needed — just one tap.
      </p>
      <button id="gauth-btn">
        ${GOOGLE_SVG}
        <span id="gauth-btn-text">Continue with Google</span>
        <div id="gauth-spinner"></div>
      </button>
      <div id="gauth-error"></div>
      <button id="gauth-cancel">Cancel</button>
      <div id="gauth-badge">🔒 Secured by Google · Ready4Exam</div>
    </div>
  `;
  document.body.appendChild(overlay);

  const btn     = overlay.querySelector('#gauth-btn');
  const btnText = overlay.querySelector('#gauth-btn-text');
  const spinner = overlay.querySelector('#gauth-spinner');
  const errEl   = overlay.querySelector('#gauth-error');
  const cancel  = overlay.querySelector('#gauth-cancel');

  const closeModal = () => overlay.remove();

  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  cancel.addEventListener('click', closeModal);

  btn.addEventListener('click', async () => {
    // Show spinner
    btn.disabled      = true;
    btnText.textContent = 'Signing in…';
    spinner.style.display = 'block';
    errEl.textContent = '';

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      const result = await signInWithPopup(auth, provider);
      await saveGuest(result.user);

      closeModal();
      onSuccess();

    } catch (err) {
      console.error('[GuestAuth]', err.code, err.message);

      const MSG = {
        'auth/popup-closed-by-user'  : 'Sign-in was cancelled. Please try again.',
        'auth/popup-blocked'         : 'Popup blocked — allow popups for this site and retry.',
        'auth/network-request-failed': 'Network error. Check your connection.',
        'auth/cancelled-popup-request': 'Another sign-in is already in progress.',
      };
      errEl.textContent  = MSG[err.code] ?? `Error: ${err.message}`;
      btn.disabled       = false;
      btnText.textContent = 'Continue with Google';
      spinner.style.display = 'none';
    }
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const quizBtn = document.getElementById('start-quiz-btn');
  if (!quizBtn) return;

  // Own the click — remove inline handler if still present
  quizBtn.removeAttribute('onclick');

  quizBtn.addEventListener('click', () => {
    // Already signed in? Go straight to quiz.
    if (auth.currentUser) {
      window.startQuiz?.();
      return;
    }
    // Gate with Google auth
    showAuthModal(() => window.startQuiz?.());
  });
});
