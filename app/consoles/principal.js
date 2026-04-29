// app/consoles/principal.js
import { guardConsole, bindConsoleLogout } from "../../js/guard.js";
import {
    fetchSchoolAnalytics,
    fetchStudentInventory,
    fetchTeacherInventory,
    fetchGradeWisePerformance,
    fetchSubjectWisePerformance,
    fetchStudentsForGrade,
    fetchScoresForGrade
} from "../../js/api.js";

const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const trSubject = (s) => window.R4ETranslator ? window.R4ETranslator.translateSubject(s) : s;

document.addEventListener('r4e_i18n_update', () => {
    if (window.R4ETranslator) {
        window.R4ETranslator.applyTranslations(document);
    }
    // Attempt to re-render global state
    if (typeof _schoolId !== 'undefined' && _schoolId) {
        // Just reload standard charts instead of dashboard as loadSchoolDashboard isn't global
        const reloadData = async () => {
             const [analytics, studentInv, teacherInv, gradePerf, subjectPerf] = await Promise.all([
                fetchSchoolAnalytics(_schoolId),
                fetchStudentInventory(_schoolId),
                fetchTeacherInventory(_schoolId),
                fetchGradeWisePerformance(_schoolId),
                fetchSubjectWisePerformance(_schoolId)
            ]);
            renderKPIs(analytics, studentInv, teacherInv);
            renderGradeInventory(studentInv);
            renderSubjectDashboard(subjectPerf);
            renderGradeHeatmap(gradePerf);
            renderTeacherInventory(teacherInv);
            renderCharts(gradePerf, studentInv);
        };
        reloadData().catch(err => console.error('i18n reload failed:', err));
    }
});

// Module-level state for drill-down
let _schoolId = null;

// LOGOUT LOGIC — use standard bindConsoleLogout for uniformity
bindConsoleLogout("logout-nav-btn", "../../index.html");

// GLOBAL GUARD
guardConsole("principal");

// Data Loader — called by guard.js revealApp(profile)
window.loadConsoleData = async (profile) => {
    const displayName = (profile.displayName || "Principal").toUpperCase();
    document.getElementById("user-welcome").textContent = displayName;
    _schoolId = profile.school_id;

    if (!_schoolId) {
        showError("No school linked to your profile.");
        return;
    }

    // Fetch all data in parallel from Firestore
    const [analytics, studentInv, teacherInv, gradePerf, subjectPerf] = await Promise.all([
        fetchSchoolAnalytics(_schoolId),
        fetchStudentInventory(_schoolId),
        fetchTeacherInventory(_schoolId),
        fetchGradeWisePerformance(_schoolId),
        fetchSubjectWisePerformance(_schoolId)
    ]);

    renderKPIs(analytics, studentInv, teacherInv);
    renderGradeInventory(studentInv);
    renderSubjectDashboard(subjectPerf);
    renderGradeHeatmap(gradePerf);
    renderTeacherInventory(teacherInv);
    renderCharts(gradePerf, studentInv);
};

// Expose drill-down handlers to HTML onclick
window.drillDownGrade = drillDownGrade;
window.drillDownSubject = drillDownSubject;
window.closeDrillDown = closeDrillDown;

function showError(msg) {
    const app = document.getElementById("app");
    if (app) {
        app.innerHTML = `<div class="p-12 text-center"><div class="text-red-500 font-bold text-lg mb-2">Configuration Issue</div><p class="text-slate-500">${esc(msg)}</p></div>`;
    }
}

// ─── KPI Cards ──────────────────────────────────────────────
function renderKPIs(analytics, studentInv, teacherInv) {
    document.getElementById("kpi-total-students").textContent = studentInv ? studentInv.total : "0";
    document.getElementById("kpi-total-teachers").textContent = teacherInv ? teacherInv.total : "0";
    document.getElementById("kpi-teachers-sub").textContent =
        teacherInv && teacherInv.total > 0 ? `${teacherInv.total} active faculty` : "No teachers found";

    if (analytics) {
        document.getElementById("kpi-avg-mastery").textContent = `${analytics.avgMastery}%`;
        document.getElementById("kpi-mastery-sub").textContent =
            `Based on ${analytics.activeStudents} active student${analytics.activeStudents !== 1 ? 's' : ''}`;
        document.getElementById("kpi-total-quizzes").textContent = analytics.totalAttempts;
        document.getElementById("kpi-quizzes-sub").textContent = `${analytics.totalAttempts} total attempts`;
    } else {
        document.getElementById("kpi-avg-mastery").textContent = "0%";
        document.getElementById("kpi-mastery-sub").textContent = "No quiz data yet";
        document.getElementById("kpi-total-quizzes").textContent = "0";
        document.getElementById("kpi-quizzes-sub").textContent = "No attempts logged";
    }
}

