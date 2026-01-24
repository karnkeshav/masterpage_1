// cbse/class-9/js/persona-lens.js

export function initPersonaLens() {
    if (document.getElementById("persona-lens")) return;

    const lens = document.createElement("div");
    lens.id = "persona-lens";
    lens.className = "fixed bottom-4 left-4 z-50 bg-slate-900 text-white p-2 rounded-xl shadow-2xl border border-slate-700 flex flex-col gap-2";
    lens.style.fontFamily = "Inter, sans-serif";

    // We use absolute paths to ensure it works from Root or Sub-directories
    const basePath = "/cbse/class-9";

    lens.innerHTML = `
        <div class="text-[10px] font-black uppercase text-center text-slate-400 tracking-widest mb-1 border-b border-slate-700 pb-1">
            Master Lens
        </div>
        <button onclick="window.location.href='${basePath}/index.html'" class="lens-btn bg-emerald-600 hover:bg-emerald-500">Student (9)</button>
        <button onclick="window.location.href='${basePath}/consoles/teacher.html'" class="lens-btn bg-blue-600 hover:bg-blue-500">Teacher</button>
        <button onclick="window.location.href='${basePath}/consoles/principal.html'" class="lens-btn bg-purple-600 hover:bg-purple-500">Principal</button>
        <button onclick="window.location.href='${basePath}/consoles/admin.html'" class="lens-btn bg-slate-600 hover:bg-slate-500">Admin</button>
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
        }
    `;

    document.head.appendChild(style);
    document.body.appendChild(lens);
    console.log("Persona Lens Active");
}
