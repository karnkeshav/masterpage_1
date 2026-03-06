import { getInitializedClients } from "./config.js";
import { guardConsole, bindConsoleLogout } from "./guard.js";
import { loadCurriculum } from "./curriculum/loader.js";
import { collection, query, where, getDocs, doc, updateDoc, addDoc, serverTimestamp, onSnapshot, orderBy, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Global state
let currentSchoolId = null;
let unsubMessages = null;
let unsubRegistry = null;

// The Loading Lock: Defined before guardConsole
window.loadConsoleData = async (profile) => {
    currentSchoolId = profile.school_id;
    if (!currentSchoolId) {
        alert("Critical Error: No School ID found for Admin.");
        return;
    }
    console.log(`Loading Admin Console for School: ${currentSchoolId}`);

    const welcomeEl = document.getElementById('user-welcome');
    if (welcomeEl) welcomeEl.innerText = profile.email || "Admin User";

    // Hide loading, show app
    const loadingEl = document.getElementById('loading');
    const appEl = document.getElementById('app');
    if(loadingEl) loadingEl.classList.add('hidden');
    if(appEl) appEl.classList.remove('hidden');

    // Initial render
    window.switchTab('identity');
};

document.addEventListener('DOMContentLoaded', () => {
    guardConsole("admin");
    bindConsoleLogout("logout-nav-btn", "../../index.html");
});

window.switchTab = (tabId) => {
    ['identity', 'registry', 'observability', 'messaging'].forEach(t => {
        const btn = document.getElementById(`tab-btn-${t}`);
        if (!btn) return;

        if (t === tabId) {
            btn.className = "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all text-sm shadow-sm bg-cbse-blue text-white shadow-blue-900/20";
            const i = btn.querySelector('i');
            if(i) i.classList.add('text-accent-gold');
        } else {
            btn.className = "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all text-sm shadow-sm text-slate-500 hover:bg-slate-50 border border-transparent hover:border-slate-200";
            const i = btn.querySelector('i');
            if(i) i.classList.remove('text-accent-gold');
        }
    });

    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));

    // Show selected tab content
    const activeContent = document.getElementById(`tab-${tabId}`);
    if (activeContent) {
        activeContent.classList.remove('hidden');

        if (tabId === 'identity') renderIdentityVault();
        if (tabId === 'registry') renderRegistryEngine();
        if (tabId === 'observability') renderObservability();
        if (tabId === 'messaging') renderMessaging();
    }
};