// ─── Grade Inventory Cards ──────────────────────────────────
function renderGradeInventory(studentInv) {
    const container = document.getElementById("grade-inventory");
    if (!studentInv) {
        container.innerHTML = '<div class="col-span-full text-center text-slate-400 text-sm p-6">No student data available.</div>';
        return;
    }
    const grades = ["6","7","8","9","10","11","12"];
    container.innerHTML = grades.map(g => {
        const count = studentInv.byGrade[g] || 0;
        const intensity = count > 0 ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-slate-50 border-slate-200 text-slate-400';
        return `
            <div class="p-4 rounded-xl border ${intensity} text-center transition hover:shadow-md">
                <div class="text-[10px] font-bold uppercase tracking-widest mb-1">Grade ${g}</div>
                <div class="text-2xl font-black">${count}</div>
                <div class="text-[10px] font-medium mt-1">student${count !== 1 ? 's' : ''}</div>
            </div>`;
    }).join("");
}

// ─── Subject Strength Dashboard ─────────────────────────────
function renderSubjectDashboard(subjectPerf) {
    const container = document.getElementById("subject-dashboard");
    if (!subjectPerf) {
        container.innerHTML = '<div class="p-6 text-center text-slate-400 text-sm">No subject data available.</div>';
        return;
    }

    const grades = ["6","7","8","9","10","11","12"];
    // Collect all unique subjects across all grades
    const subjectSet = new Set();
    for (const g of grades) {
        const subjects = subjectPerf.byGrade[g] || {};
        Object.keys(subjects).forEach(s => subjectSet.add(s));
    }
    const subjects = Array.from(subjectSet).sort();

    if (subjects.length === 0) {
        container.innerHTML = '<div class="p-6 text-center text-slate-400 text-sm">No quiz attempts recorded yet.</div>';
        return;
    }

    let html = `<table class="w-full text-sm">
        <thead class="bg-slate-50 text-left">
            <tr>
                <th class="px-4 py-3 font-bold text-slate-500 text-[10px] uppercase tracking-widest sticky left-0 bg-slate-50 z-10">Grade</th>
                ${subjects.map(s => `<th class="px-4 py-3 font-bold text-slate-500 text-[10px] uppercase tracking-widest text-center">${esc(trSubject(s))}</th>`).join("")}
            </tr>
        </thead>
        <tbody>`;

    for (const g of grades) {
        const gradeData = subjectPerf.byGrade[g] || {};
        html += `<tr class="border-t border-slate-100 hover:bg-slate-50/50 transition">
            <td class="px-4 py-3 font-black text-slate-800 sticky left-0 bg-white z-10">Grade ${g}</td>`;
        for (const s of subjects) {
            const d = gradeData[s];
            if (!d || d.attempts === 0) {
                html += `<td class="px-4 py-3 text-center"><span class="text-slate-300 text-xs">\u2014</span></td>`;
            } else {
                const score = d.avgScore;
                const cellColor = score >= 75 ? "bg-green-50 text-green-800" : score >= 50 ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-800";
                const label = score >= 75 ? "Strong" : score >= 50 ? "Average" : "Weak";
                html += `<td class="px-2 py-2 text-center">
                    <button onclick="window.drillDownSubject('${esc(g)}','${esc(s)}')" aria-label="View ${esc(s)} performance for Grade ${esc(g)}" class="w-full rounded-lg px-2 py-2 ${cellColor} cursor-pointer hover:shadow-md transition min-h-[44px]" title="Click to drill down">
                        <div class="text-lg font-black">${score}%</div>
                        <div class="text-[9px] font-bold uppercase tracking-wide">${label}</div>
                        <div class="text-[9px] opacity-60">${d.uniqueStudents} student${d.uniqueStudents !== 1 ? 's' : ''}</div>
                    </button>
                </td>`;
            }
        }
        html += `</tr>`;
    }

    html += `</tbody></table>`;
    container.innerHTML = html;
}

