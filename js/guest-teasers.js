// js/guest-teasers.js
// Centralized guest teaser / conversion system.
// Provides reusable popups, banners, and flyers to encourage guest registration.

/* ===========================
   SHARED STYLES (injected once)
   =========================== */

let _stylesInjected = false;

function injectTeaserStyles() {
    if (_stylesInjected) return;
    _stylesInjected = true;
    const style = document.createElement('style');
    style.id = 'guest-teaser-styles';
    style.textContent = `
        @keyframes teaserOverlayIn {
            from { opacity: 0; }
            to   { opacity: 1; }
        }
        @keyframes teaserCardIn {
            from { opacity: 0; transform: translateY(24px) scale(0.96); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes teaserIconFloat {
            0%, 100% { transform: translateY(0); }
            50%      { transform: translateY(-5px); }
        }
        .teaser-cta-btn {
            background: linear-gradient(135deg, #4f46e5 0%, #6366f1 40%, #818cf8 50%, #6366f1 60%, #4f46e5 100%);
            background-size: 200% auto;
            animation: teaserShimmer 3s ease infinite;
        }
        @keyframes teaserShimmer {
            0%   { background-position: 0% center; }
            50%  { background-position: 100% center; }
            100% { background-position: 0% center; }
        }
        @keyframes guestBannerPulse {
            0%, 100% { transform: translateX(-50%) scale(1); box-shadow: 0 4px 20px rgba(79,70,229,0.35); }
            50%      { transform: translateX(-50%) scale(1.03); box-shadow: 0 8px 30px rgba(79,70,229,0.55); }
        }
        body.has-guest-banner #app-footer { padding-bottom: 3.5rem; }
        .teaser-feature-card {
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .teaser-feature-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0,0,0,0.08);
        }
    `;
    document.head.appendChild(style);
}

/* ===========================
   TEASER MODAL (Reusable)
   =========================== */

/**
 * Show a teaser modal encouraging registration.
 * SECURITY: All opts values (icon, title, body, ctaText) are hardcoded by
 * internal callers below — never from URL params or user input.
 * @param {Object} opts
 * @param {string} opts.icon - Emoji/icon for the header
 * @param {string} opts.title - Modal title
 * @param {string} opts.body - HTML body content
 * @param {string} [opts.ctaText] - CTA button text. Default: "Get Started — Subscribe Today"
 * @param {string} [opts.ctaHref] - CTA link. Default: index page with registration anchor
 * @param {string} [opts.secondaryText] - Secondary button text (dismiss). Default: "Maybe Later"
 * @param {Function} [opts.onDismiss] - Optional callback when secondary/dismiss button is clicked
 */
