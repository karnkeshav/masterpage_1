import { getInitializedClients } from "./config.js";
import { guardConsole, bindConsoleLogout } from "./guard.js";
import { loadCurriculum } from "./curriculum/loader.js";
import { collection, query, where, getDocs, doc, updateDoc, addDoc, serverTimestamp, onSnapshot, orderBy, arrayUnion, setDoc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
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
let allStudentMap = {};
let allTeacherList = [];
let allVipList = [];
let schoolGrades = [6, 7, 8, 9, 10, 11, 12];
let schoolSections = ['A', 'B', 'C'];
let schoolDisciplines = ['Mathematics', 'Science', 'Physics', 'Chemistry', 'Biology', 'Social Science', 'English', 'Hindi', 'Sanskrit'];


// The Loading Lock: Defined before guardConsole

window.loadConsoleData = async (profile) => {
    try {
        currentSchoolId = profile.school_id;
        if (!currentSchoolId) throw new Error("No school ID found in profile");

        const { db } = await getInitializedClients();
        const schoolDoc = await getDoc(doc(db, "schools", currentSchoolId));
        if (schoolDoc.exists()) {
            const data = schoolDoc.data();
            if (data.grades && data.grades.length > 0) schoolGrades = data.grades;
            if (data.sections && data.sections.length > 0) schoolSections = data.sections;
            if (data.disciplines && data.disciplines.length > 0) schoolDisciplines = data.disciplines;
        }

        document.getElementById('school-name-display').innerText = `School ID: ${currentSchoolId}`;
        window.switchTab('inventory'); // Default tab
    } catch(e) {
        document.getElementById('app').innerHTML = `<div class="text-danger-red font-bold p-8">Initialization Error: ${e.message}</div>`;
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
                        // Create user instead of skipping
                        const targetGrade = row[2];
                        const targetSection = row[3];

                        if (!secondaryAuth) {
                            window.logMessage(`Skipped ${email}: Secondary auth not initialized.`, true);
                            errorCount++;
                            continue;
                        }

                        const tempPassword = "Ready4Exam@2026";
                        try {
                            const userCred = await createUserWithEmailAndPassword(secondaryAuth, email, tempPassword);
                            userId = userCred.user.uid;
                            await setDoc(doc(db, "users", userId), {
                                displayName: email.split('@')[0],
                                email: email,
                                role: 'student',
                                school_id: currentSchoolId,
                                classId: targetGrade || '9',
                                section: targetSection || 'A',
                                setupComplete: false,
                                tenantType: "school",
                                created_at: serverTimestamp()
                            });
                            window.logMessage(`Provisioned new student ${email} into ${targetGrade}${targetSection}`);
                            successCount++;
                            continue; // Move to next row since creation is handled
                        } catch (err) {
                            window.logMessage(`Failed to provision ${email}: ${err.message}`, true);
                            errorCount++;
                            continue;
                        }
                    } else {
                        window.logMessage(`Skipped ${email}: User not found in school and role != student.`, true);
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


window.deleteUser = async (userId, displayName) => {
    if(confirm(`Are you sure you want to permanently delete ${displayName}? This will only remove their Firestore profile. Firebase Auth deletion must be done manually.`)) {
        try {
            const { db } = await getInitializedClients();
            await deleteDoc(doc(db, "users", userId));
            if(window.logMessage) window.logMessage(`Deleted user profile for ${displayName}`);
            alert(`User profile deleted successfully.`);
        } catch(e) {
            console.error(e);
            alert("Failed to delete user profile: " + e.message);
        }
    }
};

window.resetUserPassword = async (email, displayName) => {
    if(confirm(`Send a password reset email to ${email} (${displayName})?`)) {
        try {
            const { auth } = await getInitializedClients();
            await sendPasswordResetEmail(auth, email);
            if(window.logMessage) window.logMessage(`Password reset email sent to ${email}`);
            alert(`Password reset email sent successfully to ${email}.`);
        } catch(e) {
            console.error(e);
            alert("Failed to send reset email: " + e.message);
        }
    }
};

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
                    <td class="p-4 text-xs font-bold text-slate-500">${(u.mapped_disciplines || [u.mapped_discipline]).filter(Boolean).join(', ') || 'Unassigned'}</td>
                    <td class="p-4 text-xs font-bold text-slate-500">${(u.sections || [u.mapped_section]).filter(Boolean).join(', ') || 'Unassigned'}</td>
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
                    <td class="p-4 text-right">                        <div class="flex gap-2 justify-end">
                            <button onclick="window.showEditModal('${u.id}', `${encodeURIComponent(JSON.stringify(u))}`)" class="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 px-2 py-1 rounded hover:bg-slate-200 font-bold transition">Edit</button>
                            <button onclick="window.resetUserPassword('${u.email}', '${u.displayName}')" class="text-[10px] bg-blue-50 border border-blue-200 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 font-bold transition">Reset Pwd</button>
                            <button onclick="window.deleteUser('${u.id}', '${u.displayName}')" class="text-[10px] bg-red-50 border border-red-200 text-red-600 px-2 py-1 rounded hover:bg-red-100 font-bold transition">Delete</button>
                            <span class="text-success-green font-bold text-xs"><i class="fas fa-check-circle"></i> Active</span>
                        </div></td>
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