// --- TASK 1: IDENTITY MAPPING VAULT (Relational Onboarding) ---
function renderIdentityVault() {
    const container = document.getElementById('tab-identity');
    container.innerHTML = `
        <div class="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
            <div class="flex items-center gap-4 mb-6">
                <div class="w-12 h-12 bg-blue-50 text-cbse-blue flex items-center justify-center rounded-2xl text-xl">
                    <i class="fas fa-network-wired"></i>
                </div>
                <div>
                    <h2 class="text-2xl font-black text-slate-800 tracking-tight">Relational Onboarding</h2>
                    <p class="text-sm text-slate-500 font-medium mt-1">Upload CSV to map teachers and build Parent-Student bridges.</p>
                </div>
            </div>

            <div class="grid md:grid-cols-2 gap-8">
                <div class="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center hover:border-cbse-blue transition bg-slate-50/50">
                    <i class="fas fa-file-csv text-4xl text-slate-300 mb-4"></i>
                    <h3 class="text-lg font-bold text-slate-800 mb-2">Upload Mapping CSV</h3>
                    <p class="text-xs text-slate-500 mb-4 px-4">Expected format: email, role, target_id, grade, section, discipline<br><i>target_id is student UID for parents.</i></p>

                    <label class="bg-cbse-blue text-white px-6 py-2 rounded-xl text-sm font-bold shadow-md hover:bg-blue-800 transition cursor-pointer inline-block">
                        Select File
                        <input type="file" id="csv-upload" accept=".csv" class="hidden" onchange="window.handleCSVUpload(event)">
                    </label>
                    <div id="upload-status" class="mt-4 text-sm font-bold text-slate-600 hidden"></div>
                </div>

                <div class="bg-blue-50/50 p-6 rounded-2xl border border-blue-100">
                    <h3 class="text-lg font-bold text-slate-800 mb-4"><i class="fas fa-info-circle text-cbse-blue"></i> Execution Log</h3>
                    <div id="mapping-log" class="text-xs font-mono text-slate-600 h-40 overflow-y-auto space-y-2 bg-white p-3 rounded-xl border border-slate-200">
                        <div class="text-slate-400 italic">Waiting for CSV upload...</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

window.logMessage = (msg, isError = false) => {
    const logBox = document.getElementById('mapping-log');
    if(!logBox) return;
    if(logBox.innerHTML.includes("Waiting")) logBox.innerHTML = "";
    const div = document.createElement('div');
    div.className = isError ? 'text-danger-red' : 'text-slate-700';
    div.innerText = `> ${msg}`;
    logBox.appendChild(div);
    logBox.scrollTop = logBox.scrollHeight;
};

window.handleCSVUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    document.getElementById('upload-status').innerText = `Processing ${file.name}...`;
    document.getElementById('upload-status').classList.remove('hidden');
    window.logMessage(`Starting processing of ${file.name}`);

    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target.result;
        const rows = text.split(/\r?\n/).map(row => row.split(',').map(c => c.trim()));
        const dataRows = rows.slice(1).filter(r => r.length > 1);

        let successCount = 0;
        let errorCount = 0;

        const { db } = await getInitializedClients();

        for (let i = 0; i < dataRows.length; i++) {
            const row = dataRows[i];
            try {
                const email = row[0];
                const role = row[1];

                const q = query(collection(db, "users"), where("email", "==", email), where("school_id", "==", currentSchoolId));
                const snap = await getDocs(q);

                if (snap.empty) {
                    window.logMessage(`Skipped ${email}: User not found in school.`, true);
                    errorCount++;
                    continue;
                }

                const userDoc = snap.docs[0];
                const userId = userDoc.id;

                if (role === 'teacher') {
                    const targetGrade = row[3] || '9';
                    const targetSection = row[4];
                    const targetDiscipline = row[5];

                    // Verify teacher discipline against curriculum
                    const curriculumData = await loadCurriculum(targetGrade);
                    let hasMapping = false;
                    if (curriculumData["Science"] && curriculumData["Science"][targetDiscipline]) hasMapping = true;
                    if (curriculumData["Social Science"] && curriculumData["Social Science"][targetDiscipline]) hasMapping = true;
                    if (curriculumData["Mathematics"] && curriculumData["Mathematics"][targetDiscipline]) hasMapping = true;
                    if (curriculumData["English"] && curriculumData["English"][targetDiscipline]) hasMapping = true;
                    if (curriculumData["Hindi"] && curriculumData["Hindi"][targetDiscipline]) hasMapping = true;
                    if (curriculumData["Sanskrit"] && curriculumData["Sanskrit"][targetDiscipline]) hasMapping = true;

                    if(hasMapping) {
                        await updateDoc(doc(db, "users", userId), {
                            mapped_grade: targetGrade,
                            mapped_section: targetSection,
                            mapped_discipline: targetDiscipline,
                            updated_at: serverTimestamp()
                        });
                        window.logMessage(`Mapped Teacher ${email} to ${targetGrade}-${targetSection} ${targetDiscipline}`);
                        successCount++;
                    } else {
                        window.logMessage(`Invalid discipline '${targetDiscipline}' for Grade ${targetGrade}`, true);
                        errorCount++;
                    }

                } else if (role === 'parent') {
                    const studentId = row[2];
                    if(!studentId) {
                        window.logMessage(`Skipped ${email}: No student ID provided.`, true);
                        errorCount++;
                        continue;
                    }

                    // Double-Link: Map parent -> student AND student -> parent
                    await updateDoc(doc(db, "users", studentId), {
                        parent_id: userId,
                        updated_at: serverTimestamp()
                    });
                    await updateDoc(doc(db, "users", userId), {
                        linked_children: arrayUnion(studentId),
                        updated_at: serverTimestamp()
                    });

                    window.logMessage(`Double-Bridged Parent ${email} and Student ${studentId}`);
                    successCount++;
                }
            } catch (err) {
                window.logMessage(`Error processing row ${i+1}: ${err.message}`, true);
                errorCount++;
            }
        }

        document.getElementById('upload-status').innerHTML = `<span class="text-success-green">Complete: ${successCount} success, ${errorCount} failed.</span>`;
        window.logMessage("CSV Processing Finished.", false);
    };
    reader.readAsText(file);
};

// --- NEW TASK 2: REGISTRY ENGINE (Grade Grouping & Mapping) ---
window.renderRegistryEngine = () => {
    if(unsubRegistry) { unsubRegistry(); unsubRegistry = null; }

    const container = document.getElementById('tab-registry');

    // Class View: Grade grid
    let gridHtml = '';
    for(let g = 6; g <= 12; g++) {
        gridHtml += `
            <button onclick="window.loadGradeRegistry('${g}')" class="bg-white p-6 rounded-2xl border-2 border-slate-100 shadow-sm hover:border-cbse-blue hover:shadow-md transition-all text-left group">
                <div class="w-12 h-12 bg-blue-50 text-cbse-blue rounded-xl flex items-center justify-center text-xl mb-4 group-hover:scale-110 transition-transform">
                    <i class="fas fa-folder"></i>
                </div>
                <h3 class="text-lg font-black text-slate-800">Grade ${g}</h3>
                <p class="text-xs text-slate-400 font-bold mt-1 uppercase tracking-widest">Class Roster</p>
            </button>
        `;
    }

    container.innerHTML = `
        <div class="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 h-full flex flex-col" id="registry-main">
            <div class="flex justify-between items-center mb-8">
                <div>
                    <h2 class="text-2xl font-black text-slate-800">Registry Engine</h2>
                    <p class="text-sm text-slate-500 mt-1">Select a Grade folder to manage user mappings for ${currentSchoolId}.</p>
                </div>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                ${gridHtml}
            </div>
        </div>
    `;
};

window.loadGradeRegistry = async (grade) => {
    const container = document.getElementById('registry-main');
    container.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <div>
                <button onclick="window.renderRegistryEngine()" class="text-xs font-bold text-slate-400 hover:text-cbse-blue mb-2 flex items-center gap-1 uppercase tracking-widest"><i class="fas fa-arrow-left"></i> Back to Folders</button>
                <h2 class="text-xl font-black text-slate-800">Grade ${grade} Roster</h2>
                <p class="text-sm text-slate-500">Live view of students and linked personnel.</p>
            </div>
            <input type="text" id="registry-search" placeholder="Search by name/email..." onkeyup="window.filterRegistry()" class="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-cbse-blue w-64">
        </div>

        <div class="flex-1 overflow-y-auto border border-slate-100 rounded-xl">
            <table class="w-full text-left text-sm">
                <thead class="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400 font-bold sticky top-0 z-10">
                    <tr>
                        <th class="p-4">Student Name / Email</th>
                        <th class="p-4">Linked Parent</th>
                        <th class="p-4">Assigned Section</th>
                        <th class="p-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody id="registry-list" class="divide-y divide-slate-50">
                    <tr><td colspan="4" class="p-8 text-center text-slate-400 italic">Loading Registry...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    if(unsubRegistry) unsubRegistry();

    const { db } = await getInitializedClients();

    // Unique Filtering: Filter by school_id AND grade
    const q = query(
        collection(db, "users"),
        where("school_id", "==", currentSchoolId),
        where("grade", "==", grade.toString()) // Assuming grade is stored as a string
    );

    unsubRegistry = onSnapshot(q, (snapshot) => {
        const list = document.getElementById('registry-list');
        if(!list) return;

        if(snapshot.empty) {
            list.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-slate-400 italic font-medium">No students found in Grade ${grade}.</td></tr>`;
            return;
        }

        // Use a Map to ensure unique UID entries
        const uniqueUsers = new Map();
        snapshot.forEach(doc => {
            const data = doc.data();
            // In a school registry, we mostly want to show students to map their parents/sections
            if (data.role === 'student') {
                uniqueUsers.set(doc.id, { id: doc.id, ...data });
            }
        });

        window.renderRegistryList(Array.from(uniqueUsers.values()));
    });
};

