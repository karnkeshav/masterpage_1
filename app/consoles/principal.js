// app/consoles/principal.js
import { guardConsole, bindConsoleLogout } from "../../js/guard.js";
import {
    fetchSchoolAnalytics, fetchStudentInventory, fetchTeacherInventory,
    fetchGradeWisePerformance, fetchSubjectWisePerformance, fetchScoresForGrade
} from "../../js/api.js";

const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

// Global State
let _profile = null;
let _schoolId = null;
let _activeTab = 'overview';
let _cachedData = {
    analytics: null, inventory: null, teachers: null, 
    performance: null, subjects: null, boardScores: []
};

// Initialize Security and Navigation
guardConsole("principal");
bindConsoleLogout("logout-nav-btn", "../../index.html");

window.loadConsoleData = async (profile) => {
    _profile = profile;
    _schoolId = profile.school_id;

    if (!_schoolId) {
        console.error("No school ID found for principal.");
        return;
    }

    // Parallel Fetch all Firestore Data
    const [analytics, inventory, teachers, perf, subjects, s10, s12] = await Promise.all([
        fetchSchoolAnalytics(_schoolId), 
        fetchStudentInventory(_schoolId), 
        fetchTeacherInventory(_schoolId),
        fetchGradeWisePerformance(_schoolId), 
        fetchSubjectWisePerformance(_schoolId),
        fetchScoresForGrade(_schoolId, "10"), 
        fetchScoresForGrade(_schoolId, "12")
    ]);

    _cachedData = { 
        analytics, inventory, teachers, performance: perf, subjects, 
        boardScores: [...s10, ...s12] 
    };

    renderTab();
};