// ─── Grade Performance Heatmap (clickable for drill-down) ───
function renderGradeHeatmap(gradePerf) {
    const container = document.getElementById("grade-heatmap");
    if (!gradePerf) {
        container.innerHTML = '<div class="col-span-full text-center text-slate-400 text-sm p-6">No performance data available.</div>';
        return;
    }
    const grades = ["6","7","8","9","10","11","12"];
    container.innerHTML = grades.map(g => {
        const data = gradePerf.byGrade[g] || { attempts: 0, avgScore: 0, uniqueStudents: 0 };
        const risk = data.avgScore >= 75 ? "Low" : data.avgScore >= 50 ? "Medium" : data.attempts === 0 ? "No Data" : "High";
        const riskStyle = getRiskStyle(risk);
        return `
            <button type="button" aria-label="Drill down into Grade ${g} performance" class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg transition relative overflow-hidden cursor-pointer group text-left w-full" onclick="window.drillDownGrade('${g}')">
                <div class="absolute top-0 left-0 w-1 h-full ${riskStyle.border}"></div>
                <div class="flex justify-between items-start mb-3">
                    <h3 class="text-lg font-black text-slate-900">Grade ${g}</h3>
                    <span class="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide ${riskStyle.badge}">${esc(risk)} Risk</span>
                </div>
                <div class="space-y-2 text-sm">
                    <div class="flex justify-between"><span class="text-slate-500 font-bold">Avg Score</span><span class="font-bold text-slate-900">${data.avgScore}%</span></div>
                    <div class="flex justify-between"><span class="text-slate-500 font-bold">Attempts</span><span class="font-bold text-slate-900">${data.attempts}</span></div>
                    <div class="flex justify-between"><span class="text-slate-500 font-bold">Active Students</span><span class="font-bold text-slate-900">${data.uniqueStudents}</span></div>
                </div>
                <div class="mt-3 text-center text-xs font-bold text-blue-500 opacity-0 group-hover:opacity-100 transition"><i class="fas fa-search-plus mr-1"></i>Click to drill down</div>
            </button>`;
    }).join("");
}

function getRiskStyle(risk) {
    if (risk === "High") return { border: "bg-red-500", badge: "bg-red-50 text-red-700" };
    if (risk === "Medium") return { border: "bg-amber-400", badge: "bg-amber-50 text-amber-700" };
    if (risk === "No Data") return { border: "bg-slate-300", badge: "bg-slate-50 text-slate-500" };
    return { border: "bg-green-500", badge: "bg-green-50 text-green-700" };
}

// ─── Drill-Down: Grade level (all subjects) ─────────────────
async function drillDownGrade(grade) {
    if (!_schoolId) return;
    const panel = document.getElementById("drilldown-panel");
    const titleEl = document.getElementById("drilldown-title");
    const sectionsEl = document.getElementById("drilldown-sections");
    const studentsEl = document.getElementById("drilldown-students");

    titleEl.innerHTML = `<i class="fas fa-search-plus mr-2 text-blue-600"></i>Grade ${esc(grade)} — All Subjects`;
    sectionsEl.innerHTML = '<div class="col-span-full text-center text-slate-400 text-sm p-4 animate-pulse">Loading sections &amp; students...</div>';
    studentsEl.innerHTML = '';
    panel.classList.remove("hidden");
    panel.scrollIntoView({ behavior: "smooth", block: "start" });

    const [students, scores] = await Promise.all([
        fetchStudentsForGrade(_schoolId, grade),
        fetchScoresForGrade(_schoolId, grade)
    ]);

    renderDrillDown(grade, null, students, scores);
}

