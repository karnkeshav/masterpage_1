// js/shell.js
// Shared Header & Footer renderer — Single Source of Truth.
// Load via: <script src="{path}/js/shell.js"></script>
// Must be loaded AFTER Tailwind CDN + tailwind-config.js so Tailwind classes work.

const R4E = window.R4E || {};
window.R4E = R4E;

const getLanguageSwitcherHtml = () => {
    const current = (window.R4ETranslator && window.R4ETranslator.getLanguage()) || localStorage.getItem('r4e_lang') || 'en';
    const supportedLanguages = (window.R4E_I18N_CONFIG && window.R4E_I18N_CONFIG.supportedLanguages) || ['en', 'te', 'hi'];

    const langMap = {
        'en': { label: 'EN', icon: '🇬🇧' },
        'te': { label: 'తె', icon: '🇮🇳' },
        'hi': { label: 'हि', icon: '🇮🇳' }
    };

    const mk = (code, label, icon) => {
        const active = current === code ? 'bg-white text-cbse-blue' : 'bg-cbse-blue/40 text-white';
        return `<button type="button" class="r4e-lang-btn px-2 py-1 rounded-md text-[11px] font-black transition ${active}" data-lang="${code}" title="${label}">${icon} ${label}</button>`;
    };

    const buttonsHtml = supportedLanguages.map(code => {
        const info = langMap[code] || { label: code.toUpperCase(), icon: '🌐' };
        return mk(code, info.label, info.icon);
    }).join('');

    return `<div class="flex items-center gap-1 p-1 rounded-lg bg-cbse-blue/60 border border-white/20" aria-label="Language switcher">${buttonsHtml}</div>`;
}

const wireLanguageSwitcher = () => {
    const buttons = document.querySelectorAll('.r4e-lang-btn');
    if (!buttons.length) return;

    // Check if we already added a listener on document to avoid multiple bindings, but since innerHTML recreates buttons, we bind directly
    buttons.forEach(btn => {
        // Remove existing listeners by replacing the button with a clone
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const nextLang = newBtn.getAttribute('data-lang');
            console.log('Language switcher clicked: ', nextLang);
            if (window.R4ETranslator) {
                window.R4ETranslator.setLanguage(nextLang).then(() => {
                    document.dispatchEvent(new CustomEvent('r4e_i18n_update', { detail: { lang: nextLang } }));

                    // Also re-render the language switcher buttons to update the active state class
                    const oldHtml = document.querySelector('[aria-label="Language switcher"]');
                    if(oldHtml) {
                        oldHtml.outerHTML = getLanguageSwitcherHtml();
                        wireLanguageSwitcher(); // re-wire newly injected HTML
                    }
                });
            } else {
                localStorage.setItem('r4e_lang', nextLang);
            }
        });
    });
}


/**
 * Render the standard Ready4Exam header.
 *
 * @param {Object} config
 * @param {string}  config.title            - Page title displayed in gold (e.g. "Class Hub")
 * @param {string} [config.titleId]         - Optional id attribute on the <h2> title element
 * @param {string} [config.subtitle]        - Subtitle text. Default: "Ready4Exam &bull; Powered by Ready4Industry"
 * @param {string} [config.userWelcomeDefault] - Default text for #user-welcome. Default: "Student"
 * @param {boolean}[config.showUserWelcome] - Whether to show user-welcome + role badge. Default: true
 * @param {string} [config.roleBadge]       - Role badge text (e.g. "Admin Role", "Grade --"). Omit to hide badge.
 * @param {string} [config.roleBadgeId]     - Optional id on the role badge span (e.g. "context-badge")
 * @param {boolean}[config.showInbox]       - Show the 🔔 inbox bell button. Default: false
 * @param {string} [config.inboxOnclick]    - onclick handler string for inbox button. Default: "toggleInbox()"
 * @param {boolean}[config.showLogout]      - Show the 🚪 logout button. Default: true
 * @param {string} [config.logoutId]        - id for logout button. Default: "logout-nav-btn"
 * @param {boolean}[config.glass]           - Add glass-panel class to header. Default: false
 * @param {string} [config.layout]          - "flex" (default) or "grid-3" (for teacher 3-column layout)
 * @param {string} [config.centerHtml]      - Raw HTML injected in center column (only used with layout:"grid-3")
 * @param {string} [config.extraRightHtml]  - Raw HTML injected before user-welcome in the right section
 * @param {string} [config.targetId]        - Target element id. Default: "app-header"
 */
