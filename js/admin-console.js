import { getInitializedClients } from "./config.js";
import { guardConsole, bindConsoleLogout } from "./guard.js";
import { loadCurriculum } from "./curriculum/loader.js";
import { collection, query, where, getDocs, doc, updateDoc, addDoc, serverTimestamp, onSnapshot, orderBy, arrayUnion, arrayRemove, setDoc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// Initialize the secondary app specifically for onboarding
let secondaryAuth = null;
try {
    const secondaryApp = initializeApp(window.__firebase_config, "SecondaryOnboarding");
    secondaryAuth = getAuth(secondaryApp);
} catch (e) {
    console.error("Failed to initialize SecondaryOnboarding instance:", e);
}

// Global state
let currentSchoolId = null;
let unsubMessages = null;
let unsubRegistry = null;
let schoolGrades = [6, 7, 8, 9, 10, 11, 12];
let schoolSections = ['A', 'B', 'C'];
let schoolDisciplines = ['Physics', 'Chemistry', 'Biology', 'Mathematics', 'Social Science', 'English'];

// The Loading Lock: Defined before guardConsole
window.loadConsoleData = async (profile) => {
    currentSchoolId = profile.school_id;
    if (!currentSchoolId) {
        alert("Critical Error: No School ID found for Admin.");
        return;
    }
    console.log(`Loading Admin Console for School: ${currentSchoolId}`);

    try {
        const { db } = await getInitializedClients();
        const schoolDoc = await getDoc(doc(db, "schools", currentSchoolId));
        if (schoolDoc.exists()) {
            const schoolData = schoolDoc.data();
            if (schoolData.grades && schoolData.grades.length > 0) schoolGrades = schoolData.grades;
            if (schoolData.sections && schoolData.sections.length > 0) schoolSections = schoolData.sections;
            if (schoolData.disciplines && schoolData.disciplines.length > 0) schoolDisciplines = schoolData.disciplines;
        }
    } catch(e) {
        console.warn("Could not load school config, using defaults:", e.message);
    }

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

    // Generate Accordion HTML structure for Classes
    let classesAccordionHtml = '';
    const grades = schoolGrades;
    const sections = schoolSections;

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

                        <!-- Subject Teachers for this section -->
                        <div class="mb-4">
                            <h4 class="text-[10px] uppercase font-bold text-slate-500 mb-2 tracking-widest bg-slate-100 px-2 py-1 rounded">Subject Teachers</h4>
                            <div id="sec-teachers-${g}-${s}" class="text-xs text-slate-600 space-y-1">
                                <span class="italic text-slate-400">Loading...</span>
                            </div>
                        </div>

                        <!-- Students List -->
                        <div class="flex justify-between items-end mb-2">
                            <h4 class="text-[10px] uppercase font-bold text-slate-500 tracking-widest bg-slate-100 px-2 py-1 rounded">Students Roster</h4>
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

            <div class="mb-4">
                <input type="text" id="inventory-search" placeholder="Search by name or email..." class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:border-cbse-blue transition">
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

            ${getRelationalOnboardingHTML()}

            <div class="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar mt-4">

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
                        <div id="faculty-pillars-container">
                            <div class="text-center text-slate-400 italic p-4 text-xs">Loading Faculty Pillars...</div>
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

            <!-- Manual Onboarding Modal Container -->
            <div id="modal-container"></div>
        </div>
    `;

    if(unsubRegistry) { unsubRegistry(); }

    const { db } = await getInitializedClients();
    const q = query(
        collection(db, "users"),
        where("school_id", "==", currentSchoolId)
    );

    unsubRegistry = onSnapshot(q, (snapshot) => {
        const studentMap = {};
        const teacherList = [];
        const vipList = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            const u = { id: doc.id, ...data };

            if (u.role === 'student') {
                const g = u.grade || 'Unknown';
                let s = u.section_id || u.section || 'Unknown';
                if(s.includes('-')) s = s.split('-')[1]; // handles "9-A"
                else s = s.replace(g, ''); // handles "9A" -> "A"

                const key = `${g}-${s}`;
                if(!studentMap[key]) studentMap[key] = [];
                studentMap[key].push(u);
            }
            else if (u.role === 'teacher') {
                teacherList.push(u);
            }
            else if (u.role === 'principal' || u.role === 'admin' || u.role === 'vip') {
                vipList.push(u);
            }
        });

        // 1. Render VIPs
        renderBucket('tbody-vips', vipList, 'vip');

        // 2. Render Students & Subject Teachers per Class Section
        grades.forEach(g => {
            sections.forEach(s => {
                const sectionKey = `${g}${s}`; // e.g., "9A"
                const sectionKeyHyphen = `${g}-${s}`; // e.g., "9-A"

                // Render Students
                const id = `tbody-student-${g}-${s}`;
                const users = studentMap[`${g}-${s}`] || [];
                renderBucket(id, users, 'student');

                // Render Subject Teachers for this section
                const secTeachersEl = document.getElementById(`sec-teachers-${g}-${s}`);
                if (secTeachersEl) {
                    // Find teachers who have this section in their sections array
                    const classTeachers = teacherList.filter(t => {
                        const tSecs = t.sections || [];
                        // Check array field (new format)
                        if (tSecs.includes(sectionKey) || tSecs.includes(sectionKeyHyphen)) return true;
                        // Fallback: check singular fields (old format)
                        if (t.mapped_grade == g && t.mapped_section == s) return true;
                        return false;
                    });

                    if (classTeachers.length === 0) {
                        secTeachersEl.innerHTML = '<span class="italic text-slate-400">No teachers assigned to this section.</span>';
                    } else {
                        // Group by discipline
                        const grouped = {};
                        classTeachers.forEach(t => {
                            const discs = t.mapped_disciplines || (t.mapped_discipline ? [t.mapped_discipline] : ['Unassigned']);
                            discs.forEach(d => {
                                if(!grouped[d]) grouped[d] = [];
                                grouped[d].push(t.displayName || t.email);
                            });
                        });

                        let html = '<div class="grid grid-cols-2 gap-2">';
                        for(const [disc, names] of Object.entries(grouped)) {
                            html += `<div class="bg-blue-50 px-2 py-1 border border-blue-100 rounded text-cbse-blue font-medium"><span class="font-bold uppercase tracking-wider text-[9px] block text-slate-400">${disc}</span>${names.join(', ')}</div>`;
                        }
                        html += '</div>';
                        secTeachersEl.innerHTML = html;
                    }
                }
            });
        });

        // 3. Render Faculty Pillars
        renderFacultyPillars(teacherList);
    });
};

function renderFacultyPillars(teachers) {
    const container = document.getElementById('faculty-pillars-container');
    if(!container) return;

    // Grouping structure
    const mathTeachers = [];
    const socialTeachers = [];
    const sciencePillars = { Physics: [], Chemistry: [], Biology: [] };
    const otherTeachers = [];

    teachers.forEach(t => {
        const discs = t.mapped_disciplines || (t.mapped_discipline ? [t.mapped_discipline] : []);
        let matched = false;

        discs.forEach(d => {
            const lowerD = d.toLowerCase();
            if (lowerD === 'mathematics' || lowerD === 'math') {
                if(!mathTeachers.includes(t)) mathTeachers.push(t);
                matched = true;
            } else if (['physics', 'chemistry', 'biology'].includes(lowerD)) {
                const TitleCase = lowerD.charAt(0).toUpperCase() + lowerD.slice(1);
                if(!sciencePillars[TitleCase].includes(t)) sciencePillars[TitleCase].push(t);
                matched = true;
            } else if (lowerD === 'social science' || lowerD === 'history' || lowerD === 'geography' || lowerD === 'civics') {
                if(!socialTeachers.includes(t)) socialTeachers.push(t);
                matched = true;
            }
        });

        if (!matched) {
            otherTeachers.push(t);
        }
    });

    const buildTeacherTable = (teacherArray) => {
        if(teacherArray.length === 0) return '<div class="p-4 text-center text-xs text-slate-400 italic border-t border-slate-100">No teachers assigned.</div>';

        let rows = '';
        teacherArray.forEach(u => {
            const name = u.displayName || u.email || 'Unknown';
            const secs = (u.sections || []).join(', ') || '<span class="italic opacity-50">None</span>';
            const disc = (u.mapped_disciplines || []).join(', ') || u.mapped_discipline || 'Unassigned';

            rows += `
                <div class="flex justify-between items-center p-3 border-t border-slate-100 hover:bg-slate-50 text-xs text-slate-700">
                    <div class="font-bold">${name} <span class="block text-[10px] text-slate-400 font-normal mt-0.5">${disc}</span></div>
                    <div class="font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">${secs}</div>
                </div>
            `;
        });
        return rows;
    };

    container.innerHTML = `
        <div class="space-y-4">
            <!-- Mathematics Pillar -->
            <div class="border border-blue-200 rounded-xl bg-blue-50/30 overflow-hidden shadow-sm">
                <button onclick="window.toggleAccordion('pillar-math')" class="w-full text-left p-3 font-bold flex justify-between items-center hover:bg-blue-50 transition text-cbse-blue text-sm">
                    <span><i class="fas fa-calculator mr-2"></i> Mathematics</span>
                    <i class="fas fa-chevron-down text-blue-300 transition-transform duration-200" id="icon-pillar-math"></i>
                </button>
                <div id="pillar-math" class="hidden bg-white">
                    ${buildTeacherTable(mathTeachers)}
                </div>
            </div>

            <!-- Science Pillar (Sub-disciplines) -->
            <div class="border border-purple-200 rounded-xl bg-purple-50/30 overflow-hidden shadow-sm">
                <button onclick="window.toggleAccordion('pillar-sci')" class="w-full text-left p-3 font-bold flex justify-between items-center hover:bg-purple-50 transition text-purple-700 text-sm">
                    <span><i class="fas fa-flask mr-2"></i> Science</span>
                    <i class="fas fa-chevron-down text-purple-300 transition-transform duration-200" id="icon-pillar-sci"></i>
                </button>
                <div id="pillar-sci" class="hidden bg-white p-2 space-y-2 border-t border-purple-100">
                    <!-- Physics -->
                    <div class="border border-slate-100 rounded bg-slate-50/50">
                        <div class="px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-500 border-b border-slate-100">Physics</div>
                        ${buildTeacherTable(sciencePillars.Physics)}
                    </div>
                    <!-- Chemistry -->
                    <div class="border border-slate-100 rounded bg-slate-50/50">
                        <div class="px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-500 border-b border-slate-100">Chemistry</div>
                        ${buildTeacherTable(sciencePillars.Chemistry)}
                    </div>
                    <!-- Biology -->
                    <div class="border border-slate-100 rounded bg-slate-50/50">
                        <div class="px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-500 border-b border-slate-100">Biology</div>
                        ${buildTeacherTable(sciencePillars.Biology)}
                    </div>
                </div>
            </div>

            <!-- Social Science Pillar -->
            <div class="border border-amber-200 rounded-xl bg-amber-50/30 overflow-hidden shadow-sm">
                <button onclick="window.toggleAccordion('pillar-ss')" class="w-full text-left p-3 font-bold flex justify-between items-center hover:bg-amber-50 transition text-amber-700 text-sm">
                    <span><i class="fas fa-globe mr-2"></i> Social Science</span>
                    <i class="fas fa-chevron-down text-amber-300 transition-transform duration-200" id="icon-pillar-ss"></i>
                </button>
                <div id="pillar-ss" class="hidden bg-white">
                    ${buildTeacherTable(socialTeachers)}
                </div>
            </div>

            <!-- Other Subjects -->
            ${otherTeachers.length > 0 ? `
            <div class="border border-slate-200 rounded-xl bg-slate-50/30 overflow-hidden shadow-sm">
                <button onclick="window.toggleAccordion('pillar-oth')" class="w-full text-left p-3 font-bold flex justify-between items-center hover:bg-slate-50 transition text-slate-700 text-sm">
                    <span><i class="fas fa-book mr-2"></i> Other Subjects</span>
                    <i class="fas fa-chevron-down text-slate-300 transition-transform duration-200" id="icon-pillar-oth"></i>
                </button>
                <div id="pillar-oth" class="hidden bg-white">
                    ${buildTeacherTable(otherTeachers)}
                </div>
            </div>
            ` : ''}
        </div>
    `;
}


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

async function getSecondaryAuth() {
    if (!secondaryAuth) {
        const { initializeApp } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js");
        const { getAuth } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js");
        const secApp = initializeApp(window.__firebase_config, "SecondaryOnboarding");
        secondaryAuth = getAuth(secApp);
    }
    return secondaryAuth;
}

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
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Link Parent (Parent Email)</label>
                <input type="email" id="modal-parent" placeholder="Optional parent email..." class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none focus:border-cbse-blue">
            </div>
        `;
    } else if (role === 'teacher') {
        // Build Section Grid Checkboxes
        const gradesArr = schoolGrades;
        const secsArr = schoolSections;
        let gridHtml = '<div class="grid grid-cols-3 gap-2">';
        gradesArr.forEach(g => {
            secsArr.forEach(s => {
                gridHtml += `<label class="flex items-center space-x-2 text-xs text-slate-600"><input type="checkbox" value="${g}${s}" class="teacher-sec-cb"> <span>${g}${s}</span></label>`;
            });
        });
        gridHtml += '</div>';

        let discHtml = '';
        schoolDisciplines.forEach(d => {
            discHtml += `<label class="flex items-center space-x-2 text-xs text-slate-600"><input type="checkbox" value="${d}" class="teacher-disc-cb"> <span>${d}</span></label>`;
        });

        extraFields = `
            <div class="mt-4">
                <label class="block text-xs font-bold text-slate-500 uppercase mb-2">Class Assignment Grid</label>
                <div class="bg-slate-50 border border-slate-200 rounded-lg p-3 h-32 overflow-y-auto">
                    ${gridHtml}
                </div>
            </div>
            <div class="mt-4">
                <label class="block text-xs font-bold text-slate-500 uppercase mb-2">Discipline Selection (Multi)</label>
                <div class="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
                    ${discHtml}
                </div>
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
                <div class="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Name / Display Name</label>
                        <input type="text" id="modal-name" placeholder="John Doe" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-cbse-blue">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Username (appends +alias@gmail.com)</label>
                        <input type="text" id="modal-username" placeholder="john.doe" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-cbse-blue">
                    </div>

                    ${extraFields}

                    <div id="modal-error" class="hidden text-xs font-bold text-danger-red bg-red-50 p-2 rounded border border-red-100 mt-2"></div>
                </div>
                <div class="bg-slate-50 p-4 border-t border-slate-200 flex justify-end gap-3">
                    <button onclick="window.closeAddModal()" class="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition">Cancel</button>
                    <button id="modal-save-btn" onclick="window.submitAddModal('${role}')" class="px-5 py-2 text-sm font-bold bg-cbse-blue text-white rounded-lg shadow hover:bg-blue-800 transition">Save ${roleTitle}</button>
                </div>
            </div>
        </div>
    `;
};

window.closeAddModal = () => {
    const mc = document.getElementById('modal-container');
    if(mc) mc.innerHTML = '';
};

window.submitAddModal = async (role) => {
    const errorEl = document.getElementById('modal-error');
    const saveBtn = document.getElementById('modal-save-btn');

    const showError = (msg) => {
        errorEl.innerText = msg;
        errorEl.classList.remove('hidden');
        saveBtn.disabled = false;
        saveBtn.innerText = "Save";
    };

    saveBtn.disabled = true;
    saveBtn.innerText = "Creating...";
    errorEl.classList.add('hidden');

    const name = document.getElementById('modal-name').value.trim();
    const username = document.getElementById('modal-username').value.trim();

    if(!name || !username) {
        return showError("Name and Username are required.");
    }

    const email = `ready4urexam+${username}@gmail.com`;
    const password = "Ready4Exam@2026";

    let payload = {
        displayName: name,
        email: email,
        role: role,
        school_id: currentSchoolId,
        tenantType: "school",
        setupComplete: false,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
    };

    let parentId = null;

    if (role === 'student') {
        const g = document.getElementById('modal-grade').value.trim();
        const s = document.getElementById('modal-section').value.trim();
        const parentEmailInput = document.getElementById('modal-parent').value.trim();
        const parentEmail = parentEmailInput ? (parentEmailInput.includes('@')
            ? parentEmailInput
            : `ready4urexam+${parentEmailInput}@gmail.com`) : "";

        if(!g || !s) return showError("Grade and Section are required.");

        payload.grade = g;
        payload.classId = g;
        payload.class_id = g;
        payload.section = s;
        payload.section_id = `${g}-${s}`;

        if (parentEmail) {
            try {
                const { db } = await getInitializedClients();
                const parentQuery = query(collection(db, "users"), where("email", "==", parentEmail), where("role", "==", "parent"));
                const parentSnap = await getDocs(parentQuery);

                let parentCreated = false;
                if (parentSnap.empty) {
                    // Step B: Atomic Onboarding - Create Parent Auth and Firestore Doc
                    if (!secondaryAuth) {
                        throw new Error("SecondaryOnboarding Auth instance is not initialized.");
                    }

                    try {
                        const parentCredential = await createUserWithEmailAndPassword(secondaryAuth, parentEmail, password);
                        parentId = parentCredential.user.uid;

                        await setDoc(doc(db, "users", parentId), {
                            displayName: "Parent User",
                            email: parentEmail,
                            uid: parentId,
                            role: "parent",
                            school_id: currentSchoolId,
                            tenantType: "school",
                            setupComplete: false,
                            created_at: serverTimestamp(),
                            updated_at: serverTimestamp()
                        }, { merge: true });

                        parentCreated = true;
                    } catch (e) {
                        if (e.code === 'auth/email-already-in-use') {
                            return showError(`User Auth exists but Profile is missing. Please delete ${parentEmail} from the Firebase Authentication tab to reset.`);
                        } else {
                            throw e;
                        }
                    }
                } else {
                    parentId = parentSnap.docs[0].id;
                }

                payload.parent_id = parentId;
                payload._parentCreated = parentCreated; // Temporary flag for UI feedback
            } catch(e) {
                return showError("Failed to verify/create parent email: " + e.message);
            }
        }

    } else if (role === 'teacher') {
        const checkedSecs = Array.from(document.querySelectorAll('.teacher-sec-cb:checked')).map(cb => cb.value);
        const checkedDiscs = Array.from(document.querySelectorAll('.teacher-disc-cb:checked')).map(cb => cb.value);

        if(checkedSecs.length === 0 || checkedDiscs.length === 0) {
            return showError("At least one Section and one Discipline are required.");
        }

        payload.sections = checkedSecs;
        payload.mapped_disciplines = checkedDiscs;

    } else if (role === 'vip') {
        payload.role = document.getElementById('modal-role-type').value;
    }

    try {
        const { db } = await getInitializedClients();

        // Step A: Search for existing user profile by email
        const userQuery = query(collection(db, "users"), where("email", "==", email));
        const userSnap = await getDocs(userQuery);

        let newUid = null;

        if (!userSnap.empty) {
            newUid = userSnap.docs[0].id;
            console.log("Account exists in Firestore, linking to existing identity");
        } else {
            // Zero-Manual Flow: Create User via Secondary Auth App
            if (!secondaryAuth) {
                throw new Error("SecondaryOnboarding Auth instance is not initialized.");
            }

            try {
                const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
                newUid = userCredential.user.uid;
            } catch (e) {
                if (e.code === 'auth/email-already-in-use') {
                    return showError(`User Auth exists but Profile is missing. Please delete ${email} from the Firebase Authentication tab to reset.`);
                } else {
                    throw e;
                }
            }

            // Automatically sign out the secondary instance so we don't leak it
            await signOut(secondaryAuth);
        }

        // Save to Firestore using the standard DB (Admin has rules bypass/privileges hopefully)
        const parentCreatedFlag = payload._parentCreated;
        delete payload._parentCreated; // Remove temporary flag before saving
        payload.uid = newUid;
        await setDoc(doc(db, "users", newUid), payload, { merge: true });

        // Parent double-link
        if (role === 'student' && parentId) {
            try {
                await updateDoc(doc(db, "users", parentId), {
                    linked_children: arrayUnion(newUid),
                    updated_at: serverTimestamp()
                });

                if (parentCreatedFlag) {
                    alert("Success: Student created and Parent account auto-provisioned.");
                } else {
                    alert("Success: Student created and linked to existing parent.");
                }
            } catch(e) {
                console.error("Failed to link parent during student creation:", e);
                alert("Student created, but linking Parent failed (check Parent UID).");
            }
        } else if (role === 'student') {
             alert("Success: Student created successfully.");
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
                let email = row[0];
                if (email.endsWith('@ready4exam.internal')) {
                    const localPart = email.split('@')[0];
                    email = `ready4urexam+${localPart}@gmail.com`;
                }
                const role = row[1];

                const q = query(collection(db, "users"), where("email", "==", email), where("school_id", "==", currentSchoolId));
                const snap = await getDocs(q);

                let userId;
                if (snap.empty) {
                    if (role === 'student') {
                        // Auto-create student account
                        const csvGrade = row[2] || '9';
                        const csvSection = row[3] || 'A';
                        if (!secondaryAuth) {
                            window.logMessage(`Skipped ${email}: Secondary auth not initialized.`, true);
                            errorCount++;
                            continue;
                        }
                        try {
                            const userCred = await createUserWithEmailAndPassword(secondaryAuth, email, "Ready4Exam@2026");
                            userId = userCred.user.uid;
                            await signOut(secondaryAuth);
                            await setDoc(doc(db, "users", userId), {
                                displayName: email.split('+')[1]?.split('@')[0] || email.split('@')[0],
                                email: email,
                                uid: userId,
                                role: 'student',
                                school_id: currentSchoolId,
                                grade: csvGrade,
                                classId: csvGrade,
                                section: csvSection,
                                section_id: csvGrade + '-' + csvSection,
                                setupComplete: false,
                                tenantType: "school",
                                created_at: serverTimestamp()
                            });
                            window.logMessage(`Created student ${email} in ${csvGrade}-${csvSection}`);
                            successCount++;
                            continue;
                        } catch (createErr) {
                            window.logMessage(`Failed to create ${email}: ${createErr.message}`, true);
                            errorCount++;
                            continue;
                        }
                    } else {
                        window.logMessage(`Skipped ${email}: User not found in school.`, true);
                        errorCount++;
                        continue;
                    }
                } else {
                    const userDoc = snap.docs[0];
                    userId = userDoc.id;
                }

                if (role === 'teacher') {
                    const targetGrade = row[3] || '9';
                    const targetSection = row[4];
                    const targetDiscipline = row[5];

                    if (!targetSection || !targetDiscipline) {
                        window.logMessage(`Skipped ${email}: Missing target section or discipline for teacher assignment.`, true);
                        errorCount++;
                        continue; // Skip this row
                    }

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
                            mapped_disciplines: arrayUnion(targetDiscipline),
                            sections: arrayUnion(`${targetGrade}${targetSection}`),
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
                        <div class="flex gap-1 justify-end flex-wrap items-center">
                            <button onclick="window.promptLinkParent('${u.id}')" class="text-cbse-blue hover:text-blue-800 font-bold text-[10px] bg-blue-50 px-2 py-1 rounded-lg border border-blue-100 shadow-sm transition active:scale-95">Link Parent</button>
                            <button onclick="window.showEditModal('${u.id}')" class="text-slate-600 hover:text-slate-800 font-bold text-[10px] bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 shadow-sm transition active:scale-95">Edit</button>
                            <button onclick="window.resetUserPassword('${u.email || ''}', '${(u.displayName || '').replace(/'/g, "\'")}')" class="text-blue-600 hover:text-blue-800 font-bold text-[10px] bg-blue-50 px-2 py-1 rounded-lg border border-blue-200 shadow-sm transition active:scale-95">Reset Pwd</button>
                            <button onclick="window.deleteUser('${u.id}', '${(u.displayName || u.email || '').replace(/'/g, "\'")}')" class="text-danger-red hover:text-red-800 font-bold text-[10px] bg-red-50 px-2 py-1 rounded-lg border border-red-100 shadow-sm transition active:scale-95">Delete</button>
                        </div>
                    </td>
                </tr>
            `;
        } else if (type === 'teacher') {
            return `
                <tr class="hover:bg-slate-50 transition">
                    <td class="p-4 font-bold text-slate-700">${nameOrEmail}</td>
                    <td class="p-4 text-xs font-bold text-slate-500">${(u.mapped_disciplines || [u.mapped_discipline]).filter(Boolean).join(', ') || 'Unassigned'}</td>
                    <td class="p-4 text-xs font-bold text-slate-500">${(u.sections || [u.mapped_section]).filter(Boolean).join(', ') || 'Unassigned'}</td>
                    <td class="p-4 text-right">
                        <div class="flex gap-1 justify-end flex-wrap items-center">
                            <button onclick="window.promptAssignTeacher('${u.id}')" class="text-amber-600 hover:text-amber-800 font-bold text-xs bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100 shadow-sm transition active:scale-95">Assign</button>
                            <button onclick="window.showEditModal('${u.id}')" class="text-slate-600 hover:text-slate-800 font-bold text-[10px] bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 shadow-sm transition active:scale-95">Edit</button>
                            <button onclick="window.resetUserPassword('${u.email || ''}', '${(u.displayName || '').replace(/'/g, "\'")}')" class="text-blue-600 hover:text-blue-800 font-bold text-[10px] bg-blue-50 px-2 py-1 rounded-lg border border-blue-200 shadow-sm transition active:scale-95">Reset Pwd</button>
                            <button onclick="window.deleteUser('${u.id}', '${(u.displayName || u.email || '').replace(/'/g, "\'")}')" class="text-danger-red hover:text-red-800 font-bold text-[10px] bg-red-50 px-2 py-1 rounded-lg border border-red-100 shadow-sm transition active:scale-95">Delete</button>
                        </div>
                    </td>
                </tr>
            `;
        } else {
            return `
                <tr class="hover:bg-slate-50 transition">
                    <td class="p-4 font-bold text-slate-700">${nameOrEmail}</td>
                    <td class="p-4"><span class="px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest bg-purple-100 text-purple-700">${u.role}</span></td>
                    <td class="p-4 text-xs font-bold text-slate-500">${u.school_id}</td>
                    <td class="p-4 text-right">
                        <div class="flex gap-1 justify-end flex-wrap items-center">
                            <span class="text-success-green font-bold text-xs"><i class="fas fa-check-circle"></i> Active</span>
                            <button onclick="window.showEditModal('${u.id}')" class="text-slate-600 hover:text-slate-800 font-bold text-[10px] bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 shadow-sm transition active:scale-95">Edit</button>
                            <button onclick="window.resetUserPassword('${u.email || ''}', '${(u.displayName || '').replace(/'/g, "\\'")}')" class="text-blue-600 hover:text-blue-800 font-bold text-[10px] bg-blue-50 px-2 py-1 rounded-lg border border-blue-200 shadow-sm transition active:scale-95">Reset Pwd</button>
                            <button onclick="window.deleteUser('${u.id}', '${(u.displayName || u.email || '').replace(/'/g, "\\'")}')" class="text-danger-red hover:text-red-800 font-bold text-[10px] bg-red-50 px-2 py-1 rounded-lg border border-red-100 shadow-sm transition active:scale-95">Delete</button>
                        </div>
                    </td>
                </tr>
            `;
        }
    }).join('');
}

window.promptLinkParent = async (studentId) => {
    const parentEmail = prompt("Enter the Parent Email to link to this student:");
    if(!parentEmail) return;
    window.linkParentToStudent(studentId, parentEmail);
};

window.linkParentToStudent = async (studentUid, parentEmail) => {
    try {
        const { db } = await getInitializedClients();

        // Query for parent by email
        const parentQuery = query(collection(db, "users"), where("email", "==", parentEmail), where("role", "==", "parent"), where("school_id", "==", currentSchoolId));
        const parentSnap = await getDocs(parentQuery);

        if (parentSnap.empty) {
            alert("Parent not found with that email.");
            return;
        }

        const parentUid = parentSnap.docs[0].id;

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
    const section = prompt("Enter Section letter (e.g., A):");
    const discipline = prompt("Enter Discipline (e.g., Science):");

    if(!grade || !section || !discipline) return;
    window.assignTeacherToSection(teacherId, grade, section, discipline);
};

window.assignTeacherToSection = async (teacherUid, grade, section, discipline) => {
    try {
        const { db } = await getInitializedClients();
        await updateDoc(doc(db, "users", teacherUid), {
            mapped_disciplines: arrayUnion(discipline),
            sections: arrayUnion(`${grade}${section}`),
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


window.deleteStudent = async (studentUid, name) => {
    if (!confirm(`Are you sure you want to permanently delete student ${name}? This will also unlink them from their parent.`)) return;

    try {
        const { db } = await getInitializedClients();
        const studentRef = doc(db, 'users', studentUid);
        const studentSnap = await getDoc(studentRef);

        if (studentSnap.exists()) {
            const studentData = studentSnap.data();
            const parentId = studentData.parent_id;

            if (parentId) {
            if (parentId) {
                // Remove student from parent's linked_children array
                try {
                    const parentRef = doc(db, 'users', parentId);
                    await updateDoc(parentRef, {
                        linked_children: arrayRemove(studentUid),
                        updated_at: serverTimestamp()
                    });
                } catch (unlinkErr) {
                    console.warn("Could not unlink from parent (may already be deleted):", unlinkErr);
                }
            }
        }

        // Delete the student record
        await deleteDoc(studentRef);
        alert('Student deleted successfully.');
    } catch (error) {
        console.error("Failed to delete student:", error);
        alert("Failed to delete student: " + error.message);
    }
};

window.deleteUser = async (userId, displayName) => {

    if (!confirm(`Are you sure you want to delete "${displayName}"? This removes their Firestore profile. Firebase Auth account must be deleted separately from Firebase Console.`)) return;
    try {
        const { db } = await getInitializedClients();
        await deleteDoc(doc(db, "users", userId));
        alert(`"${displayName}" has been removed from the registry.`);
    } catch(e) {
        console.error("Delete failed:", e);
        alert("Failed to delete: " + e.message);
    }
};


window.resetUserPassword = async (email, displayName) => {
    if (!email) { alert("No email found for this user."); return; }

    const action = confirm(
        `Reset password for "${displayName}"?\n\n` +
        `This will:\n` +
        `1. Send a Firebase password reset email to ${email}\n` +
        `2. Reset their setupComplete flag so they get prompted to change password on next login\n\n` +
        `NOTE: The reset email arrives in the ready4urexam@gmail.com inbox (Gmail ignores +tags). Check Spam/Promotions if not found.`
    );
    if (!action) return;

    try {
        const { auth, db } = await getInitializedClients();

        // Step 1: Send Firebase password reset email
        console.log("[RESET] Sending password reset email to:", email);
        await sendPasswordResetEmail(auth, email);
        console.log("[RESET] sendPasswordResetEmail succeeded for:", email);

        // Step 2: Reset setupComplete in Firestore so guard triggers password change on next login
        const userQuery = query(collection(db, "users"), where("email", "==", email));
        const userSnap = await getDocs(userQuery);

        if (!userSnap.empty) {
            const userDocRef = userSnap.docs[0].ref;
            await updateDoc(userDocRef, {
                setupComplete: false,
                updated_at: serverTimestamp()
            });
            console.log("[RESET] setupComplete reset to false for:", email);
        }

        alert(
            `Password reset email sent to ${email}.\n\n` +
            `CHECK: ready4urexam@gmail.com inbox → Spam/Promotions folder.\n\n` +
            `Additionally, setupComplete has been reset. If the user logs in with their current password, they will be prompted to set a new one.`
        );
    } catch(e) {
        console.error("[RESET] Failed:", e);
        if (e.code === 'auth/user-not-found') {
            alert(`Failed: No Firebase Auth account found for ${email}. The user may need to be re-created.`);
        } else {
            alert("Failed to send reset email: " + e.message + "\n\nCheck browser console for details.");
        }
    }
};


window.showEditModal = async (userId) => {
    try {
        const { db } = await getInitializedClients();
        const userSnap = await getDoc(doc(db, "users", userId));
        if (!userSnap.exists()) { alert("User not found."); return; }
        const u = userSnap.data();

        const modalContainer = document.getElementById('modal-container');
        modalContainer.innerHTML = `
            <div class="fixed inset-0 bg-slate-900/50 flex justify-center items-center z-50 backdrop-blur-sm" id="edit-modal">
                <div class="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                    <div class="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
                        <h3 class="text-lg font-black text-slate-800"><i class="fas fa-user-edit mr-2 text-cbse-blue"></i> Edit User</h3>
                        <button onclick="document.getElementById('modal-container').innerHTML=''" class="text-slate-400 hover:text-danger-red transition"><i class="fas fa-times text-xl"></i></button>
                    </div>
                    <div class="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Display Name</label>
                            <input type="text" id="edit-name" value="${(u.displayName || '').replace(/"/g, '&quot;')}" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-cbse-blue">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Role</label>
                            <select id="edit-role" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-cbse-blue">
                                <option value="student" ${u.role === 'student' ? 'selected' : ''}>Student</option>
                                <option value="teacher" ${u.role === 'teacher' ? 'selected' : ''}>Teacher</option>
                                <option value="parent" ${u.role === 'parent' ? 'selected' : ''}>Parent</option>
                                <option value="principal" ${u.role === 'principal' ? 'selected' : ''}>Principal</option>
                                <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                            </select>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Grade</label>
                                <input type="text" id="edit-grade" value="${u.grade || ''}" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-cbse-blue">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Section</label>
                                <input type="text" id="edit-section" value="${u.section || ''}" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-cbse-blue">
                            </div>
                        </div>
                        <div id="edit-error" class="hidden text-xs font-bold text-danger-red bg-red-50 p-2 rounded border border-red-100"></div>
                    </div>
                    <div class="bg-slate-50 p-4 border-t border-slate-200 flex justify-end gap-3">
                        <button onclick="document.getElementById('modal-container').innerHTML=''" class="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition">Cancel</button>
                        <button id="edit-save-btn" class="px-5 py-2 text-sm font-bold bg-cbse-blue text-white rounded-lg shadow hover:bg-blue-800 transition">Save Changes</button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('edit-save-btn').addEventListener('click', async () => {
            const newName = document.getElementById('edit-name').value.trim();
            const newRole = document.getElementById('edit-role').value;
            const newGrade = document.getElementById('edit-grade').value.trim();
            const newSection = document.getElementById('edit-section').value.trim();
            const errorEl = document.getElementById('edit-error');

            if (!newName) {
                errorEl.innerText = "Name is required.";
                errorEl.classList.remove('hidden');
                return;
            }

            try {
                const updatePayload = {
                    displayName: newName,
                    role: newRole,
                    updated_at: serverTimestamp()
                };
                if (newGrade) { updatePayload.grade = newGrade; updatePayload.classId = newGrade; }
                if (newSection) { updatePayload.section = newSection; }
                if (newGrade && newSection) { updatePayload.section_id = newGrade + '-' + newSection; }

                await updateDoc(doc(db, "users", userId), updatePayload);
                document.getElementById('modal-container').innerHTML = '';
                alert("User updated successfully.");
            } catch(e) {
                errorEl.innerText = "Failed: " + e.message;
                errorEl.classList.remove('hidden');
            }
        });
    } catch(e) {
        alert("Failed to load user: " + e.message);
    }
};

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

        await addDoc(collection(db, "messages"), payload);

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
        collection(db, "messages"),
        where("school_id", "==", currentSchoolId)
    );

    unsubMessages = onSnapshot(q, (snapshot) => {
        const feed = document.getElementById('msg-feed');
        if(!feed) return;

        if(snapshot.empty) {
            feed.innerHTML = `<div class="text-center text-slate-400 font-bold italic py-8">No communications found for this school.</div>`;
            return;
        }

        let html = '';

        // Convert to array and sort manually since we removed orderBy
        const docs = [];
        snapshot.forEach(doc => docs.push(doc));
        docs.sort((a,b) => {
            const ta = a.data().timestamp ? a.data().timestamp.toMillis() : 0;
            const tb = b.data().timestamp ? b.data().timestamp.toMillis() : 0;
            return tb - ta;
        });

        docs.forEach(doc => {
            const d = doc.data();
            const date = d.timestamp?.toDate ? d.timestamp.toDate().toLocaleString() : 'Just now';

            html += `
                <div class="bg-white p-4 rounded-xl shadow-sm border border-blue-100">
                    <div class="flex justify-between items-start mb-2">
                        <span class="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-blue-50 text-cbse-blue">
                            Grade: ${d.target_grade} | Section: ${d.target_section}
                        </span>
                        <span class="text-[10px] text-slate-400 font-bold">${date}</span>
                    </div>
                    <p class="text-sm text-slate-700 font-medium">${d.text}</p>
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