// ─── Drill-Down: Subject level for a specific grade ─────────
async function drillDownSubject(grade, subject) {
    if (!_schoolId) return;
    const panel = document.getElementById("drilldown-panel");
    const titleEl = document.getElementById("drilldown-title");
    const sectionsEl = document.getElementById("drilldown-sections");
    const studentsEl = document.getElementById("drilldown-students");

    titleEl.innerHTML = `<i class="fas fa-search-plus mr-2 text-blue-600"></i>Grade ${esc(grade)} — ${esc(trSubject(subject))}`;
    sectionsEl.innerHTML = '<div class="col-span-full text-center text-slate-400 text-sm p-4 animate-pulse">Loading sections &amp; students...</div>';
    studentsEl.innerHTML = '';
    panel.classList.remove("hidden");
    panel.scrollIntoView({ behavior: "smooth", block: "start" });

    const [students, scores] = await Promise.all([
        fetchStudentsForGrade(_schoolId, grade),
        fetchScoresForGrade(_schoolId, grade)
    ]);

    renderDrillDown(grade, subject, students, scores);
}

// ─── Render drill-down results ──────────────────────────────
function renderDrillDown(grade, subject, students, scores) {
    const sectionsEl = document.getElementById("drilldown-sections");
    const studentsEl = document.getElementById("drilldown-students");

    // Filter scores to subject if specified
    const filteredScores = subject
        ? scores.filter(s => s.subject === subject)
        : scores;

    // Group students by section
    const sectionMap = {};
    students.forEach(s => {
        let sec = s.section || "Unassigned";
        // Normalize section from section_id like "9-A" → "A"
        if (!sec && s.section_id) {
            const parts = s.section_id.split("-");
            sec = parts.length > 1 ? parts[1] : parts[0];
        }
        if (!sectionMap[sec]) sectionMap[sec] = [];
        sectionMap[sec].push(s);
    });

    // Build score lookup by user_id
    const userScores = {};
    filteredScores.forEach(s => {
        if (!userScores[s.user_id]) userScores[s.user_id] = [];
        userScores[s.user_id].push(s);
    });

    // Compute per-user averages
    function getUserAvg(uid) {
        const arr = userScores[uid] || [];
        if (arr.length === 0) return { avg: 0, attempts: 0 };
        const total = arr.reduce((sum, s) => sum + s.percentage, 0);
        return { avg: Math.round(total / arr.length), attempts: arr.length };
    }

    // Compute per-user subject breakdown (when no subject filter)
    function getUserSubjectBreakdown(uid) {
        const arr = userScores[uid] || [];
        const bySubj = {};
        arr.forEach(s => {
            if (!bySubj[s.subject]) bySubj[s.subject] = { total: 0, count: 0 };
            bySubj[s.subject].total += s.percentage;
            bySubj[s.subject].count++;
        });
        const result = {};
        for (const [subj, v] of Object.entries(bySubj)) {
            result[subj] = Math.round(v.total / v.count);
        }
        return result;
    }

    // Section-wise summary cards
    const sectionKeys = Object.keys(sectionMap).sort();
    if (sectionKeys.length === 0) {
        sectionsEl.innerHTML = '<div class="col-span-full text-center text-slate-400 text-sm p-4">No students found in this grade.</div>';
    } else {
        sectionsEl.innerHTML = sectionKeys.map(sec => {
            const sectionStudents = sectionMap[sec];
            const sectionAvgs = sectionStudents.map(s => getUserAvg(s.uid));
            const activeCount = sectionAvgs.filter(a => a.attempts > 0).length;
            const overallAvg = activeCount > 0
                ? Math.round(sectionAvgs.filter(a => a.attempts > 0).reduce((sum, a) => sum + a.avg, 0) / activeCount)
                : 0;
            const riskLabel = overallAvg >= 75 ? "Strong" : overallAvg >= 50 ? "Average" : activeCount === 0 ? "No Data" : "Weak";
            const riskColor = overallAvg >= 75 ? "border-green-300 bg-green-50" : overallAvg >= 50 ? "border-amber-300 bg-amber-50" : activeCount === 0 ? "border-slate-200 bg-slate-50" : "border-red-300 bg-red-50";
            const riskText = overallAvg >= 75 ? "text-green-700" : overallAvg >= 50 ? "text-amber-700" : activeCount === 0 ? "text-slate-400" : "text-red-700";

            return `
                <div class="p-4 rounded-xl border ${riskColor} transition hover:shadow-md">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="font-black text-slate-900">Section ${esc(sec)}</h4>
                        <span class="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide ${riskText}">${esc(riskLabel)}</span>
                    </div>
                    <div class="text-sm space-y-1">
                        <div class="flex justify-between"><span class="text-slate-500">Students</span><span class="font-bold">${sectionStudents.length}</span></div>
                        <div class="flex justify-between"><span class="text-slate-500">Active</span><span class="font-bold">${activeCount}</span></div>
                        <div class="flex justify-between"><span class="text-slate-500">Avg Score</span><span class="font-bold">${activeCount > 0 ? overallAvg + '%' : '\u2014'}</span></div>
                    </div>
                </div>`;
        }).join("");
    }

    // Student-level table
    // Gather all subjects present in filtered scores for table headers
    const subjectSet = new Set();
    filteredScores.forEach(s => subjectSet.add(s.subject));
    const allSubjects = Array.from(subjectSet).sort();

    // Flatten students by section
    const flatStudents = [];
    sectionKeys.forEach(sec => {
        sectionMap[sec].forEach(s => {
            flatStudents.push({ ...s, sectionLabel: sec });
        });
    });

    if (flatStudents.length === 0) {
        studentsEl.innerHTML = '<div class="p-6 text-center text-slate-400 text-sm">No students to display.</div>';
        return;
    }

    // Sort: students with attempts first (by avg desc), then zero-attempt
    flatStudents.sort((a, b) => {
        const aAvg = getUserAvg(a.uid);
        const bAvg = getUserAvg(b.uid);
        if (aAvg.attempts > 0 && bAvg.attempts === 0) return -1;
        if (aAvg.attempts === 0 && bAvg.attempts > 0) return 1;
        return bAvg.avg - aAvg.avg;
    });

    let tableHtml = `<table class="w-full text-sm">
        <thead class="bg-slate-50 text-left">
            <tr>
                <th class="px-4 py-3 font-bold text-slate-500 text-[10px] uppercase tracking-widest">#</th>
                <th class="px-4 py-3 font-bold text-slate-500 text-[10px] uppercase tracking-widest">Student</th>
                <th class="px-4 py-3 font-bold text-slate-500 text-[10px] uppercase tracking-widest">Section</th>`;

    if (subject) {
        // Single subject mode: show avg + attempts
        tableHtml += `<th class="px-4 py-3 font-bold text-slate-500 text-[10px] uppercase tracking-widest text-center">Avg Score</th>
                      <th class="px-4 py-3 font-bold text-slate-500 text-[10px] uppercase tracking-widest text-center">Attempts</th>`;
    } else {
        // All-subjects mode: one column per subject
        allSubjects.forEach(s => {
            tableHtml += `<th class="px-4 py-3 font-bold text-slate-500 text-[10px] uppercase tracking-widest text-center">${esc(s)}</th>`;
        });
        tableHtml += `<th class="px-4 py-3 font-bold text-slate-500 text-[10px] uppercase tracking-widest text-center">Overall</th>`;
    }

    tableHtml += `</tr></thead><tbody>`;

    flatStudents.forEach((st, i) => {
        const stats = getUserAvg(st.uid);
        tableHtml += `<tr class="border-t border-slate-100 hover:bg-slate-50 transition">
            <td class="px-4 py-3 text-slate-400 font-bold">${i + 1}</td>
            <td class="px-4 py-3 font-bold text-slate-800">${esc(st.displayName)}</td>
            <td class="px-4 py-3 text-slate-600">${esc(st.sectionLabel)}</td>`;

        if (subject) {
            const scoreColor = stats.attempts === 0 ? "text-slate-400" : stats.avg >= 75 ? "text-green-700" : stats.avg >= 50 ? "text-amber-700" : "text-red-700";
            tableHtml += `<td class="px-4 py-3 text-center font-black ${scoreColor}">${stats.attempts > 0 ? stats.avg + '%' : '\u2014'}</td>
                          <td class="px-4 py-3 text-center text-slate-600">${stats.attempts}</td>`;
        } else {
            const breakdown = getUserSubjectBreakdown(st.uid);
            allSubjects.forEach(s => {
                const val = breakdown[s];
                if (val === undefined) {
                    tableHtml += `<td class="px-4 py-3 text-center text-slate-300">\u2014</td>`;
                } else {
                    const color = val >= 75 ? "text-green-700" : val >= 50 ? "text-amber-700" : "text-red-700";
                    tableHtml += `<td class="px-4 py-3 text-center font-bold ${color}">${val}%</td>`;
                }
            });
            const ovColor = stats.attempts === 0 ? "text-slate-400" : stats.avg >= 75 ? "text-green-700" : stats.avg >= 50 ? "text-amber-700" : "text-red-700";
            tableHtml += `<td class="px-4 py-3 text-center font-black ${ovColor}">${stats.attempts > 0 ? stats.avg + '%' : '\u2014'}</td>`;
        }

        tableHtml += `</tr>`;
    });

    tableHtml += `</tbody></table>`;
    studentsEl.innerHTML = tableHtml;
}

