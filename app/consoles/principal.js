// app/consoles/principal.js
import { guardConsole, bindConsoleLogout } from "../../js/guard.js";
import {
    fetchSchoolAnalytics,
    fetchStudentInventory,
    fetchTeacherInventory,
    fetchGradeWisePerformance
} from "../../js/api.js";

const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

// LOGOUT LOGIC — use standard bindConsoleLogout for uniformity
bindConsoleLogout("logout-nav-btn", "../../index.html");

// GLOBAL GUARD
guardConsole("principal");

// Data Loader — called by guard.js revealApp(profile)
window.loadConsoleData = async (profile) => {
    const displayName = (profile.displayName || "Principal").toUpperCase();
    document.getElementById("user-welcome").textContent = displayName;
    const schoolId = profile.school_id;

    if (!schoolId) {
        showError("No school linked to your profile.");
        return;
    }

    // Fetch all data in parallel from Firestore
    const [analytics, studentInv, teacherInv, gradePerf] = await Promise.all([
        fetchSchoolAnalytics(schoolId),
        fetchStudentInventory(schoolId),
        fetchTeacherInventory(schoolId),
        fetchGradeWisePerformance(schoolId)
    ]);

    renderKPIs(analytics, studentInv, teacherInv);
    renderGradeInventory(studentInv);
    renderGradeHeatmap(gradePerf);
    renderTeacherInventory(teacherInv);
    renderCharts(gradePerf, studentInv);
};

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

// ─── Grade Performance Heatmap ──────────────────────────────
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
            <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition relative overflow-hidden">
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
            </div>`;
    }).join("");
}

function getRiskStyle(risk) {
    if (risk === "High") return { border: "bg-red-500", badge: "bg-red-50 text-red-700" };
    if (risk === "Medium") return { border: "bg-amber-400", badge: "bg-amber-50 text-amber-700" };
    if (risk === "No Data") return { border: "bg-slate-300", badge: "bg-slate-50 text-slate-500" };
    return { border: "bg-green-500", badge: "bg-green-50 text-green-700" };
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
