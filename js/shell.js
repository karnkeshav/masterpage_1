// js/shell.js
// Shared Header & Footer renderer — Single Source of Truth.
// Load via: <script src="{path}/js/shell.js"></script>
// Must be loaded AFTER Tailwind CDN + tailwind-config.js so Tailwind classes work.

var R4E = R4E || {};

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
R4E.renderHeader = function(config) {
    var c = config || {};
    var targetId = c.targetId || "app-header";
    var target = document.getElementById(targetId);
    if (!target) return;

    var title = c.title || "Ready4Exam";
    var titleId = c.titleId ? ' id="' + c.titleId + '"' : '';
    var subtitle = c.subtitle !== undefined ? c.subtitle : "Ready4Exam &bull; Powered by Ready4Industry";
    var userDefault = c.userWelcomeDefault || "Student";
    var showUser = c.showUserWelcome !== false;
    var roleBadge = c.roleBadge || "";
    var roleBadgeId = c.roleBadgeId ? ' id="' + c.roleBadgeId + '"' : '';
    var showInbox = c.showInbox === true;
    var inboxOnclick = c.inboxOnclick || "toggleInbox()";
    var showLogout = c.showLogout !== false;
    var logoutId = c.logoutId || "logout-nav-btn";
    var glass = c.glass === true;
    var layout = c.layout || "flex";
    var centerHtml = c.centerHtml || "";
    var extraRightHtml = c.extraRightHtml || "";

    // Layout class
    var layoutClass = layout === "grid-3"
        ? "grid grid-cols-1 lg:grid-cols-3 items-center gap-y-2"
        : "flex justify-between items-center";

    var glassClass = glass ? " glass-panel border-b border-white/10" : "";

    // Left section
    var leftJustify = layout === "grid-3" ? " justify-self-start" : "";
    var leftHtml = ''
        + '<div class="flex items-center space-x-4' + leftJustify + '">'
        +   '<div>'
        +     '<h2' + titleId + ' class="text-xl font-black leading-none tracking-tight text-accent-gold">' + title + '</h2>'
        +     '<p class="text-[10px] font-bold uppercase tracking-widest mt-1 text-white opacity-80 italic tracking-wide">' + subtitle + '</p>'
        +   '</div>'
        + '</div>';

    // Center section (only for grid-3)
    var centerSection = layout === "grid-3" ? centerHtml : "";

    // Right section
    var rightJustify = layout === "grid-3" ? " justify-self-end" : "";
    var rightHtml = '<div class="flex items-center space-x-3' + rightJustify + '">';

    // Extra right HTML (e.g. parent notification dropdown)
    rightHtml += extraRightHtml;

    // User welcome + role badge
    if (showUser) {
        rightHtml += '<div class="hidden md:flex flex-col items-end mr-2">';
        rightHtml += '<span id="user-welcome" class="text-xs font-bold text-white max-w-[200px] truncate">' + userDefault + '</span>';
        if (roleBadge) {
            rightHtml += '<span' + roleBadgeId + ' class="text-[10px] font-black text-accent-gold bg-cbse-blue px-2 py-0.5 rounded uppercase tracking-wide">' + roleBadge + '</span>';
        }
        rightHtml += '</div>';
    }

    // Inbox bell
    if (showInbox) {
        rightHtml += '<button onclick="' + inboxOnclick + '" class="w-11 h-11 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-lg hover:bg-indigo-200 transition relative">'
            + '🔔<span id="inbox-badge" class="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full hidden">0</span>'
            + '</button>';
    }

    // Logout button
    if (showLogout) {
        rightHtml += '<button id="' + logoutId + '" class="w-11 h-11 flex items-center justify-center bg-red-50 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition shadow-sm" title="Sign Out">🚪</button>';
    }

    rightHtml += '</div>';

    // Assemble
    var headerHtml = '<header class="bg-cbse-blue shadow-lg py-3 px-6 sticky top-0 z-40 ' + layoutClass + ' text-white' + glassClass + '">'
        + leftHtml
        + centerSection
        + rightHtml
        + '</header>';

    target.outerHTML = headerHtml;
};

/**
 * Render the standard Ready4Exam footer.
 * @param {string} [targetId] - Target element id. Default: "app-footer"
 */
R4E.renderFooter = function(targetId) {
    var id = targetId || "app-footer";
    var target = document.getElementById(id);
    if (!target) return;

    target.outerHTML = '<footer class="bg-cbse-blue text-white/50 text-[10px] md:text-xs text-center py-8 mt-auto border-t border-white/5">'
        + '<p>&copy; 2026 Ready4Exam Academic Portal.</p>'
        + '</footer>';
};