function closeDrillDown() {
    const panel = document.getElementById("drilldown-panel");
    panel.classList.add("hidden");
}

// ─── Teacher Inventory Table ────────────────────────────────
function renderTeacherInventory(teacherInv) {
    const container = document.getElementById("teacher-inventory");
    if (!teacherInv || teacherInv.total === 0) {
        container.innerHTML = '<div class="p-6 text-center text-slate-400 text-sm">No teachers found for this school.</div>';
        return;
    }
    container.innerHTML = `
        <table class="w-full text-sm">
            <thead class="bg-slate-50 text-left">
                <tr>
                    <th class="px-6 py-3 font-bold text-slate-500 text-[10px] uppercase tracking-widest">#</th>
                    <th class="px-6 py-3 font-bold text-slate-500 text-[10px] uppercase tracking-widest">Name</th>
                    <th class="px-6 py-3 font-bold text-slate-500 text-[10px] uppercase tracking-widest">Subjects</th>
                    <th class="px-6 py-3 font-bold text-slate-500 text-[10px] uppercase tracking-widest">Sections</th>
                </tr>
            </thead>
            <tbody>
                ${teacherInv.list.map((t, i) => `
                    <tr class="border-t border-slate-100 hover:bg-slate-50 transition">
                        <td class="px-6 py-3 text-slate-400 font-bold">${i + 1}</td>
                        <td class="px-6 py-3 font-bold text-slate-800">${esc(t.displayName)}</td>
                        <td class="px-6 py-3 ${t.subjects.length > 0 ? 'text-slate-600' : 'text-slate-400'}">${t.subjects.length > 0 ? t.subjects.map(s => esc(s)).join(', ') : '\u2014'}</td>
                        <td class="px-6 py-3 ${t.sections.length > 0 ? 'text-slate-600' : 'text-slate-400'}">${t.sections.length > 0 ? t.sections.map(s => esc(s)).join(', ') : '\u2014'}</td>
                    </tr>
                `).join("")}
            </tbody>
        </table>`;
}

