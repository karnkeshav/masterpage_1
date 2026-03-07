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
    window.switchTab('inventory');
};

document.addEventListener('DOMContentLoaded', () => {
    guardConsole("admin");
    bindConsoleLogout("logout-nav-btn", "../../index.html");
});

window.switchTab = (tabId) => {
    ['inventory', 'observability', 'messaging'].forEach(t => {
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

        if (tabId === 'inventory') window.renderInventoryEngine();
        if (tabId === 'observability') window.renderObservability();
        if (tabId === 'messaging') window.renderMessaging();
    }
};

// --- THE INVENTORY NAVIGATION ENGINE ---
window.renderInventoryEngine = async () => {
    const container = document.getElementById('tab-inventory');

    // Generate Accordion HTML structure
    let classesAccordionHtml = '';
    const grades = [6, 7, 8, 9, 10, 11, 12];
    const sections = ['A', 'B', 'C'];

    grades.forEach(g => {
        let sectionHtml = '';
        sections.forEach(s => {
            sectionHtml += `
                <div class="mb-2 border border-slate-200 rounded bg-white">
                    <button onclick="window.toggleAccordion('acc-sec-${g}-${s}')" class="w-full text-left p-2 font-bold flex justify-between items-center text-xs hover:bg-slate-50">
                        <span>Section ${s}</span>
                        <i class="fas fa-chevron-down text-slate-400 transition-transform duration-200" id="icon-acc-sec-${g}-${s}"></i>
                    </button>
                    <div id="acc-sec-${g}-${s}" class="hidden p-2 border-t border-slate-100">
                        <div class="flex justify-end mb-2">
                            <button onclick="window.showAddModal('student', '${g}', '${s}')" class="bg-cbse-blue hover:bg-blue-800 text-white px-3 py-1.5 text-xs rounded-lg font-bold shadow-sm transition"><i class="fas fa-plus mr-1"></i> Add Student</button>
                        </div>
                        <div class="overflow-x-auto rounded-lg border border-slate-100">
                            <table class="w-full text-left text-xs">
                                <thead class="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                                    <tr><th class="p-2">Name / Email</th><th class="p-2">Linked Parent</th><th class="p-2 text-right">Actions</th></tr>
                                </thead>
                                <tbody id="tbody-student-${g}-${s}" class="divide-y divide-slate-50"><tr><td colspan="3" class="p-2 text-center text-slate-400 italic">Loading...</td></tr></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        });

        classesAccordionHtml += `
            <div class="mb-2 border border-slate-200 rounded-lg bg-white overflow-hidden shadow-sm">
                <button onclick="window.toggleAccordion('acc-grade-${g}')" class="w-full text-left p-3 font-bold flex justify-between items-center text-sm hover:bg-slate-50">
                    <span class="text-slate-800"><i class="fas fa-graduation-cap text-cbse-blue mr-2"></i> Grade ${g}</span>
                    <i class="fas fa-chevron-down text-slate-400 transition-transform duration-200" id="icon-acc-grade-${g}"></i>
                </button>
                <div id="acc-grade-${g}" class="hidden p-3 border-t border-slate-100 bg-slate-50/50">
                    ${sectionHtml}
                </div>
            </div>
        `;
    });

    container.innerHTML = `
        <div class="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 h-full flex flex-col" id="inventory-main">
            <div class="flex justify-between items-center mb-6">
                <div>
                    <h2 class="text-2xl font-black text-slate-800">Inventory Registry</h2>
                    <p class="text-sm text-slate-500 mt-1">Manage ${currentSchoolId} registry via the Master Vaults.</p>
                </div>
            </div>

            <div class="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">

                <!-- Vault 1: Academic Classes -->
                <div class="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
                    <button onclick="window.toggleAccordion('acc-classes')" class="w-full text-left p-4 bg-slate-50 font-bold flex justify-between items-center hover:bg-slate-100 transition">
                        <span class="text-lg text-slate-800"><i class="fas fa-layer-group text-cbse-blue mr-2"></i> Vault 1: Academic Classes</span>
                        <i class="fas fa-chevron-down text-slate-400 transition-transform duration-200" id="icon-acc-classes"></i>
                    </button>
                    <div id="acc-classes" class="hidden p-4 border-t border-slate-200 bg-slate-50/30">
                        ${classesAccordionHtml}
                    </div>
                </div>

                <!-- Vault 2: Faculty Inventory -->
                <div class="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
                    <button onclick="window.toggleAccordion('acc-teachers')" class="w-full text-left p-4 bg-slate-50 font-bold flex justify-between items-center hover:bg-slate-100 transition">
                        <span class="text-lg text-slate-800"><i class="fas fa-chalkboard-teacher text-amber-500 mr-2"></i> Vault 2: Faculty Inventory</span>
                        <i class="fas fa-chevron-down text-slate-400 transition-transform duration-200" id="icon-acc-teachers"></i>
                    </button>
                    <div id="acc-teachers" class="hidden p-4 border-t border-slate-200">
                        <div class="flex justify-end mb-4">
                            <button onclick="window.showAddModal('teacher')" class="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 text-xs rounded-xl font-bold shadow-sm transition"><i class="fas fa-plus mr-1"></i> Add Teacher</button>
                        </div>
                        <div class="overflow-hidden border border-slate-100 rounded-xl bg-white shadow-sm">
                            <table class="w-full text-left text-sm">
                                <thead class="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                                    <tr><th class="p-4">Name / Email</th><th class="p-4">Discipline</th><th class="p-4">Assigned Section</th><th class="p-4 text-right">Actions</th></tr>
                                </thead>
                                <tbody id="tbody-teachers" class="divide-y divide-slate-50"><tr><td colspan="4" class="p-4 text-center text-slate-400 italic">Loading...</td></tr></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Vault 3: VIP Dignitaries -->
                <div class="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
                    <button onclick="window.toggleAccordion('acc-vips')" class="w-full text-left p-4 bg-slate-50 font-bold flex justify-between items-center hover:bg-slate-100 transition">
                        <span class="text-lg text-slate-800"><i class="fas fa-star text-purple-500 mr-2"></i> Vault 3: VIP Dignitaries</span>
                        <i class="fas fa-chevron-down text-slate-400 transition-transform duration-200" id="icon-acc-vips"></i>
                    </button>
                    <div id="acc-vips" class="hidden p-4 border-t border-slate-200">
                        <div class="flex justify-end mb-4">
                            <button onclick="window.showAddModal('vip')" class="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 text-xs rounded-xl font-bold shadow-sm transition"><i class="fas fa-plus mr-1"></i> Add VIP</button>
                        </div>
                        <div class="overflow-hidden border border-slate-100 rounded-xl bg-white shadow-sm">
                            <table class="w-full text-left text-sm">
                                <thead class="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                                    <tr><th class="p-4">Name / Email</th><th class="p-4">Role</th><th class="p-4">School ID</th><th class="p-4 text-right">Status</th></tr>
                                </thead>
                                <tbody id="tbody-vips" class="divide-y divide-slate-50"><tr><td colspan="4" class="p-4 text-center text-slate-400 italic">Loading...</td></tr></tbody>
                            </table>
                        </div>
                    </div>
                </div>

            </div>

            <!-- Relational Onboarding -->
            <div class="mt-6 border-t border-slate-100 pt-6">
                ${getRelationalOnboardingHTML()}
            </div>

            <!-- Manual Onboarding Modal Container -->
            <div id="modal-container"></div>
        </div>
    `;

    // Listen to real-time updates for all buckets
    if(unsubRegistry) { unsubRegistry(); }

    const { db } = await getInitializedClients();
    const q = query(
        collection(db, "users"),
        where("school_id", "==", currentSchoolId)
    );

    unsubRegistry = onSnapshot(q, (snapshot) => {
        const studentMap = {}; // grade-section -> [students]
        const teacherMap = [];
        const vipMap = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            const u = { id: doc.id, ...data };

            if (u.role === 'student') {
                const g = u.grade || 'Unknown';
                // Extract section correctly. e.g., '9-A' -> 'A', 'A' -> 'A'
                let s = u.section_id || u.section || 'Unknown';
                if(s.includes('-')) s = s.split('-')[1];

                const key = `${g}-${s}`;
                if(!studentMap[key]) studentMap[key] = [];
                studentMap[key].push(u);
            }
            else if (u.role === 'teacher') {
                teacherMap.push(u);
            }
            else if (u.role === 'principal' || u.role === 'admin') {
                vipMap.push(u);
            }
        });

        // Update VIPs
        renderBucket('tbody-vips', vipMap, 'vip');
        // Update Teachers
        renderBucket('tbody-teachers', teacherMap, 'teacher');
        // Update Students (iterate through all tables)
        grades.forEach(g => {
            sections.forEach(s => {
                const id = `tbody-student-${g}-${s}`;
                const users = studentMap[`${g}-${s}`] || [];
                renderBucket(id, users, 'student');
            });
        });
    });
};

window.toggleAccordion = (id) => {
    const el = document.getElementById(id);
    const icon = document.getElementById(`icon-${id}`);
    if(el) {
        if(el.classList.contains('hidden')) {
            el.classList.remove('hidden');
            if(icon) icon.classList.add('rotate-180');
        } else {
            el.classList.add('hidden');
            if(icon) icon.classList.remove('rotate-180');
        }
    }
};

window.showAddModal = async (role, grade = '', section = '') => {
    const modalContainer = document.getElementById('modal-container');

    let roleTitle = "Student";
    if(role === 'teacher') roleTitle = "Teacher";
    if(role === 'vip') roleTitle = "VIP Dignitary";

    let extraFields = '';

    if (role === 'student') {
        extraFields = `
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Grade</label>
                    <input type="text" id="modal-grade" value="${grade}" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-cbse-blue" ${grade ? 'readonly' : ''}>
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Section</label>
                    <input type="text" id="modal-section" value="${section}" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-cbse-blue" ${section ? 'readonly' : ''}>
                </div>
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Link Parent (Parent UID)</label>
                <input type="text" id="modal-parent" placeholder="Optional parent UID..." class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none focus:border-cbse-blue">
            </div>
        `;
    } else if (role === 'teacher') {
        extraFields = `
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Grade</label>
                    <select id="modal-grade" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-cbse-blue" onchange="window.populateDisciplineDropdown()">
                        <option value="">Select Grade</option>
                        ${[6,7,8,9,10,11,12].map(g => `<option value="${g}">${g}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Section</label>
                    <input type="text" id="modal-section" placeholder="e.g. A" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-cbse-blue">
                </div>
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Discipline</label>
                <select id="modal-discipline" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-cbse-blue disabled:opacity-50">
                    <option value="">Select Grade first...</option>
                </select>
            </div>
        `;
    } else if (role === 'vip') {
        extraFields = `
            <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Role Type</label>
                <select id="modal-role-type" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-cbse-blue">
                    <option value="principal">Principal</option>
                    <option value="admin">Admin</option>
                </select>
            </div>
        `;
    }

    modalContainer.innerHTML = `
        <div class="fixed inset-0 bg-slate-900/50 flex justify-center items-center z-50 backdrop-blur-sm" id="onboarding-modal">
            <div class="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden transform transition-all">
                <div class="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
                    <h3 class="text-lg font-black text-slate-800"><i class="fas fa-user-plus mr-2 text-cbse-blue"></i> Add ${roleTitle}</h3>
                    <button onclick="window.closeAddModal()" class="text-slate-400 hover:text-danger-red transition"><i class="fas fa-times text-xl"></i></button>
                </div>
                <div class="p-6 space-y-4">
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Name / Display Name</label>
                        <input type="text" id="modal-name" placeholder="John Doe" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-cbse-blue">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label>
                        <input type="email" id="modal-email" placeholder="john@example.com" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-cbse-blue">
                    </div>

                    ${extraFields}

                    <div id="modal-error" class="hidden text-xs font-bold text-danger-red bg-red-50 p-2 rounded border border-red-100 mt-2"></div>
                </div>
                <div class="bg-slate-50 p-4 border-t border-slate-200 flex justify-end gap-3">
                    <button onclick="window.closeAddModal()" class="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition">Cancel</button>
                    <button onclick="window.submitAddModal('${role}')" class="px-5 py-2 text-sm font-bold bg-cbse-blue text-white rounded-lg shadow hover:bg-blue-800 transition">Save ${roleTitle}</button>
                </div>
            </div>
        </div>
    `;
};

window.closeAddModal = () => {
    const mc = document.getElementById('modal-container');
    if(mc) mc.innerHTML = '';
};

window.populateDisciplineDropdown = async () => {
    const grade = document.getElementById('modal-grade').value;
    const discDropdown = document.getElementById('modal-discipline');

    if(!grade) {
        discDropdown.innerHTML = '<option value="">Select Grade first...</option>';
        discDropdown.disabled = true;
        return;
    }

    try {
        const curriculumData = await loadCurriculum(grade);
        const subjects = Object.keys(curriculumData);
        if(subjects.length === 0) {
            discDropdown.innerHTML = '<option value="">No subjects found for grade</option>';
            discDropdown.disabled = true;
            return;
        }

        let html = '<option value="">Select Discipline</option>';
        subjects.forEach(sub => {
            html += `<option value="${sub}">${sub}</option>`;
        });

        discDropdown.innerHTML = html;
        discDropdown.disabled = false;
    } catch(e) {
        console.error("Failed to load curriculum:", e);
        discDropdown.innerHTML = '<option value="">Error loading curriculum</option>';
    }
};

window.submitAddModal = async (role) => {
    const errorEl = document.getElementById('modal-error');
    const showError = (msg) => {
        errorEl.innerText = msg;
        errorEl.classList.remove('hidden');
    };

    const name = document.getElementById('modal-name').value.trim();
    const email = document.getElementById('modal-email').value.trim();

    if(!name || !email) {
        return showError("Name and Email are required.");
    }

    let payload = {
        displayName: name,
        email: email,
        role: role,
        school_id: currentSchoolId,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
    };

    let parentUID = null;

    if (role === 'student') {
        const g = document.getElementById('modal-grade').value.trim();
        const s = document.getElementById('modal-section').value.trim();
        parentUID = document.getElementById('modal-parent').value.trim();

        if(!g || !s) return showError("Grade and Section are required.");

        payload.grade = g;
        payload.section = s;
        payload.section_id = `${g}-${s}`;
        if(parentUID) payload.parent_id = parentUID;
    } else if (role === 'teacher') {
        const g = document.getElementById('modal-grade').value.trim();
        const s = document.getElementById('modal-section').value.trim();
        const disc = document.getElementById('modal-discipline').value.trim();

        if(!g || !s || !disc) return showError("Grade, Section, and Discipline are required.");

        payload.mapped_grade = g;
        payload.mapped_section = `${g}-${s}`;
        payload.mapped_discipline = disc;
    } else if (role === 'vip') {
        payload.role = document.getElementById('modal-role-type').value;
    }

    try {
        const { db } = await getInitializedClients();
        const newDocRef = await addDoc(collection(db, "users"), payload);

        if (role === 'student' && parentUID) {
            try {
                await updateDoc(doc(db, "users", parentUID), {
                    linked_children: arrayUnion(newDocRef.id),
                    updated_at: serverTimestamp()
                });
            } catch(e) {
                console.error("Failed to link parent during student creation:", e);
                alert("Student created, but linking Parent failed (check Parent UID).");
            }
        }

        window.closeAddModal();
    } catch(e) {
        const errorMsg = e.message.toLowerCase();
        if (errorMsg.includes("insufficient permissions") || errorMsg.includes("missing or insufficient permissions")) {
            showError("Admin Role detected but Firestore Rules are blocking the write. Please authorize the Admin bypass in the Firebase Console.");
        } else {
            showError("Failed to save: " + e.message);
        }
    }
};

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

function getRelationalOnboardingHTML() {
    return `
        <div class="flex items-center gap-4 mb-6">
            <div class="w-10 h-10 bg-slate-50 text-slate-400 flex items-center justify-center rounded-xl text-lg">
                <i class="fas fa-file-csv"></i>
            </div>
            <div>
                <h3 class="text-lg font-black text-slate-800">Bulk Relational Onboarding</h3>
                <p class="text-xs text-slate-500 font-medium">Upload CSV to map teachers and bridge parents.</p>
            </div>
        </div>
        <div class="flex gap-4 items-center">
            <label class="bg-slate-100 text-slate-700 px-6 py-2 rounded-xl text-sm font-bold shadow-sm hover:bg-slate-200 transition cursor-pointer border border-slate-200">
                Select CSV File
                <input type="file" accept=".csv" class="hidden" onchange="window.handleCSVUpload(event)">
            </label>
            <div id="upload-status" class="text-sm font-bold text-slate-600 hidden"></div>
        </div>
        <div id="mapping-log" class="mt-4 text-xs font-mono text-slate-500 h-24 overflow-y-auto space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-100"></div>
    `;
}

function renderBucket(elementId, users, type) {
    const el = document.getElementById(elementId);
    if (!el) return;

    if (users.length === 0) {
        el.innerHTML = `<tr><td colspan="${type==='student'?3:4}" class="p-4 text-center text-slate-400 italic font-medium">No entries found.</td></tr>`;
        return;
    }

    el.innerHTML = users.map(u => {
        const nameOrEmail = u.displayName || u.email || u.id;

        if (type === 'student') {
            const parentText = u.parent_id ? `<span class="text-slate-700 font-mono text-[10px] bg-slate-100 px-2 py-1 rounded border border-slate-200">${u.parent_id}</span>` : `<span class="text-danger-red text-xs font-bold">Unlinked</span>`;
            return `
                <tr class="hover:bg-slate-50 transition">
                    <td class="p-2 font-bold text-slate-700">${nameOrEmail}</td>
                    <td class="p-2">${parentText}</td>
                    <td class="p-2 text-right">
                        <button onclick="window.promptLinkParent('${u.id}')" class="text-cbse-blue hover:text-blue-800 font-bold text-[10px] bg-blue-50 px-2 py-1 rounded-lg border border-blue-100 shadow-sm transition active:scale-95">Link Parent</button>
                    </td>
                </tr>
            `;
        } else if (type === 'teacher') {
            return `
                <tr class="hover:bg-slate-50 transition">
                    <td class="p-4 font-bold text-slate-700">${nameOrEmail}</td>
                    <td class="p-4 text-xs font-bold text-slate-500">${u.mapped_discipline || 'Unassigned'}</td>
                    <td class="p-4 text-xs font-bold text-slate-500">${u.mapped_section || 'Unassigned'}</td>
                    <td class="p-4 text-right">
                        <button onclick="window.promptAssignTeacher('${u.id}')" class="text-amber-600 hover:text-amber-800 font-bold text-xs bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100 shadow-sm transition active:scale-95">Assign</button>
                    </td>
                </tr>
            `;
        } else {
            return `
                <tr class="hover:bg-slate-50 transition">
                    <td class="p-4 font-bold text-slate-700">${nameOrEmail}</td>
                    <td class="p-4"><span class="px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest bg-purple-100 text-purple-700">${u.role}</span></td>
                    <td class="p-4 text-xs font-bold text-slate-500">${u.school_id}</td>
                    <td class="p-4 text-right"><span class="text-success-green font-bold text-xs"><i class="fas fa-check-circle"></i> Active</span></td>
                </tr>
            `;
        }
    }).join('');
}

window.promptLinkParent = async (studentId) => {
    const parentId = prompt("Enter the Parent UID to link to this student:");
    if(!parentId) return;
    window.linkParentToStudent(studentId, parentId);
};

window.linkParentToStudent = async (studentUid, parentUid) => {
    try {
        const { db } = await getInitializedClients();

        // Double-Link
        await updateDoc(doc(db, "users", studentUid), {
            parent_id: parentUid,
            updated_at: serverTimestamp()
        });
        await updateDoc(doc(db, "users", parentUid), {
            linked_children: arrayUnion(studentUid),
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

window.promptAssignTeacher = async (teacherId) => {
    const grade = prompt("Enter Grade (e.g., 9):");
    const section = prompt("Enter Section (e.g., A):");
    const discipline = prompt("Enter Discipline (e.g., Science):");

    if(!grade || !section || !discipline) return;
    window.assignTeacherToSection(teacherId, grade, section, discipline);
};

window.assignTeacherToSection = async (teacherUid, grade, section, discipline) => {
    try {
        const { db } = await getInitializedClients();
        await updateDoc(doc(db, "users", teacherUid), {
            mapped_grade: grade,
            mapped_section: section,
            mapped_discipline: discipline,
            updated_at: serverTimestamp()
        });
        alert(`Teacher assigned to Grade ${grade}-${section} for ${discipline}`);
    } catch(e) {
        const errorMsg = e.message.toLowerCase();
        if (errorMsg.includes("insufficient permissions") || errorMsg.includes("missing or insufficient permissions")) {
            alert("Admin Role detected but Firestore Rules are blocking the write. Please authorize the Admin bypass in the Firebase Console.");
        } else {
            alert("Failed to assign teacher: " + e.message);
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
