export function initPersonaLens() {
    if (document.getElementById("persona-lens")) return;
    const lens = document.createElement("div");
    lens.id = "persona-lens";
    lens.className = "fixed bottom-4 left-4 z-50 bg-slate-900 text-white p-2 rounded-xl shadow-2xl border border-slate-700 flex flex-col gap-2";

    lens.innerHTML = `
        <div class="text-[10px] font-black uppercase text-center text-slate-400 tracking-widest mb-1 border-b border-slate-700 pb-1">Master Lens</div>
        <button onclick="window.location.href='/app/consoles/student.html?grade=9'" class="lens-btn bg-emerald-600">Student (9)</button>
        <button onclick="window.location.href='/app/consoles/teacher.html'" class="lens-btn bg-blue-600">Teacher</button>
        <button onclick="window.location.href='/app/consoles/principal.html'" class="lens-btn bg-purple-600">Principal</button>
        <button onclick="window.location.href='/app/consoles/admin.html'" class="lens-btn bg-slate-600">Admin (IAM)</button>
        <button onclick="window.location.href='/owner-console.html'" class="lens-btn bg-red-600">Owner</button>
    `;

    const style = document.createElement("style");
    style.textContent = `
        .lens-btn {
            padding: 4px 12px;
            border-radius: 6px;
            font-size: 10px;
            font-weight: 700;
            transition: 0.2s;
            text-align: left;
            cursor: pointer;
            margin-bottom: 2px;
        }
        .lens-btn:hover { opacity: 0.9; }
    `;
    document.head.appendChild(style);
    document.body.appendChild(lens);
}