R4E.renderHeader = (config = {}) => {
    const targetId = config.targetId || "app-header";
    const target = document.getElementById(targetId);
    if (!target) return;

    const title = config.title || "Ready4Exam";
    const titleId = config.titleId ? ` id="${config.titleId}"` : '';
    const subtitle = config.subtitle !== undefined ? config.subtitle : "Ready4Exam &bull; Powered by Ready4Industry";
    const userDefault = config.userWelcomeDefault || "Student";
    const showUser = config.showUserWelcome !== false;
    const roleBadge = config.roleBadge || "";
    const roleBadgeId = config.roleBadgeId ? ` id="${config.roleBadgeId}"` : '';
    const showInbox = config.showInbox === true;
    const inboxOnclick = config.inboxOnclick || "toggleInbox()";
    const showLogout = config.showLogout !== false;
    const logoutId = config.logoutId || "logout-nav-btn";
    const glass = config.glass === true;
    const layout = config.layout || "flex";
    const centerHtml = config.centerHtml || "";
    const extraRightHtml = config.extraRightHtml || "";
    const showLanguageToggle = config.showLanguageToggle !== false;

    const layoutClass = layout === "grid-3"
        ? "grid grid-cols-1 lg:grid-cols-3 items-center gap-y-2"
        : "flex justify-between items-center";

    const glassClass = glass ? " glass-panel border-b border-white/10" : "";

    const leftJustify = layout === "grid-3" ? " justify-self-start" : "";
    const leftHtml = `<div class="flex items-center space-x-4${leftJustify}">
          <div>
            <h2${titleId} class="text-xl font-black leading-none tracking-tight text-accent-gold">${title}</h2>
            <p class="text-[10px] font-bold uppercase tracking-widest mt-1 text-white opacity-80 italic tracking-wide">${subtitle}</p>
          </div>
        </div>`;

    const centerSection = layout === "grid-3" ? centerHtml : "";

    const rightJustify = layout === "grid-3" ? " justify-self-end" : "";
    let rightHtml = `<div class="flex items-center space-x-3${rightJustify}">`;

    rightHtml += extraRightHtml;

    if (showLanguageToggle) {
        rightHtml += getLanguageSwitcherHtml();
    }

    if (showUser) {
        rightHtml += `<div class="hidden md:flex flex-col items-end mr-2">`;
        rightHtml += `<span id="user-welcome" class="text-xs font-bold text-white max-w-[200px] truncate">${userDefault}</span>`;
        if (roleBadge) {
            rightHtml += `<span${roleBadgeId} class="text-[10px] font-black text-accent-gold bg-cbse-blue px-2 py-0.5 rounded uppercase tracking-wide">${roleBadge}</span>`;
        }
        rightHtml += `</div>`;
    }

    if (showInbox) {
        rightHtml += `<button onclick="${inboxOnclick}" class="w-11 h-11 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-lg hover:bg-indigo-200 transition relative">🔔<span id="inbox-badge" class="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full hidden">0</span></button>`;
    }

    if (showLogout) {
        rightHtml += `<button id="${logoutId}" class="w-11 h-11 flex items-center justify-center bg-red-50 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition shadow-sm" title="Sign Out">🚪</button>`;
    }

    rightHtml += `</div>`;

    const headerHtml = leftHtml + centerSection + rightHtml;

    target.className = `bg-cbse-blue shadow-lg py-3 px-6 sticky top-0 z-40 ${layoutClass} text-white${glassClass}`;
    if(target.tagName !== 'HEADER') {
       // Suppress the warning since the base implementation provides divs with id
       // console.warn('R4E.renderHeader target should ideally be a <header> element for semantic HTML.');
    }
    target.innerHTML = headerHtml;
    wireLanguageSwitcher();
};

/**
 * Render the standard Ready4Exam footer.
 * @param {string} [targetId] - Target element id. Default: "app-footer"
 */
R4E.renderFooter = (targetId = "app-footer") => {
    const target = document.getElementById(targetId);
    if (!target) return;

    target.className = 'bg-cbse-blue text-white/50 text-[10px] md:text-xs text-center py-8 mt-auto border-t border-white/5';
    if(target.tagName !== 'FOOTER') {
        // Suppress the warning since the base implementation provides divs with id
        // console.warn('R4E.renderFooter target should ideally be a <footer> element for semantic HTML.');
    }
    target.innerHTML = `<p>&copy; 2026 Ready4Exam Academic Portal.</p>`;
};