window.renderRegistryList = (users) => {
    const list = document.getElementById('registry-list');
    if(!list) return;

    if(users.length === 0) {
        list.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-slate-400 italic font-medium">No students found for this grade filter.</td></tr>`;
        return;
    }

    list.innerHTML = users.map(u => {
        const nameOrEmail = u.displayName || u.email || u.id;
        const parentText = u.parent_id ? `<span class="text-slate-700 font-mono text-[10px] bg-slate-100 px-2 py-1 rounded border border-slate-200">${u.parent_id}</span>` : `<span class="text-danger-red text-xs font-bold">Unlinked</span>`;
        const sectionText = u.section || '<span class="text-slate-300 italic">Unassigned</span>';

        return `
            <tr class="hover:bg-slate-50 transition registry-row" data-search="${nameOrEmail.toLowerCase()}">
                <td class="p-4 font-bold text-slate-700">
                    ${nameOrEmail}
                    ${!u.displayName && !u.email ? `<br><span class="text-[9px] text-slate-400 font-normal">UID: ${u.id}</span>` : ''}
                </td>
                <td class="p-4">${parentText}</td>
                <td class="p-4 text-xs font-bold text-slate-500">${sectionText}</td>
                <td class="p-4 text-right">
                    <button onclick="window.promptLinkParent('${u.id}')" class="text-cbse-blue hover:text-blue-800 font-bold text-xs bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 shadow-sm transition active:scale-95">Edit Mapping</button>
                </td>
            </tr>
        `;
    }).join("");
};

