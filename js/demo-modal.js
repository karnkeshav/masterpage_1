/* ================================================================
   READY4EXAM — demo-modal.js
   Handles school demo registration form only.
   No Firebase. No auth. Completely independent.
   ================================================================ */

const APPS_SCRIPT_URL = 'YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';

/* ── Open / Close ─────────────────────────────────────────── */
function openDemoModal() {
    document.getElementById('demoModal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeDemoModal() {
    document.getElementById('demoModal').classList.add('hidden');
    document.body.style.overflow = '';
    _resetDemoModal();
}

function _resetDemoModal() {
    document.getElementById('demo-modal-form').classList.remove('hidden');
    document.getElementById('dm-success').classList.add('hidden');
    document.getElementById('demo-modal-form').reset();
    document.getElementById('dm-send-error').classList.add('hidden');
    document.querySelectorAll('#demo-modal-form .dm-err')
        .forEach(el => el.classList.add('hidden'));
    const btn = document.getElementById('dm-submit-btn');
    btn.disabled = false;
    btn.classList.remove('opacity-60', 'cursor-not-allowed');
    document.getElementById('dm-btn-text').textContent = 'Submit Demo Request';
}

/* Close on backdrop click */
document.getElementById('demoModal')
    ?.addEventListener('click', function (e) {
        if (e.target === this) closeDemoModal();
    });

/* Close on ESC — only if auth forgot-modal is not open */
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        const forgotOpen = document.getElementById('forgot-password-modal');
        if (forgotOpen && !forgotOpen.classList.contains('hidden')) return;
        closeDemoModal();
    }
});

/* ── Field validation ─────────────────────────────────────── */
function _validateField(el) {
    const empty    = !el.value.trim();
    const badEmail = el.type === 'email' && el.value.trim() &&
                     !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value);
    const invalid  = empty || badEmail;
    el.parentElement.querySelector('.dm-err')
        ?.classList.toggle('hidden', !invalid);
    el.classList.toggle('border-red-300', invalid);
    el.classList.toggle('border-slate-200', !invalid);
    return !invalid;
}

['dm-school', 'dm-contact', 'dm-email', 'dm-phone'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('blur', () => _validateField(el));
    el.addEventListener('input', () => {
        const errEl = el.parentElement.querySelector('.dm-err');
        if (errEl && !errEl.classList.contains('hidden')) _validateField(el);
    });
});

/* ── Form submit ──────────────────────────────────────────── */
document.getElementById('demo-modal-form')
    ?.addEventListener('submit', async function (e) {
        e.preventDefault();

        const required = ['dm-school', 'dm-contact', 'dm-email', 'dm-phone'];
        const allOk = required.every(id =>
            _validateField(document.getElementById(id))
        );
        if (!allOk) return;

        const btn = document.getElementById('dm-submit-btn');
        const txt = document.getElementById('dm-btn-text');
        btn.disabled = true;
        btn.classList.add('opacity-60', 'cursor-not-allowed');
        txt.textContent = 'Sending…';

        const payload = {
            school       : document.getElementById('dm-school').value.trim(),
            contact      : document.getElementById('dm-contact').value.trim(),
            email        : document.getElementById('dm-email').value.trim(),
            phone        : document.getElementById('dm-phone').value.trim(),
            board        : document.getElementById('dm-board').value,
            students     : document.getElementById('dm-students').value,
            requirements : document.getElementById('dm-requirements').value.trim()
        };

        try {
            /*
              no-cors: Apps Script doesn't support custom CORS headers.
              The POST goes through and the script runs (sheet + emails sent).
              We show success optimistically after a short pause.
            */
            await fetch(APPS_SCRIPT_URL, {
                method  : 'POST',
                mode    : 'no-cors',
                headers : { 'Content-Type': 'application/json' },
                body    : JSON.stringify(payload)
            });

            await new Promise(r => setTimeout(r, 800));

            document.getElementById('demo-modal-form').classList.add('hidden');
            document.getElementById('dm-success').classList.remove('hidden');
            document.querySelector('#demoModal > div').scrollTop = 0;

        } catch (err) {
            const banner = document.getElementById('dm-send-error');
            banner.textContent =
                "Something went wrong. Please WhatsApp us at +91 85209 77573 and we'll set up your demo.";
            banner.classList.remove('hidden');
            btn.disabled = false;
            btn.classList.remove('opacity-60', 'cursor-not-allowed');
            txt.textContent = 'Submit Demo Request';
        }
    });
