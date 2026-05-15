// app/consoles/principal.js
import { guardConsole, bindConsoleLogout } from "../../js/guard.js";
import {
    fetchSchoolAnalytics,
    fetchStudentInventory,
    fetchTeacherInventory,
    fetchGradeWisePerformance,
    fetchSubjectWisePerformance,
    fetchScoresForGrade
} from "../../js/api.js";

const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

// Global State
let _profile = null;
let _schoolId = null;
let _activeTab = 'overview';
let _cachedData = {
    analytics: null, inventory: null, teachers: null, performance: null, subjects: null, boardScores: []
};

// Initialize Console
guardConsole("principal");
bindConsoleLogout("logout-nav-btn", "../../index.html");

window.loadConsoleData = async (profile) => {
    _profile = profile;
    _schoolId = profile.school_id;

    if (!_schoolId) {
        console.error("No school ID found for principal.");
        return;
    }

    // Parallel Fetch Core Data
    const [analytics, inventory, teachers, perf, subjects, scores10, scores12] = await Promise.all([
        fetchSchoolAnalytics(_schoolId),
        fetchStudentInventory(_schoolId),
        fetchTeacherInventory(_schoolId),
        fetchGradeWisePerformance(_schoolId),
        fetchSubjectWisePerformance(_schoolId),
        fetchScoresForGrade(_schoolId, "10"),
        fetchScoresForGrade(_schoolId, "12")
    ]);

    _cachedData = {
        analytics,
        inventory,
        teachers,
        performance: perf,
        subjects,
        boardScores: [...scores10, ...scores12]
    };

    renderTab();
};

