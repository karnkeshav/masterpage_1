// app/consoles/principal.js
import { guardConsole, bindConsoleLogout } from "../../js/guard.js";
import { fetchSchoolAnalytics } from "../../js/api.js";

// LOGOUT LOGIC — use standard bindConsoleLogout for uniformity
bindConsoleLogout("logout-nav-btn", "../../index.html");

// GLOBAL GUARD
guardConsole("principal");

// Data Loader
window.loadConsoleData = async (profile) => {
    console.log("Loading Principal Dashboard for:", profile.school_id);
    document.getElementById("user-welcome").textContent = profile.displayName || "Principal";
    const schoolId = profile.school_id;

    // Strict Isolation: Fetch stats only for this schoolId
    const stats = await fetchSchoolAnalytics(schoolId);

    if (stats) {
        document.getElementById("total-active").textContent = stats.activeStudents;
        document.getElementById("total-active-trend").textContent = `Based on ${stats.totalAttempts} quizzes`;
    } else {
         document.getElementById("total-active").textContent = "0";
         document.getElementById("total-active-trend").textContent = "No data available";
    }

    // Mock Data for Heatmap (In production, fetch aggregated class stats from 'classes' collection or aggregation query)
    // ensuring we only fetch classes where school_id == profile.school_id

    // Simulating Strict Aggregation (No Student Names)
    const classes = [
        { name: "9-A", risk: "High", avg: 65, active: 28, total: 32 },
        { name: "9-B", risk: "Low", avg: 82, active: 30, total: 30 },
        { name: "9-C", risk: "Medium", avg: 71, active: 25, total: 31 },
        { name: "9-D", risk: "Low", avg: 79, active: 29, total: 33 },
        { name: "10-A", risk: "Medium", avg: 74, active: 35, total: 40 },
        { name: "10-B", risk: "High", avg: 62, active: 38, total: 42 },
    ];

    const container = document.getElementById("class-grid");
    container.innerHTML = classes.map(c => `
        <div class="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition cursor-pointer group relative overflow-hidden">
            <div class="absolute top-0 left-0 w-1 h-full ${getRiskColor(c.risk, true)}"></div>
            <div class="flex justify-between items-start mb-4">
                <h3 class="text-xl font-black text-slate-900">Class ${c.name}</h3>
                <span class="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide ${getRiskColor(c.risk)}">
                    ${c.risk} Risk
                </span>
            </div>
            <div class="space-y-3">
                <div class="flex justify-between text-sm">
                    <span class="text-slate-500 font-bold">Avg Mastery</span>
                    <span class="font-bold text-slate-900">${c.avg}%</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span class="text-slate-500 font-bold">Active Today</span>
                    <span class="font-bold text-slate-900">${c.active}/${c.total}</span>
                </div>
            </div>
            <div class="mt-6 pt-4 border-t border-slate-50 text-center">
                <span class="text-xs font-bold text-blue-600 group-hover:underline">View Detailed Report &rarr;</span>
            </div>
        </div>
    `).join("");

    renderChart();
};

function getRiskColor(risk, isBorder = false) {
    if (isBorder) {
        if (risk === "High") return "bg-red-500";
        if (risk === "Medium") return "bg-amber-400";
        return "bg-green-500";
    }
    if (risk === "High") return "bg-red-50 text-red-700";
    if (risk === "Medium") return "bg-amber-50 text-amber-700";
    return "bg-green-50 text-green-700";
}

function renderChart() {
     const ctx = document.getElementById('perfChart').getContext('2d');
     new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
            datasets: [{
                label: 'School Average',
                data: [65, 68, 72, 75],
                borderColor: '#2563eb',
                tension: 0.4,
                fill: true,
                backgroundColor: 'rgba(37, 99, 235, 0.05)'
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, max: 100 } }
        }
     });
}