export function showTeaserModal(opts) {
    const existing = document.getElementById('guest-teaser-modal');
    if (existing) existing.remove();

    const ctaText = opts.ctaText || "Get Started — Subscribe Today";
    const ctaHref = opts.ctaHref || getIndexUrl();
    const secondaryText = opts.secondaryText || "Maybe Later";
    const heroImg = getImagePath();

    injectTeaserStyles();

    const modal = document.createElement('div');
    modal.id = 'guest-teaser-modal';
    modal.className = 'fixed inset-0 z-[60] flex items-center justify-center p-4';
    modal.style.cssText = 'background:rgba(15,23,42,0.75);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:teaserOverlayIn 0.3s ease-out forwards;opacity:0;';
    modal.innerHTML = `
        <div class="bg-white rounded-3xl w-full max-w-md shadow-2xl relative overflow-hidden" style="animation:teaserCardIn 0.45s cubic-bezier(0.16,1,0.3,1) forwards;opacity:0;">
            <!-- Gradient hero with student image -->
            <div class="relative h-40 bg-gradient-to-br from-indigo-600 via-blue-600 to-purple-700 overflow-hidden">
                <img src="${heroImg}" alt="Students learning" class="absolute right-0 bottom-0 h-full object-cover opacity-20 mix-blend-luminosity pointer-events-none" style="-webkit-mask-image:linear-gradient(to left,rgba(0,0,0,0.6),transparent 70%);mask-image:linear-gradient(to left,rgba(0,0,0,0.6),transparent 70%);" onerror="this.style.display='none'" />
                <div class="absolute -top-6 -left-6 w-24 h-24 bg-white/10 rounded-full"></div>
                <div class="absolute bottom-2 right-12 w-16 h-16 bg-white/5 rounded-full"></div>
                <div class="relative z-10 flex flex-col items-center justify-center h-full px-6">
                    <div class="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-3xl mb-2 border border-white/30 shadow-lg" style="animation:teaserIconFloat 3s ease-in-out infinite">${opts.icon}</div>
                    <h3 class="text-lg font-black text-white text-center leading-tight drop-shadow-md">${opts.title}</h3>
                </div>
            </div>
            <!-- Close -->
            <button id="close-teaser-modal" class="absolute top-3 right-3 w-9 h-9 flex items-center justify-center bg-white/20 backdrop-blur-sm rounded-full text-white/80 hover:bg-white hover:text-red-500 transition-all text-sm font-bold z-20 border border-white/20">✕</button>
            <!-- Content -->
            <div class="p-6">
                <div class="text-sm text-slate-600 leading-relaxed mb-5">${opts.body}</div>
                <a href="${ctaHref}" class="teaser-cta-btn block w-full text-center text-white font-black py-4 px-6 rounded-2xl shadow-lg shadow-indigo-200/40 hover:shadow-xl hover:shadow-indigo-300/60 transition-all active:scale-[0.97] text-sm tracking-wide">
                    ${ctaText}
                </a>
                <button id="dismiss-teaser-modal" class="block w-full text-center text-slate-400 font-semibold text-xs mt-3 py-2 hover:text-slate-600 transition-colors">${secondaryText}</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('close-teaser-modal').onclick = () => modal.remove();
    const dismissBtn = document.getElementById('dismiss-teaser-modal');
    dismissBtn.onclick = () => {
        modal.remove();
        if (typeof opts.onDismiss === 'function') opts.onDismiss();
    };
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
 * Inject a floating "Get Started" banner that persists during the guest quiz.
 * Pulses gently to draw attention without being annoying.
 */
export function injectGuestQuizBanner() {
    if (document.getElementById('guest-register-banner')) return;

    injectTeaserStyles();

    const banner = document.createElement('div');
    banner.id = 'guest-register-banner';
    banner.className = 'fixed z-50 text-white py-2.5 px-5 flex items-center justify-center gap-3 rounded-full shadow-xl';
    banner.style.cssText = 'bottom:1rem;left:50%;transform:translateX(-50%);max-width:min(92vw,420px);animation:guestBannerPulse 2.5s ease-in-out infinite;background:linear-gradient(135deg,rgba(79,70,229,0.92),rgba(37,99,235,0.92));backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.15);';
    banner.innerHTML = `
        <span class="text-[11px] font-bold tracking-wide whitespace-nowrap"><i class="fas fa-gift mr-1"></i>Guest Mode</span>
        <a href="${getIndexUrl()}" class="bg-white text-indigo-700 font-black text-[11px] px-4 py-1.5 rounded-full hover:bg-indigo-50 transition active:scale-95 whitespace-nowrap shadow-sm border border-indigo-100">
            Get Started — Subscribe Today →
        </a>
    `;

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
    const heroImg = getImagePath();

    injectTeaserStyles();

    // Remove any existing flyer
    const existing = document.getElementById('guest-results-flyer');
    if (existing) existing.remove();

    const flyer = document.createElement('div');
    flyer.id = 'guest-results-flyer';
    flyer.className = 'w-full max-w-4xl mx-auto mb-8 px-4';

    // Common features (all classes)
    const commonFeatures = `
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            <div class="teaser-feature-card bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200/60 rounded-2xl p-5 text-center">
                <div class="w-10 h-10 mx-auto mb-3 rounded-xl bg-blue-100 flex items-center justify-center text-xl shadow-sm">📊</div>
                <h4 class="font-bold text-blue-800 text-sm">Knowledge Hub</h4>
                <p class="text-xs text-blue-600 mt-1.5 leading-relaxed">Track mastery across every subject. See your strengths & blind spots in real-time.</p>
            </div>
            <div class="teaser-feature-card bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200/60 rounded-2xl p-5 text-center">
                <div class="w-10 h-10 mx-auto mb-3 rounded-xl bg-purple-100 flex items-center justify-center text-xl shadow-sm">📓</div>
                <h4 class="font-bold text-purple-800 text-sm">Mistake Notebook</h4>
                <p class="text-xs text-purple-600 mt-1.5 leading-relaxed">Every wrong answer is auto-saved. Review, retry, and eliminate repeat errors.</p>
            </div>
            <div class="teaser-feature-card bg-gradient-to-br from-green-50 to-green-100/50 border border-green-200/60 rounded-2xl p-5 text-center">
                <div class="w-10 h-10 mx-auto mb-3 rounded-xl bg-green-100 flex items-center justify-center text-xl shadow-sm">🎯</div>
                <h4 class="font-bold text-green-800 text-sm">Student Dashboard</h4>
                <p class="text-xs text-green-600 mt-1.5 leading-relaxed">Cognitive profiling, performance vectors, and personalized improvement paths.</p>
            </div>
        </div>
    `;

    // Board-year specific content (Class 10 & 12)
    const boardYearContent = isBoardYear ? `
        <div class="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-2xl p-5 mb-4">
            <div class="flex items-start gap-3 mb-3">
                <div class="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-2xl flex-shrink-0 shadow-sm">📋</div>
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
        <div class="bg-white rounded-3xl border border-slate-200/80 shadow-xl overflow-hidden">
            <!-- Hero with student image -->
            <div class="relative bg-gradient-to-r from-indigo-600 via-blue-600 to-purple-700 text-white p-6 text-center overflow-hidden">
                <img src="${heroImg}" alt="Students learning" class="absolute right-0 top-0 h-full object-cover opacity-15 mix-blend-luminosity pointer-events-none" style="-webkit-mask-image:linear-gradient(to left,rgba(0,0,0,0.5),transparent 60%);mask-image:linear-gradient(to left,rgba(0,0,0,0.5),transparent 60%);" onerror="this.style.display='none'" />
                <div class="absolute -top-10 -left-10 w-40 h-40 bg-white/5 rounded-full"></div>
                <div class="absolute -bottom-6 right-20 w-24 h-24 bg-white/5 rounded-full"></div>
                <div class="relative z-10">
                    <h3 class="text-lg font-black tracking-tight drop-shadow-md">🚀 Unlock Your Full Potential</h3>
                    <p class="text-xs text-indigo-100 mt-1 font-medium">You just completed a quiz as Guest — here's what registered students get:</p>
                </div>
            </div>
            <div class="p-6">
                ${boardYearContent}
                ${commonFeatures}
                <div class="mt-6 text-center">
                    <a href="${getIndexUrl()}" class="teaser-cta-btn inline-flex items-center gap-2 text-white font-black py-3.5 px-8 rounded-2xl shadow-lg shadow-indigo-200/40 hover:shadow-xl hover:shadow-indigo-300/60 transition-all active:scale-[0.97] text-sm">
                        <i class="fas fa-user-plus"></i> Get Started — Subscribe Today
                    </a>
                    <p class="text-[10px] text-slate-400 mt-2.5">Unlock your full potential. Get started in 30 seconds.</p>
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
                ctaText: "Get Started — Subscribe Today"
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
                            <p class="text-xs font-bold text-green-700"><i class="fas fa-check-circle mr-1"></i> Registration includes:</p>
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
                ctaText: "Get Started — Subscribe Today",
                secondaryText: "Try Simple as Guest",
                onDismiss: () => {
                    if (typeof origLaunch === 'function') {
                        origLaunch('Simple');
                    }
                }
            });
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
        return '../index.html#get-started';
    }
    return './index.html#get-started';
}

/**
 * Get the path to the student hero image, working from any page depth.
 */
function getImagePath() {
    const path = window.location.pathname;
    if (path.includes('/app/')) {
        return '../image_0.png';
    }
    return './image_0.png';
}