window.switchTab = (tabId) => {
    _activeTab = tabId;
    const tabs = ['overview', 'curriculum', 'board', 'talent', 'faculty'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-btn-${t}`);
        if (btn) btn.className = (t === tabId) 
            ? "sidebar-active w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all" 
            : "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm text-slate-500 hover:bg-slate-50 transition-all";
    });
    renderTab();
};

function renderTab() {
    const viewport = document.getElementById("tab-viewport");
    const template = document.getElementById(`tpl-${_activeTab}`);
    if (!template) return;
    viewport.innerHTML = "";
    viewport.appendChild(template.content.cloneNode(true));

    switch (_activeTab) {
        case 'overview': renderOverview(); break;
        case 'curriculum': renderCurriculum(); break;
        case 'talent': renderTalentHub(); break;
    }
}

// --- CURRICULUM VELOCITY (Subject Filter Integrated) ---
function renderCurriculum() {
    const filter = document.getElementById("curriculum-subject-filter");
    const container = document.getElementById("curriculum-heatmap-container");
    const teachers = _cachedData.teachers?.list || [];

    // Extract unique subjects from faculty data
    const uniqueSubjects = [...new Set(teachers.flatMap(t => t.subjects))];
    filter.innerHTML = `<option value="all">All Subjects</option>` + 
        uniqueSubjects.map(s => `<option value="${s}">${s}</option>`).join('');

    const updateTable = (subjectFilter) => {
        const filtered = subjectFilter === 'all' 
            ? teachers 
            : teachers.filter(t => t.subjects.includes(subjectFilter));
        
        let html = `<table class="w-full text-sm">
            <thead class="bg-slate-50"><tr>
                <th class="px-6 py-4 text-left font-bold text-slate-400 text-[10px] uppercase">Teacher</th>
                <th class="px-6 py-4 text-left font-bold text-slate-400 text-[10px] uppercase">Grade/Section</th>
                <th class="px-6 py-4 text-center font-bold text-slate-400 text-[10px] uppercase">Velocity</th>
            </tr></thead><tbody class="divide-y divide-slate-100">`;

        filtered.forEach(t => {
            html += `<tr>
                <td class="px-6 py-4 font-bold text-slate-800">${esc(t.displayName)}</td>
                <td class="px-6 py-4 text-slate-500">${t.sections.join(', ')}</td>
                <td class="px-6 py-4 text-center">
                    <span class="px-3 py-1 bg-green-50 text-green-600 rounded-full text-[10px] font-black uppercase tracking-widest">Synced</span>
                </td>
            </tr>`;
        });
        container.innerHTML = html + `</tbody></table>`;
    };

    filter.onchange = (e) => updateTable(e.target.value);
    updateTable('all');
}

// --- DYNAMIC TALENT & RECOVERY HUB (Attempts & Mastery Logic) ---
function renderTalentHub() {
    const scores = _cachedData.boardScores;
    const topperList = document.getElementById("precision-toppers-list");
    const remedialList = document.getElementById("recovery-remedial-list");

    // Dynamic Mastery Processor: Groups raw quiz scores into individual student metrics
    const mastery = {};
    scores.forEach(s => {
        const key = `${s.user_id}_${s.subject}_${s.chapter || s.topicSlug}`;
        if (!mastery[key]) {
            mastery[key] = { 
                name: s.displayName || 'Unknown Student', 
                classSection: `${s.grade || '10'}-${s.section || 'A'}`,
                chapter: s.chapter || s.topicSlug,
                subject: s.subject,
                attempts: 0,
                bestScore: 0
            };
        }
        mastery[key].attempts++;
        if (s.percentage > mastery[key].bestScore) mastery[key].bestScore = s.percentage;
    });

    const results = Object.values(mastery);
    
    // Toppers: Filter for students achieving >= 95%
    topperList.innerHTML = results.filter(r => r.bestScore >= 95)
        .sort((a,b) => a.attempts - b.attempts)
        .map(r => `
            <div class="p-6 border-b border-white/5 flex justify-between items-center group hover:bg-white/5 transition">
                <div>
                    <div class="font-bold text-white">${esc(r.name)} <span class="text-blue-300 font-medium">(${esc(r.classSection)})</span></div>
                    <div class="text-[10px] text-blue-200 font-bold uppercase mt-1">${esc(r.subject)} • ${esc(r.chapter)}</div>
                </div>
                <div class="text-right">
                    <div class="text-lg font-black text-accent-gold">${r.bestScore}%</div>
                    <div class="text-[9px] text-blue-200 uppercase font-bold tracking-widest">${r.attempts} Attempt(s)</div>
                </div>
            </div>`).join('') || `<div class="p-8 text-center text-blue-300 opacity-50">No toppers identified.</div>`;

    // Remedial Queue: Filter for students stuck below 60% mastery
    remedialList.innerHTML = results.filter(r => r.bestScore < 60)
        .sort((a,b) => b.attempts - a.attempts)
        .map(r => `
            <div class="p-6 border-b border-slate-50 flex justify-between items-center group hover:bg-slate-50 transition">
                <div>
                    <div class="font-bold text-slate-800">${esc(r.name)} <span class="text-slate-400 font-medium">(${esc(r.classSection)})</span></div>
                    <div class="text-[10px] text-red-500 font-bold uppercase mt-1">${esc(r.subject)} • ${esc(r.chapter)}</div>
                </div>
                <div class="text-right">
                    <div class="text-lg font-black text-red-600">${r.bestScore}%</div>
                    <div class="text-[9px] text-slate-400 uppercase font-bold tracking-widest">${r.attempts} Attempt(s)</div>
                </div>
            </div>`).join('') || `<div class="p-8 text-center text-slate-400">All students are above the safety threshold.</div>`;
}

// --- GLOBAL OVERVIEW ---
function renderOverview() {
    document.getElementById("kpi-avg-mastery").textContent = `${_cachedData.analytics?.avgMastery || 0}%`;
    document.getElementById("kpi-sync-rate").textContent = "74%"; 
    const scores = _cachedData.boardScores;
    const readiness = scores.length ? Math.round(scores.reduce((sum, s) => sum + s.percentage, 0) / scores.length) : 0;
    document.getElementById("kpi-board-readiness").textContent = `${readiness}%`;
    initCharts();
}

function initCharts() {
    const inv = _cachedData.inventory?.byGrade || {};
    const perf = _cachedData.performance?.byGrade || {};
    const grades = ['6','7','8','9','10','11','12'];

    new Chart(document.getElementById("studentDistChart"), {
        type: 'doughnut',
        data: { labels: grades, datasets: [{ data: grades.map(g => inv[g]||0), backgroundColor: ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'] }] },
        options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 10, weight: 'bold' } } } }, cutout: '70%' }
    });

    new Chart(document.getElementById("gradePerformanceChart"), {
        type: 'bar',
        data: { labels: grades, datasets: [{ label: 'Avg Score %', data: grades.map(g => perf[g]?.avgScore || 0), backgroundColor: '#1a3e6a', borderRadius: 8 }] },
        options: { scales: { y: { beginAtZero: true, max: 100 }, x: { grid: { display: false } } }, plugins: { legend: { display: false } } }
    });
}