// ─── Charts ─────────────────────────────────────────────────
function renderCharts(gradePerf, studentInv) {
    renderGradeBarChart(gradePerf);
    renderStudentDistChart(studentInv);
}

function renderGradeBarChart(gradePerf) {
    const ctx = document.getElementById("gradeBarChart");
    if (!ctx) return;
    const grades = ["6","7","8","9","10","11","12"];
    const scores = grades.map(g => gradePerf?.byGrade[g]?.avgScore || 0);

    new Chart(ctx.getContext("2d"), {
        type: "bar",
        data: {
            labels: grades.map(g => `Grade ${g}`),
            datasets: [{
                label: "Avg Score %",
                data: scores,
                backgroundColor: scores.map(s => s >= 75 ? "#16a34a" : s >= 50 ? "#f59e0b" : "#dc2626"),
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, max: 100 } }
        }
    });
}

function renderStudentDistChart(studentInv) {
    const ctx = document.getElementById("studentDistChart");
    if (!ctx) return;
    const grades = ["6","7","8","9","10","11","12"];
    const counts = grades.map(g => studentInv?.byGrade[g] || 0);
    const colors = ["#3b82f6","#6366f1","#8b5cf6","#a855f7","#d946ef","#ec4899","#f43f5e"];

    new Chart(ctx.getContext("2d"), {
        type: "doughnut",
        data: {
            labels: grades.map(g => `Grade ${g}`),
            datasets: [{
                data: counts,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: "#fff"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "right", labels: { font: { size: 11, weight: "bold" } } } }
        }
    });
}
