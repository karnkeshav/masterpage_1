// js/guest-teasers.js
// Centralized guest teaser / conversion system.
// Provides reusable popups, banners, and flyers to encourage guest registration.

/* ===========================
   TEASER MODAL (Reusable)
   =========================== */

/**
 * Show a teaser modal encouraging registration.
 * @param {Object} opts
 * @param {string} opts.icon - Emoji/icon for the header
 * @param {string} opts.title - Modal title
 * @param {string} opts.body - HTML body content
 * @param {string} [opts.ctaText] - CTA button text. Default: "Register Now — It's Free"
 * @param {string} [opts.ctaHref] - CTA link. Default: index page with registration anchor
 * @param {string} [opts.secondaryText] - Secondary button text (dismiss). Default: "Maybe Later"
 */
export function showTeaserModal(opts) {
    const existing = document.getElementById('guest-teaser-modal');
    if (existing) existing.remove();

    const ctaText = opts.ctaText || "Register Now — It's Free";
    const ctaHref = opts.ctaHref || getIndexUrl();
    const secondaryText = opts.secondaryText || "Maybe Later";

    const modal = document.createElement('div');
    modal.id = 'guest-teaser-modal';
    modal.className = 'fixed inset-0 z-[60] flex items-center justify-center p-4';
    modal.style.cssText = 'background:rgba(15,23,42,0.7);backdrop-filter:blur(6px);animation:fade 0.3s ease-out forwards;opacity:0;';
    modal.innerHTML = `
        <div class="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl relative border border-slate-100" style="animation:slideUp 0.4s ease-out forwards;">
            <button id="close-teaser-modal" class="absolute top-4 right-4 w-9 h-9 flex items-center justify-center bg-slate-100 rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500 transition text-sm font-bold">✕</button>
            <div class="text-center mb-6">
                <div class="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center text-3xl mb-4 shadow-sm border border-blue-100">${opts.icon}</div>
                <h3 class="text-xl font-black text-slate-900 leading-tight">${opts.title}</h3>
            </div>
            <div class="text-sm text-slate-600 leading-relaxed mb-6">${opts.body}</div>
            <a href="${ctaHref}" class="block w-full text-center bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black py-4 px-6 rounded-2xl hover:shadow-xl hover:shadow-blue-200 transition-all active:scale-95 text-sm tracking-wide">
                ${ctaText}
            </a>
            <button id="dismiss-teaser-modal" class="block w-full text-center text-slate-400 font-bold text-xs mt-3 py-2 hover:text-slate-600 transition">${secondaryText}</button>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('close-teaser-modal').onclick = () => modal.remove();
    document.getElementById('dismiss-teaser-modal').onclick = () => modal.remove();
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

/* ===========================
   INDEX PAGE — MEDIUM/ADVANCED TEASER
   =========================== */

/**
 * Wire up the disabled Medium/Advanced buttons on index.html
 * to show a teaser popup instead of doing nothing.
 */
export function wireIndexDifficultyTeasers() {
    document.querySelectorAll('.diff-btn[disabled]').forEach(btn => {
        const diff = btn.dataset.diff || btn.textContent.trim();
        // Remove disabled so it's clickable, but keep the locked visual
        btn.disabled = false;
        btn.style.cursor = 'pointer';
        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            showTeaserModal({
                icon: diff === 'Advanced' ? '🔥' : '⚡',
                title: `${diff} Difficulty — Members Only`,
                body: `
                    <div class="space-y-3">
                        <p><strong>${diff}</strong> questions are designed by CBSE experts to push your preparation to the next level.</p>
                        <div class="bg-amber-50 border border-amber-100 rounded-xl p-3">
                            <p class="text-xs font-bold text-amber-700"><i class="fas fa-star mr-1"></i> What you unlock with registration:</p>
                            <ul class="text-xs text-amber-600 mt-1 space-y-1 pl-4 list-disc">
                                <li>Medium & Advanced difficulty tiers</li>
                                <li>Mistake Notebook — track & fix weak spots</li>
                                <li>Knowledge Hub — subject mastery dashboard</li>
                                <li>Cognitive Analysis after every quiz</li>
                            </ul>
                        </div>
                        <p class="text-xs text-slate-400 italic">Simple difficulty remains free for everyone.</p>
                    </div>
                `
            });
        };
    });
}

/* ===========================
   QUIZ ENGINE — FLOATING REGISTER BANNER
   =========================== */

/**
 * Inject a floating "Register Now" banner that persists during the guest quiz.
 * Pulses gently to draw attention without being annoying.
 */
export function injectGuestQuizBanner() {
    if (document.getElementById('guest-register-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'guest-register-banner';
    banner.className = 'fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-600 text-white py-2.5 px-4 flex items-center justify-center gap-3 shadow-lg';
    banner.style.cssText = 'animation: guestBannerPulse 3s ease-in-out infinite;';
    banner.innerHTML = `
        <span class="text-xs font-bold tracking-wide"><i class="fas fa-gift mr-1.5"></i>You're in Guest Mode — Register FREE to unlock all features</span>
        <a href="${getIndexUrl()}" class="bg-white text-indigo-700 font-black text-xs px-4 py-1.5 rounded-lg hover:bg-indigo-50 transition active:scale-95 whitespace-nowrap shadow-sm">
            Register Now →
        </a>
    `;

    // Inject animation keyframes
    if (!document.getElementById('guest-banner-styles')) {
        const style = document.createElement('style');
        style.id = 'guest-banner-styles';
        style.textContent = `
            @keyframes guestBannerPulse {
                0%, 100% { box-shadow: 0 -2px 20px rgba(79,70,229,0.3); }
                50% { box-shadow: 0 -2px 30px rgba(79,70,229,0.6); }
            }
            /* Bump sticky nav and footer up so banner doesn't overlap */
            body.has-guest-banner #quiz-content .sticky { bottom: 50px !important; }
        `;
        document.head.appendChild(style);
    }

    document.body.classList.add('has-guest-banner');
    document.body.appendChild(banner);
}

/* ===========================
   QUIZ ENGINE — RESULTS PAGE FLYER
   =========================== */

/**
 * Inject a grade-aware teaser flyer on the quiz results page.
 * @param {string|number} grade - Class selected (e.g. "10", "8")
 */
export function injectResultsFlyer(grade) {
    const g = parseInt(grade, 10);
    const isBoardYear = (g === 10 || g === 12);

    // Remove any existing flyer
    const existing = document.getElementById('guest-results-flyer');
    if (existing) existing.remove();

    const flyer = document.createElement('div');
    flyer.id = 'guest-results-flyer';
    flyer.className = 'w-full max-w-4xl mx-auto mb-8 px-4';

    // Common features (all classes)
    const commonFeatures = `
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            <div class="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
                <div class="text-2xl mb-2">📊</div>
                <h4 class="font-bold text-blue-800 text-sm">Knowledge Hub</h4>
                <p class="text-xs text-blue-600 mt-1">Track mastery across every subject. See your strengths & blind spots in real-time.</p>
            </div>
            <div class="bg-purple-50 border border-purple-100 rounded-xl p-4 text-center">
                <div class="text-2xl mb-2">📓</div>
                <h4 class="font-bold text-purple-800 text-sm">Mistake Notebook</h4>
                <p class="text-xs text-purple-600 mt-1">Every wrong answer is auto-saved. Review, retry, and eliminate repeat errors.</p>
            </div>
            <div class="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
                <div class="text-2xl mb-2">🎯</div>
                <h4 class="font-bold text-green-800 text-sm">Student Dashboard</h4>
                <p class="text-xs text-green-600 mt-1">Cognitive profiling, performance vectors, and personalized improvement paths.</p>
            </div>
        </div>
    `;

    // Board-year specific content (Class 10 & 12)
    const boardYearContent = isBoardYear ? `
        <div class="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-2xl p-5 mb-4">
            <div class="flex items-start gap-3 mb-3">
                <div class="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-2xl flex-shrink-0">📋</div>
                <div>
                    <h4 class="font-black text-amber-900 text-base">Class ${g} Board Exam Preparation</h4>
                    <p class="text-xs text-amber-700 mt-1 font-medium">CBSE is shifting away from rote learning — are you prepared?</p>
                </div>
            </div>
            <div class="space-y-2 text-xs text-amber-800">
                <p>📌 <strong>CBSE's New Pattern Focus:</strong> Application-based, competency-driven questions now dominate 40-50% of board papers. Simple memorization won't cut it anymore.</p>
                <p>📌 <strong>Previous Year Questions (PYQs):</strong> Registered students get access to curated PYQ analysis showing which concepts repeat year after year — pattern recognition is your edge.</p>
                <p>📌 <strong>Sample Paper Insights:</strong> CBSE's official sample papers reveal the exact weightage split. Our platform maps your performance against these benchmarks.</p>
            </div>
            <div class="mt-3 bg-white/60 rounded-xl p-3 border border-amber-100">
                <p class="text-xs font-bold text-amber-900"><i class="fas fa-lightbulb mr-1"></i> Pro Tip:</p>
                <p class="text-xs text-amber-700">Students who use PYQ analysis + Mistake Notebook together score <strong>23% higher</strong> on average in board exams. Register to unlock this combination.</p>
            </div>
        </div>
    ` : '';

    flyer.innerHTML = `
        <div class="bg-white rounded-3xl border-2 border-indigo-100 shadow-xl overflow-hidden">
            <div class="bg-gradient-to-r from-indigo-600 to-blue-600 text-white p-5 text-center">
                <h3 class="text-lg font-black tracking-tight">🚀 Unlock Your Full Potential</h3>
                <p class="text-xs text-indigo-100 mt-1 font-medium">You just completed a quiz as Guest — here's what registered students get:</p>
            </div>
            <div class="p-5">
                ${boardYearContent}
                ${commonFeatures}
                <div class="mt-5 text-center">
                    <a href="${getIndexUrl()}" class="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-black py-3.5 px-8 rounded-2xl hover:shadow-xl hover:shadow-indigo-200 transition-all active:scale-95 text-sm">
                        <i class="fas fa-user-plus"></i> Register Free — Start Your Journey
                    </a>
                    <p class="text-[10px] text-slate-400 mt-2">No credit card required. Get started in 30 seconds.</p>
                </div>
            </div>
        </div>
    `;

    // Insert before the difficulty buttons on the results screen
    const resultsScreen = document.getElementById('results-screen');
    if (resultsScreen) {
        const diffGrid = resultsScreen.querySelector('.grid.grid-cols-1.sm\\:grid-cols-3');
        if (diffGrid) {
            resultsScreen.insertBefore(flyer, diffGrid);
        } else {
            resultsScreen.appendChild(flyer);
        }
    }
}

/* ===========================
   QUIZ ENGINE — DIFFICULTY TEASER (on results page)
   =========================== */

/**
 * Override the changeDifficulty() function for guests to show a teaser
 * instead of silently redirecting to index.html.
 */
export function wireResultsDifficultyTeaser() {
    const origChange = window.changeDifficulty;
    window.changeDifficulty = function(level) {
        const url = new URL(window.location.href);
        const isGuest = url.searchParams.get("mode") === "guest";
        if (isGuest && level !== "Simple") {
            showTeaserModal({
                icon: level === 'Advanced' ? '🔥' : '⚡',
                title: `${level} — Registered Students Only`,
                body: `
                    <div class="space-y-3">
                        <p><strong>${level}</strong> difficulty features CBSE-pattern questions that mirror actual board exam standards.</p>
                        <div class="bg-slate-50 border border-slate-200 rounded-xl p-3">
                            <p class="text-xs font-bold text-slate-700"><i class="fas fa-unlock mr-1"></i> Register to access:</p>
                            <ul class="text-xs text-slate-600 mt-1 space-y-1 pl-4 list-disc">
                                <li><strong>Medium:</strong> Application-based & competency questions</li>
                                <li><strong>Advanced:</strong> Board-level assertion-reason & case studies</li>
                                <li>Detailed performance tracking across all tiers</li>
                                <li>Mistake Notebook to fix your weak areas</li>
                            </ul>
                        </div>
                    </div>
                `,
                ctaText: "Register Free to Unlock"
            });
            return;
        }
        // For authenticated users or Simple, use original behavior
        if (typeof origChange === 'function') {
            origChange(level);
        } else {
            url.searchParams.set("difficulty", level);
            window.location.href = url.toString();
        }
    };
}

/* ===========================
   CHAPTER SELECTION — GUEST DIFFICULTY TEASER
   =========================== */

/**
 * Override the launchQuiz() function on chapter-selection.html for guests.
 * Guest clicking Medium/Advanced gets a teaser; Simple launches in guest mode.
 */
export function wireChapterSelectionTeaser() {
    const origLaunch = window.launchQuiz;
    window.launchQuiz = function(difficulty) {
        const isGuest = !window._r4eAuthUser;
        if (isGuest && difficulty !== 'Simple') {
            // Close the difficulty modal first
            if (typeof window.closeModal === 'function') window.closeModal();
            showTeaserModal({
                icon: difficulty === 'Advanced' ? '🔥' : '⚡',
                title: `${difficulty} Requires Registration`,
                body: `
                    <div class="space-y-3">
                        <p>You're browsing as a guest. <strong>${difficulty}</strong> questions are crafted for registered students preparing seriously for exams.</p>
                        <div class="bg-green-50 border border-green-100 rounded-xl p-3">
                            <p class="text-xs font-bold text-green-700"><i class="fas fa-check-circle mr-1"></i> Free registration includes:</p>
                            <ul class="text-xs text-green-600 mt-1 space-y-1 pl-4 list-disc">
                                <li>All 3 difficulty levels — Simple, Medium, Advanced</li>
                                <li>Auto-saved Mistake Notebook</li>
                                <li>Personal Knowledge Hub dashboard</li>
                                <li>Parent & Teacher monitoring consoles</li>
                            </ul>
                        </div>
                        <p class="text-xs text-slate-400 italic">Simple difficulty is available as Guest — try it now!</p>
                    </div>
                `,
                ctaText: "Register Free — 30 Seconds",
                secondaryText: "Try Simple as Guest"
            });
            // Wire secondary to launch Simple in guest mode
            setTimeout(() => {
                const dismissBtn = document.getElementById('dismiss-teaser-modal');
                if (dismissBtn) {
                    dismissBtn.onclick = () => {
                        document.getElementById('guest-teaser-modal')?.remove();
                        if (typeof origLaunch === 'function') {
                            origLaunch('Simple');
                        }
                    };
                }
            }, 50);
            return;
        }
        // For authenticated users or Simple, use original behavior
        if (typeof origLaunch === 'function') {
            origLaunch(difficulty);
        }
    };
}

/* ===========================
   UTILITY
   =========================== */

/**
 * Get the path to the index/login page, working from any page depth.
 */
function getIndexUrl() {
    // Detect if we're in /app/ or root
    const path = window.location.pathname;
    if (path.includes('/app/')) {
        return '../index.html';
    }
    return './index.html';
}