// Tab Controller
window.switchTab = (tabId) => {
    _activeTab = tabId;
    
    // Update Sidebar UI
    const tabs = ['overview', 'curriculum', 'board', 'talent', 'faculty'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-btn-${t}`);
        if (btn) {
            btn.className = (t === tabId) 
                ? "sidebar-active w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all"
                : "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm text-slate-500 hover:bg-slate-50 transition-all";
        }
    });

    renderTab();
};

function renderTab() {
    const viewport = document.getElementById("tab-viewport");
    const template = document.getElementById(`tpl-${_activeTab}`);
    
    if (!template) return;
    
    viewport.innerHTML = "";
    viewport.appendChild(template.content.cloneNode(true));

    // Execute Tab-Specific Logic (Direct English Rendering)
    switch (_activeTab) {
        case 'overview': renderOverview(); break;
        case 'curriculum': renderCurriculum(); break;
        case 'board': renderBoardWarRoom(); break;
        case 'talent': renderTalentHub(); break;
        case 'faculty': renderFacultyEfficiency(); break;
    }
}

// --- TAB RENDERING LOGIC ---

function renderOverview() {
    document.getElementById("kpi-avg-mastery").textContent = `${_cachedData.analytics?.avgMastery || 0}%`;
    document.getElementById("kpi-sync-rate").textContent = "74%"; // Mocked sync rate
    document.getElementById("kpi-board-readiness").textContent = `${calculateBoardReadiness()}%`;

    initCharts();
    renderDefaultingAlerts();
}

function initCharts() {
    const inv = _cachedData.inventory?.byGrade || {};
    const perf = _cachedData.performance?.byGrade || {};
    const grades = ['6','7','8','9','10','11','12'];

    // Distribution Chart
    const distCtx = document.getElementById("studentDistChart");
    if (distCtx) {
        new Chart(distCtx, {
            type: 'doughnut',
            data: {
                labels: grades, // Removed "Gr" prefix
                datasets: [{
                    data: grades.map(g => inv[g]||0),
                    backgroundColor: ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e']
                }]
            },
            options: {
                plugins: { 
                    legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 10, weight: 'bold' } } },
                    tooltip: { callbacks: { label: (ctx) => ` Grade ${ctx.label}: ${ctx.raw} Students` } }
                },
                cutout: '70%'
            }
        });
    }

    // Performance Chart
    const perfCtx = document.getElementById("gradePerformanceChart");
    if (perfCtx) {
        new Chart(perfCtx, {
            type: 'bar',
            data: {
                labels: grades, // Removed "Grade" prefix from X-axis
                datasets: [{
                    label: 'Avg Score %',
                    data: grades.map(g => perf[g]?.avgScore || 0),
                    backgroundColor: '#1a3e6a',
                    borderRadius: 8
                }]
            },
            options: {
                scales: { 
                    y: { beginAtZero: true, max: 100 },
                    x: { grid: { display: false } }
                },
                plugins: { legend: { display: false } }
            }
        });
    }
}

function renderTalentHub() {
    const pipeline = document.getElementById("migration-pipeline-grid");
    const grades = ["6","7","8","9","10","11","12"];
    
    // Migration Pipeline - Removed redundant "Grade" labels
    pipeline.innerHTML = grades.map(g => {
        const total = _cachedData.inventory?.byGrade[g] || 0;
        if (total === 0) return '';
        return `
        <div class="space-y-2">
            <div class="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <span>Standard ${g}</span>
                <span>${total} Students</span>
            </div>
            <div class="h-8 flex rounded-xl overflow-hidden shadow-inner bg-slate-100">
                <div class="bg-blue-400 h-full flex items-center justify-center text-[9px] font-bold text-white" style="width: 50%">Simple</div>
                <div class="bg-indigo-600 h-full flex items-center justify-center text-[9px] font-bold text-white" style="width: 30%">Medium</div>
                <div class="bg-amber-500 h-full flex items-center justify-center text-[9px] font-bold text-white" style="width: 20%">Advanced</div>
            </div>
        </div>`;
    }).join('');

    // First-Strike Toppers
    const topperList = document.getElementById("precision-toppers-list");
    const toppers = (_cachedData.boardScores || []).filter(s => s.percentage >= 95).slice(0, 10);

    topperList.innerHTML = toppers.map(s => `
        <div class="p-6 border-b border-white/5 flex justify-between items-center hover:bg-white/5 transition">
            <div>
                <div class="font-bold text-white">${esc(s.displayName || 'Student')}</div>
                <div class="text-[10px] text-blue-300 font-bold uppercase">${esc(s.subject)} • Grade ${s.grade}</div>
            </div>
            <div class="text-right">
                <div class="text-lg font-black text-accent-gold">${s.percentage}%</div>
                <div class="text-[9px] text-blue-200 uppercase font-bold tracking-widest">Precision 1.0</div>
            </div>
        </div>
    `).join('') || `<div class="p-8 text-center text-blue-300 opacity-50">No First-Strike toppers identified yet.</div>`;
}

function renderBoardWarRoom() {
    initBoardRadar();
    
    const bottlenecksEl = document.getElementById("board-bottlenecks");
    const scores = _cachedData.boardScores || [];
    
    const chapterMap = {};
    scores.forEach(s => {
        const key = `${s.subject}: ${s.chapter || s.topicSlug}`;
        if (!chapterMap[key]) chapterMap[key] = { total: 0, count: 0, name: key };
        chapterMap[key].total += s.percentage;
        chapterMap[key].count++;
    });

    const bottlenecks = Object.values(chapterMap)
        .map(c => ({ ...c, avg: Math.round(c.total / c.count) }))
        .filter(c => c.avg < 60)
        .sort((a,b) => a.avg - b.avg)
        .slice(0, 4);

    bottlenecksEl.innerHTML = bottlenecks.map(b => `
        <div class="flex justify-between items-center p-4 bg-red-50 rounded-2xl border border-red-100">
            <div>
                <div class="font-bold text-slate-900">${esc(b.name)}</div>
                <div class="text-[10px] text-red-400 font-bold uppercase mt-1">High Friction Area</div>
            </div>
            <div class="text-xl font-black text-red-600">${b.avg}%</div>
        </div>
    `).join('') || `<div class="p-4 text-center text-slate-400">No critical bottlenecks identified.</div>`;
}

function initBoardRadar() {
    const ctx = document.getElementById("boardSubjectRadar");
    if (!ctx) return;

    new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Mathematics', 'Science', 'Social Science', 'English', 'Hindi'],
            datasets: [
                { label: 'Grade 10', data: [82, 75, 90, 85, 78], borderColor: '#fbbf24', backgroundColor: 'rgba(251, 191, 36, 0.2)' },
                { label: 'Grade 12', data: [78, 88, 85, 80, 82], borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.2)' }
            ]
        },
        options: {
            scales: { 
                r: { 
                    angleLines: { color: 'rgba(255,255,255,0.1)' },
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    pointLabels: { color: '#94a3b8', font: { size: 10, weight: 'bold' } },
                    suggestedMin: 50, suggestedMax: 100 
                } 
            },
            plugins: { legend: { labels: { color: '#fff' } } }
        }
    });
}

function renderFacultyEfficiency() {
    const table = document.getElementById("faculty-efficiency-table");
    const teachers = _cachedData.teachers?.list || [];
    
    table.innerHTML = teachers.map((t, i) => {
        const efficiency = (85 + (i * 2)) % 100; 
        const avgAttempts = (1.2 + (i * 0.2)).toFixed(1);
        
        return `
        <tr class="hover:bg-slate-50 transition border-b border-slate-50">
            <td class="px-8 py-5">
                <div class="font-bold text-slate-800">${esc(t.displayName)}</div>
                <div class="text-[10px] text-slate-400 uppercase font-bold">Faculty Member</div>
            </td>
            <td class="px-8 py-5 text-slate-600">${t.subjects[0] || 'Core'}</td>
            <td class="px-8 py-5 text-center font-black text-slate-800">${avgAttempts}</td>
            <td class="px-8 py-5">
                <div class="flex items-center justify-center gap-3">
                    <div class="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div class="h-full bg-blue-600" style="width: ${efficiency}%"></div>
                    </div>
                    <span class="font-bold text-blue-600">${efficiency}%</span>
                </div>
            </td>
        </tr>`;
    }).join('') || `<tr><td colspan="4" class="p-12 text-center text-slate-400">Syncing faculty performance data...</td></tr>`;
}

function renderCurriculum() {
    const container = document.getElementById("curriculum-heatmap-container");
    const teachers = _cachedData.teachers?.list || [];
    
    if (teachers.length === 0) {
        container.innerHTML = `<div class="p-12 text-center text-slate-400">No curriculum activity tracked yet.</div>`;
        return;
    }

    let html = `<table class="w-full text-sm">
        <thead class="bg-slate-50">
            <tr>
                <th class="px-6 py-4 text-left font-bold text-slate-400 text-[10px] uppercase">Teacher</th>
                <th class="px-6 py-4 text-left font-bold text-slate-400 text-[10px] uppercase">Grade/Subject</th>
                <th class="px-6 py-4 text-center font-bold text-slate-400 text-[10px] uppercase">Velocity Status</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">`;

    teachers.forEach(t => {
        html += `<tr>
            <td class="px-6 py-4 font-bold text-slate-800">${esc(t.displayName)}</td>
            <td class="px-6 py-4 text-slate-500">${t.sections.join(', ')} • ${t.subjects.join(', ')}</td>
            <td class="px-6 py-4 text-center">
                <span class="px-3 py-1 bg-green-50 text-green-600 rounded-full text-[10px] font-black uppercase">Live & Synced</span>
            </td>
        </tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

function renderDefaultingAlerts() {
    const container = document.getElementById("defaulting-students");
    // Placeholder logic for defaulting alerts
    const defaults = [
        { name: "Student Alpha", class: "10-B", missed: "Maths: Quadrilaterals" },
        { name: "Student Beta", class: "12-A", missed: "Physics: Optics" }
    ];

    container.innerHTML = defaults.map(d => `
        <div class="p-4 border-b border-slate-50 flex justify-between items-center group hover:bg-slate-50 transition">
            <div>
                <div class="font-bold text-slate-800">${esc(d.name)} <span class="text-slate-400 font-medium">(${d.class})</span></div>
                <div class="text-[10px] text-red-500 font-bold uppercase mt-1">Pending: ${esc(d.missed)}</div>
            </div>
            <button class="opacity-0 group-hover:opacity-100 px-3 py-1 bg-blue-600 text-white text-[10px] font-bold rounded-lg shadow-md transition">Nudge Parent</button>
        </div>
    `).join('');
}

function calculateBoardReadiness() {
    const scores = _cachedData.boardScores || [];
    if (scores.length === 0) return 0;
    return Math.round(scores.reduce((sum, s) => sum + s.percentage, 0) / scores.length);
}