window.filterRegistry = () => {
    const query = document.getElementById('registry-search').value.toLowerCase();
    document.querySelectorAll('.registry-row').forEach(row => {
        if(row.getAttribute('data-search').includes(query)) row.style.display = '';
        else row.style.display = 'none';
    });
};

window.promptLinkParent = async (studentId) => {
    const parentId = prompt("Enter the Parent UID to link to this student:");
    if(!parentId) return;

    try {
        const { db } = await getInitializedClients();

        // Double-Link
        await updateDoc(doc(db, "users", studentId), {
            parent_id: parentId,
            updated_at: serverTimestamp()
        });
        await updateDoc(doc(db, "users", parentId), {
            linked_children: arrayUnion(studentId),
            updated_at: serverTimestamp()
        });

        alert("Double-Link established successfully.");
    } catch(e) {
        const errorMsg = e.message.toLowerCase();
        if (errorMsg.includes("insufficient permissions") || errorMsg.includes("missing or insufficient permissions")) {
            alert("Admin Role detected but Firestore Rules are blocking the write. Please authorize the Admin bypass in the Firebase Console.");
        } else {
            alert("Failed to link parent: " + e.message);
        }
    }
};

// --- TASK 3: VIP OBSERVABILITY DASHBOARD ---
window.renderObservability = async () => {
    const container = document.getElementById('tab-observability');
    container.innerHTML = `
        <div class="flex items-center justify-center h-64 text-slate-400">
            <i class="fas fa-circle-notch fa-spin text-4xl mb-4"></i>
            <div class="animate-pulse font-bold ml-3">Loading God View...</div>
        </div>
    `;

    try {
        const { db } = await getInitializedClients();

        // Calculate Remedial Red-Zone
        const benchmarkQuery = query(collection(db, "chapter_benchmarks"), where("school_id", "==", currentSchoolId));
        const benchmarkSnap = await getDocs(benchmarkQuery);
        const benchmarks = {};
        let averageB = 3;
        let totalB = 0;

        if (!benchmarkSnap.empty) {
            benchmarkSnap.forEach(doc => {
                const data = doc.data();
                benchmarks[data.chapter_slug] = data.benchmark_B || 3;
                totalB += (data.benchmark_B || 3);
            });
            averageB = Math.round(totalB / benchmarkSnap.size);
        }

        const scoresQuery = query(collection(db, "quiz_scores"), where("school_id", "==", currentSchoolId));
        const scoresSnap = await getDocs(scoresQuery);

        const studentChapterAttempts = {};
        scoresSnap.forEach(doc => {
            const data = doc.data();
            const uid = data.user_id;
            const chapter = data.topicSlug || data.topic || data.chapter;

            if(!chapter) return;

            const key = `${uid}_${chapter}`;
            if(!studentChapterAttempts[key]) {
                 studentChapterAttempts[key] = { uid, chapter, attempts: 0 };
            }
            studentChapterAttempts[key].attempts++;
        });

        let breachedCount = 0;
        const breachedStudents = new Set();

        Object.values(studentChapterAttempts).forEach(entry => {
            const B = benchmarks[entry.chapter] || averageB;
            if (entry.attempts > B) {
                breachedStudents.add(entry.uid);
            }
        });
        breachedCount = breachedStudents.size;

        // Syllabus Heatmap
        const controlQuery = query(collection(db, "chapter_control"), where("status", "==", "finished"), where("school_id", "==", currentSchoolId));
        const controlSnap = await getDocs(controlQuery);

        let finishedHtml = '';
        if(controlSnap.empty) {
             finishedHtml = `<div class="col-span-full py-8 text-center text-slate-400 italic font-bold">No chapters marked finished yet.</div>`;
        } else {
             controlSnap.forEach(doc => {
                 const d = doc.data();
                 finishedHtml += `
                    <div class="bg-success-green text-white p-4 rounded-xl shadow-sm border border-green-600 flex justify-between items-center transition hover:scale-105">
                        <div>
                            <div class="text-[10px] font-black uppercase tracking-widest opacity-80">${d.grade}-${d.section} • ${d.discipline}</div>
                            <div class="font-bold mt-1 text-sm truncate">${d.chapter_slug || 'Chapter'}</div>
                        </div>
                        <i class="fas fa-check-circle text-2xl opacity-50"></i>
                    </div>
                 `;
             });
        }

        container.innerHTML = `
            <div class="space-y-6">
                <div class="flex items-center gap-4 mb-2">
                    <div class="w-12 h-12 bg-amber-50 text-amber-600 flex items-center justify-center rounded-2xl text-xl">
                        <i class="fas fa-eye"></i>
                    </div>
                    <div>
                        <h2 class="text-2xl font-black text-slate-800 tracking-tight">The "God View"</h2>
                        <p class="text-sm text-slate-500 font-medium mt-1">High-density observability for Principals/Directors.</p>
                    </div>
                </div>

                <div class="grid md:grid-cols-3 gap-6">
                    <div class="md:col-span-1 bg-danger-red p-6 rounded-3xl shadow-lg border border-red-800 text-white flex flex-col justify-between relative overflow-hidden">
                        <i class="fas fa-exclamation-triangle absolute -right-4 -bottom-4 text-8xl text-black/10"></i>
                        <div>
                            <h3 class="text-lg font-black flex items-center gap-2 relative z-10"><i class="fas fa-ambulance"></i> Remedial Red-Zone</h3>
                            <p class="text-xs font-medium text-red-100 mt-1 opacity-90 relative z-10">Students breaching the B+1 threshold</p>
                        </div>
                        <div class="mt-8 relative z-10">
                            <div class="text-6xl font-black">${breachedCount}</div>
                            <div class="text-xs uppercase tracking-widest font-bold opacity-80 mt-1">School-Wide Alerts</div>
                            <div class="text-[10px] bg-black/20 px-2 py-1 rounded inline-block mt-4">Avg Benchmark (B) = ${averageB}</div>
                        </div>
                    </div>

                    <div class="md:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                        <h3 class="text-lg font-black text-slate-800 flex items-center gap-2 mb-1"><i class="fas fa-fire text-amber-500"></i> Syllabus Heatmap</h3>
                        <p class="text-xs font-medium text-slate-500 mb-6">Cross-grade finished status mapped from chapter_control.</p>
                        <div class="grid grid-cols-2 md:grid-cols-3 gap-3 h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                            ${finishedHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;

    } catch(e) {
        container.innerHTML = `<div class="text-danger-red font-bold p-8">Error loading dashboard: ${e.message}</div>`;
    }
};

// --- TASK 4: SOVEREIGN INTERCOM (MESSAGING HUB) ---
window.renderMessaging = () => {
    const container = document.getElementById('tab-messaging');
    container.innerHTML = `
        <div class="space-y-6 h-full flex flex-col">
            <div class="flex items-center gap-4 mb-2">
                <div class="w-12 h-12 bg-purple-50 text-purple-600 flex items-center justify-center rounded-2xl text-xl">
                    <i class="fas fa-satellite-dish"></i>
                </div>
                <div>
                    <h2 class="text-2xl font-black text-slate-800 tracking-tight">Sovereign Intercom</h2>
                    <p class="text-sm text-slate-500 font-medium mt-1">Persona-based messaging hub for School ID: ${currentSchoolId}</p>
                </div>
            </div>

            <div class="grid md:grid-cols-2 gap-6 flex-1 min-h-[400px]">
                <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col">
                    <h3 class="text-lg font-black text-slate-800 mb-6">Compose Message</h3>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Target Audience</label>
                            <select id="msg-target-type" onchange="window.toggleTargetInput()" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-cbse-blue">
                                <option value="broadcast">Broadcast to All Parents</option>
                                <option value="targeted">Targeted Nudge (Specific Teacher)</option>
                            </select>
                        </div>
                        <div id="msg-teacher-container" class="hidden">
                            <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Teacher Email</label>
                            <input type="email" id="msg-teacher-email" placeholder="teacher@school.com" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:border-cbse-blue">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Message Content</label>
                            <textarea id="msg-content" rows="4" placeholder="Type your official communication here..." class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:border-cbse-blue resize-none"></textarea>
                        </div>
                        <button onclick="window.sendMessage()" class="w-full bg-cbse-blue text-white font-bold py-3 rounded-xl shadow-md hover:bg-blue-800 transition flex items-center justify-center gap-2">
                            <i class="fas fa-paper-plane"></i> Dispatch Communication
                        </button>
                        <div id="msg-status" class="text-sm font-bold text-center hidden"></div>
                    </div>
                </div>

                <div class="bg-slate-50 p-6 rounded-3xl border border-slate-200 flex flex-col h-full">
                    <h3 class="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                        <i class="fas fa-stream text-cbse-blue"></i> Real-time Flow
                    </h3>
                    <div id="msg-feed" class="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
                        <div class="text-center text-slate-400 font-bold italic py-8">Loading communications...</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    window.listenToMessages();
};

window.toggleTargetInput = () => {
    const type = document.getElementById('msg-target-type').value;
    const container = document.getElementById('msg-teacher-container');
    if(type === 'targeted') container.classList.remove('hidden');
    else container.classList.add('hidden');
};

window.sendMessage = async () => {
    const type = document.getElementById('msg-target-type').value;
    const content = document.getElementById('msg-content').value.trim();
    const statusEl = document.getElementById('msg-status');

    if(!content) {
        statusEl.innerText = "Message content is required.";
        statusEl.className = "text-sm font-bold text-center text-danger-red block mt-4";
        return;
    }

    try {
        const { db } = await getInitializedClients();
        const payload = {
            school_id: currentSchoolId,
            content: content,
            timestamp: serverTimestamp(),
            sender_role: "admin",
            target_role: type === 'broadcast' ? "parent" : "teacher",
            status: "sent"
        };

        if(type === 'targeted') {
            const teacherEmail = document.getElementById('msg-teacher-email').value.trim();
            if(!teacherEmail) {
                statusEl.innerText = "Teacher email is required for targeted nudges.";
                statusEl.className = "text-sm font-bold text-center text-danger-red block mt-4";
                return;
            }
            payload.target_email = teacherEmail;
        }

        await addDoc(collection(db, "communications"), payload);

        document.getElementById('msg-content').value = "";
        if(type === 'targeted') document.getElementById('msg-teacher-email').value = "";

        statusEl.innerText = "Communication Dispatched Successfully.";
        statusEl.className = "text-sm font-bold text-center text-success-green block mt-4";
        setTimeout(() => { statusEl.classList.add('hidden'); }, 3000);

    } catch(e) {
        statusEl.innerText = "Failed to dispatch: " + e.message;
        statusEl.className = "text-sm font-bold text-center text-danger-red block mt-4";
    }
};

window.listenToMessages = async () => {
    if(unsubMessages) unsubMessages();

    const { db } = await getInitializedClients();
    const q = query(
        collection(db, "communications"),
        where("school_id", "==", currentSchoolId),
        orderBy("timestamp", "desc")
    );

    unsubMessages = onSnapshot(q, (snapshot) => {
        const feed = document.getElementById('msg-feed');
        if(!feed) return;

        if(snapshot.empty) {
            feed.innerHTML = `<div class="text-center text-slate-400 font-bold italic py-8">No communications found for this school.</div>`;
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const d = doc.data();
            const date = d.timestamp?.toDate ? d.timestamp.toDate().toLocaleString() : 'Just now';
            const isBroadcast = d.target_role === 'parent';

            html += `
                <div class="bg-white p-4 rounded-xl shadow-sm border ${isBroadcast ? 'border-blue-100' : 'border-purple-100'}">
                    <div class="flex justify-between items-start mb-2">
                        <span class="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${isBroadcast ? 'bg-blue-50 text-cbse-blue' : 'bg-purple-50 text-purple-600'}">
                            ${isBroadcast ? 'Broadcast to Parents' : 'Targeted: ' + (d.target_email || 'Teacher')}
                        </span>
                        <span class="text-[10px] text-slate-400 font-bold">${date}</span>
                    </div>
                    <p class="text-sm text-slate-700 font-medium">${d.content}</p>
                </div>
            `;
        });

        feed.innerHTML = html;
    }, (error) => {
        const feed = document.getElementById('msg-feed');
        let errHtml = `<div class="text-danger-red font-bold p-4">Error loading messages.</div>`;

        if (error.message.includes('Missing or insufficient permissions')) {
            errHtml += `<p class="text-xs text-slate-500 px-4">Permission denied.</p>`;
        } else if (error.message.includes('FAILED_PRECONDITION')) {
            const match = error.message.match(/(https:\/\/console\.firebase\.google\.com[^\s]+)/);
            if (match) {
                errHtml += `<p class="text-xs text-slate-500 px-4">Missing Index. <a href="${match[1]}" target="_blank" class="text-blue-600 underline">Click here to create it.</a></p>`;
                console.error("MISSING INDEX URL:", match[1]);
            }
        }

        if(feed) feed.innerHTML = errHtml;
        console.error("Messages listener error:", error);
    });
};
