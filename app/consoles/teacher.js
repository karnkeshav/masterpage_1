// app/consoles/teacher.js
import { getInitializedClients } from "../../js/config.js";

import { bindConsoleLogout, guardConsole } from "../../js/guard.js";
import { loadCurriculum, getGradeFromURL, flattenSubject } from "../../js/curriculum/loader.js";
import { collection, query, where, onSnapshot, getDoc, getDocs, setDoc, addDoc, deleteDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import * as UI from "../../js/ui-renderer.js";

const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

// === GLOBAL STATE DECLARATIONS ===
let db;
let studentScores = [];

// App State
let currentUser = null;
let activeTab = 'curriculum';
let currentContext = { grade: 'Unassigned', section: 'Unassigned', discipline: 'Unassigned' };
let currentSubject = 'science';
let activeChapters = [];
let completedChapters = {};
let chapterListeners = [];

let heatmapTaughtDate = null;
let selectedChapterId = "";

// UI Event Handlers Exposure
window.switchTab = switchTab;
window.markChapterFinished = markChapterFinished;
window.revokeChapterFinished = revokeChapterFinished;

window.showStudentDetail = (uid) => {
    const name = window.sectionStudents?.names[uid] || uid;
    const scores = studentScores.filter(s =>
        s.user_id === uid && (s.topicSlug === selectedChapterId || s.topic === selectedChapterId || s.chapter === selectedChapterId)
    );

    let detailHtml = '';
    if (scores.length === 0) {
        detailHtml = `<div class="p-6 text-center text-slate-400"><p class="font-bold">No scores yet</p><p class="text-xs mt-1">This student hasn't attempted this chapter.</p></div>`;
    } else {
        detailHtml = scores.map((s, i) => `
            <div class="p-4 border-b border-slate-100">
                <div class="flex justify-between items-center">
                    <span class="text-xs font-bold text-slate-400">Attempt ${i + 1}</span>
                    <span class="font-black text-slate-800">${s.score ?? s.percentage ?? 'N/A'}%</span>
                </div>
            </div>
        `).join('');
    }

    const sidebar = document.querySelector('#tab-viewport .w-80');
    if (sidebar) {
        sidebar.innerHTML = `
            <div class="p-4 border-b border-slate-200 bg-slate-50">
                <h3 class="font-black text-slate-800 text-sm">${esc(name)}</h3>
                <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">${scores.length} attempt(s)</p>
            </div>
            <div class="flex-1 overflow-y-auto">${detailHtml}</div>
        `;
    }
};




function filterSectionsForGrade(grade) {
    const allSections = window.teacherProfile?.sections || (window.teacherProfile?.mapped_section ? [`${window.teacherProfile?.mapped_grade || 'Unassigned'}${window.teacherProfile.mapped_section}`] : []);
    const filtered = allSections.filter(s => s.replace(/[A-Z]/g, '') === grade);
    const sectionSelect = document.getElementById('section-select');
    sectionSelect.innerHTML = filtered.map(s =>
        `<option value="${s}" class="text-slate-800">${s}</option>`
    ).join('');
    if (filtered.length > 0) {
        currentContext.section = filtered[0];
    } else {
        currentContext.section = 'Unassigned';
        sectionSelect.innerHTML = `<option value="Unassigned" class="text-slate-800">Unassigned</option>`;
    }
}


async function fetchSectionStudents() {
    if (!db) return;
    const constraints = [
        where("section_id", "==", getSectionId()),
        where("role", "==", "student"),
        where("school_id", "==", window.teacherProfile?.school_id || '')
    ];

    const studentsQuery = query(collection(db, "users"), ...constraints);
    const studentsSnap = await getDocs(studentsQuery);
    const studentUids = studentsSnap.docs.map(d => d.id);
    const studentNames = {};
    const studentParentIds = {};
    studentsSnap.docs.forEach(d => {
        const data = d.data();
        studentNames[d.id] = data.displayName || data.email || d.id;
        studentParentIds[d.id] = data.parent_id || null;
    });
    window.sectionStudents = { uids: studentUids, names: studentNames, parentIds: studentParentIds };

    studentScores = [];
    for (let i = 0; i < studentUids.length; i += 10) {
        const batch = studentUids.slice(i, i + 10);
        if (batch.length === 0) continue;
        const scoresQuery = query(collection(db, "quiz_scores"), where("user_id", "in", batch), where("school_id", "==", window.teacherProfile?.school_id || ''));
        const scoresSnap = await getDocs(scoresQuery);
        scoresSnap.docs.forEach(d => studentScores.push({ id: d.id, ...d.data() }));
    }
}

function getSectionId() {
    const letter = currentContext.section.replace(/^\d+/, '');
    return `${currentContext.grade}-${letter}`;
}

// Initialize Application
async function init(user) {
    currentUser = user;
    document.getElementById('user-welcome').innerText = user?.displayName || "Teacher";
    window.teacherProfile = user;

    // Populate dropdowns from teacher profile
    const sections = user?.sections || (user?.mapped_section ? [`${user?.mapped_grade || 'Unassigned'}${user.mapped_section}`] : []);
    const disciplines = user?.mapped_disciplines || (user?.mapped_discipline ? [user.mapped_discipline] : []);

    const sectionSelect = document.getElementById('section-select');
    sectionSelect.innerHTML = sections.map(s => `<option value="${s}" class="text-slate-800">${s}</option>`).join('');

    const discSelect = document.getElementById('discipline-select');
    discSelect.innerHTML = disciplines.map(d => `<option value="${d}" class="text-slate-800">${d}</option>`).join('');

    // Derive grades from sections (e.g., "9A" -> "9")
    const grades = [...new Set(sections.map(s => s.replace(/[A-Z]/g, '')))];
    const gradeSelect = document.getElementById('grade-select');
    gradeSelect.innerHTML = grades.map(g => `<option value="${g}" class="text-slate-800">${g}th</option>`).join('');

    // Set initial context
    currentContext.grade = document.getElementById('grade-select').value || grades[0] || 'Unassigned';
    currentContext.section = document.getElementById('section-select').value || sections[0] || 'Unassigned';
    currentContext.discipline = document.getElementById('discipline-select').value || disciplines[0] || 'Unassigned';

    document.getElementById('header-class').innerText = `${currentContext.grade}-${currentContext.section}`;
    document.getElementById('header-discipline').innerText = currentContext.discipline;


    const viewport = document.getElementById('tab-viewport');
    UI.showSkeleton(viewport, 3);

    try {
        // Step A: Await clients
        const clients = await getInitializedClients();
        db = clients?.db;

        // Step B: Error if DB missing
        if (!db) {
            throw new Error("Firestore Connection Failed");
        }

        // Step C: Load dependencies
        const grade = document.getElementById('grade-select').value;
        currentContext.grade = grade;
        const curriculumData = await loadCurriculum(grade);

        filterSectionsForGrade(currentContext.grade);
        await fetchSectionStudents();

        // Configure Context
        updateActiveChapters(curriculumData);
       
        attachFirebaseListeners();

        // Render Default View
        renderTab();

    } catch (error) {
        console.error("Critical Init Error:", error);
        viewport.innerHTML = `
            <div class="bg-white p-8 rounded-3xl border border-danger-red/20 shadow-lg text-center flex flex-col items-center justify-center min-h-[400px]">
                <div class="w-16 h-16 bg-red-50 text-danger-red rounded-full mb-4 flex items-center justify-center text-3xl shadow-inner">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h2 class="text-2xl font-black text-slate-800">System Initialization Failed</h2>
                <p class="text-slate-500 mt-2 font-medium max-w-md">${esc(error.message)}</p>
                <button onclick="window.retryHandshake()" class="mt-6 bg-danger-red text-white px-6 py-3 rounded-xl font-bold shadow-md hover:bg-red-700 transition flex items-center gap-2">
                    <i class="fas fa-sync-alt"></i> Retry Handshake
                </button>
            </div>
        `;
    }
}

window.retryHandshake = () => {
    init(currentUser);
};

function updateActiveChapters(curriculumData) {
    if (!curriculumData) {
        activeChapters = [];
        selectedChapterId = null;
        return;
    }

    const disc = currentContext.discipline;
    let chaps = [];

    for (const [subjectKey, subjectValue] of Object.entries(curriculumData)) {
        if (Array.isArray(subjectValue)) {
            if (subjectKey === disc) {
                chaps = flattenSubject(subjectValue);
                currentSubject = subjectKey.toLowerCase().replace(/\s+/g, '_');
                break;
            }
        } else if (subjectValue && typeof subjectValue === 'object') {
            if (subjectKey === disc) {
                chaps = flattenSubject(subjectValue);
                currentSubject = subjectKey.toLowerCase().replace(/\s+/g, '_');
                break;
            }
            // Exact match first
            if (subjectValue[disc]) {
                chaps = flattenSubject(subjectValue[disc]);
                currentSubject = subjectKey.toLowerCase().replace(/\s+/g, '_');
                break;
            }
            // Fuzzy match: find a sub-key that contains the discipline name
            const matchingKey = Object.keys(subjectValue).find(k =>
                k.toLowerCase().includes(disc.toLowerCase()) ||
                disc.toLowerCase().includes(k.toLowerCase())
            );
            if (matchingKey) {
                chaps = flattenSubject(subjectValue[matchingKey]);
                currentSubject = subjectKey.toLowerCase().replace(/\s+/g, '_');
                break;
            }
        }
    }

    activeChapters = chaps.map(c => ({
        id: c.chapter_title.toLowerCase().replace(/[^a-z0-9\-]/g, '-').replace(/(^-|-$)/g, ''),
        title: c.chapter_title
    }));

    if (activeChapters.length > 0) {
        selectedChapterId = activeChapters[0].id;
    } else {
        selectedChapterId = null;
    }
}

const getControlDocId = (slug) => {
    return {
        newId: `${currentContext.grade}_${currentContext.section}_${currentSubject}_${currentContext.discipline.toLowerCase()}_${slug}`,
        oldId: `${currentContext.grade}_${currentContext.section}_science_${currentContext.discipline.toLowerCase()}_${slug}`
    };
};
function attachFirebaseListeners() {
    if(!db) return;
    // Clear existing listeners
    chapterListeners.forEach(unsub => unsub());
    chapterListeners = [];

    // Re-attach listeners for current chapters
    activeChapters.forEach(chap => {
        const ids = getControlDocId(chap.id);
        // FIX: 14 — avoid nested onSnapshot; use getDoc to pick the right ID first
        getDoc(doc(db, "chapter_control", ids.newId)).then(probe => {
            const targetId = probe.exists() ? ids.newId : ids.oldId;
            const unsub = onSnapshot(
                doc(db, "chapter_control", targetId),
                (snap) => {
                    if (snap.exists()) {
                        completedChapters[chap.id] = snap.data().taught_date;
                        updateHeatmapAndCurriculum(chap.id, snap.data().taught_date);
                    } else {
                        completedChapters[chap.id] = null;
                        updateHeatmapAndCurriculum(chap.id, null);
                    }
                },
                (error) => {
                    console.error(`Listener error for chapter ${chap.id}:`, error);
                    completedChapters[chap.id] = null;
                    updateHeatmapAndCurriculum(chap.id, null);
                }
            );
            chapterListeners.push(unsub);
        });
    });

    function updateHeatmapAndCurriculum(chapId, taughtDate) {
        if(activeTab === 'curriculum') renderCurriculumHub();
        if (chapId === selectedChapterId) {
            heatmapTaughtDate = taughtDate;
            if(activeTab === 'analytics') renderSectionHeatmap();
        }
    }
}

async function markChapterFinished(chapterId) {
    if (!db) return;
    const docId = getControlDocId(chapterId).newId; // Always write to new schema
    const chapterTitle = activeChapters.find(c => c.id === chapterId)?.title || chapterId;

    try {
        // 1. Write chapter_control (include school_id!)
        await setDoc(doc(db, "chapter_control", docId), {
            chapter_slug: chapterId,
            chapter_title: chapterTitle,
            grade: currentContext.grade,
            section: currentContext.section,
            discipline: currentContext.discipline,
            school_id: window.teacherProfile?.school_id || '',
            taught_date: serverTimestamp(),
            status: 'finished',
            teacher_uid: currentUser?.uid || ''
        });

        // 2. Create student_notifications for each student in the section
        const constraints = [
            where("section_id", "==", getSectionId()),
            where("role", "==", "student"),
            where("school_id", "==", window.teacherProfile?.school_id || '')
        ];

        const studentsQuery = query(collection(db, "users"), ...constraints);
        const studentsSnap = await getDocs(studentsQuery);

        const notifPromises = [];
        studentsSnap.docs.forEach(studentDoc => {
            const studentData = studentDoc.data();
            notifPromises.push(addDoc(collection(db, "student_notifications"), {
                student_id: studentDoc.id,
                parent_id: studentData.parent_id || null,
                type: "TEST_ASSIGNED",
                topicSlug: chapterId,
                chapter_title: chapterTitle,
                discipline: currentContext.discipline,
                grade: currentContext.grade,
                section: currentContext.section,
                text: `Your teacher has completed "${chapterTitle}" in class. Please take the Simple test as early as possible.`,
                sender_name: currentUser?.displayName || "Teacher",
                priority: "teacher",
                timestamp: serverTimestamp(),
                school_id: window.teacherProfile?.school_id || ''
            }));
        });

        await Promise.all(notifPromises);
        console.log(`Notifications sent to ${studentsSnap.size} students for ${chapterTitle}`);

    } catch (error) {
        console.warn("Handshake trigger failed", error);
        alert("Failed to mark chapter: " + error.message);
    }
}

async function revokeChapterFinished(chapterId) {
    if (!db) return;
    const chapterTitle = activeChapters.find(c => c.id === chapterId)?.title || chapterId;

    const confirmed = confirm(
        `REVOKE "${chapterTitle}"?\n\n` +
        `This will:\n` +
        `1. Remove the "finished" status for this chapter\n` +
        `2. Delete all student & parent notifications for this chapter\n\n` +
        `Are you sure?`
    );
    if (!confirmed) return;

    try {
        // 1. Delete chapter_control document (try both new and old ID formats)
        const ids = getControlDocId(chapterId);
        const newDocRef = doc(db, "chapter_control", ids.newId);
        const oldDocRef = doc(db, "chapter_control", ids.oldId);

        const newSnap = await getDoc(newDocRef);
        if (newSnap.exists()) {
            await deleteDoc(newDocRef);
        }
        const oldSnap = await getDoc(oldDocRef);
        if (oldSnap.exists()) {
            await deleteDoc(oldDocRef);
        }

        // 2. Delete all student_notifications for this chapter in this section
        const notifQuery = query(
            collection(db, "student_notifications"),
            where("topicSlug", "==", chapterId),
            where("discipline", "==", currentContext.discipline),
            where("grade", "==", currentContext.grade),
            where("section", "==", currentContext.section),
            where("school_id", "==", window.teacherProfile?.school_id || '')
        );
        const notifSnap = await getDocs(notifQuery);
        const deletePromises = notifSnap.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deletePromises);

        console.log(`Revoked "${chapterTitle}": chapter_control deleted, ${notifSnap.size} notifications removed.`);

    } catch (error) {
        console.error("Revoke failed:", error);
        alert("Failed to revoke chapter: " + error.message);
    }
}

function switchTab(tabId) {
    activeTab = tabId;

    // Update Sidebar buttons
    ['curriculum', 'analytics', 'remedial', 'roster'].forEach(t => {
        const btn = document.getElementById(`tab-btn-${t}`);
        if(t === tabId) {
            btn.className = "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all text-sm shadow-sm bg-cbse-blue text-white shadow-blue-900/20";
            btn.querySelector('i').classList.add('text-accent-gold');
        } else {
            btn.className = "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all text-sm shadow-sm text-slate-500 hover:bg-slate-50 border border-transparent hover:border-slate-200";
            btn.querySelector('i').classList.remove('text-accent-gold');
        }
    });

    renderTab();
}

function renderTab() {
    if (activeTab === 'curriculum') renderCurriculumHub();
    else if (activeTab === 'analytics') renderSectionHeatmap();
    else if (activeTab === 'remedial') renderRemedialQueue();
    else if (activeTab === 'roster') renderRoster();
}

// === RENDERING FUNCTIONS ===

function renderCurriculumHub() {
    let chaptersHtml = '';

    if (activeChapters.length === 0) {
        chaptersHtml = `<div class="col-span-full py-12 text-center text-slate-400 italic font-bold">No NCERT chapters defined for this syllabus.</div>`;
    } else {
        activeChapters.forEach((chap, idx) => {
            const isFinished = !!completedChapters[chap.id];
            let dateStr = "";
            if (isFinished && completedChapters[chap.id] && completedChapters[chap.id].toDate) {
                dateStr = completedChapters[chap.id].toDate().toLocaleDateString();
            }

            chaptersHtml += `
                <div class="p-5 rounded-2xl border-2 transition-all ${isFinished ? 'border-success-green bg-green-50/30' : 'border-slate-100 bg-white hover:border-blue-100'}">
                    <div class="flex justify-between items-start">
                        <div>
                            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Chapter ${idx + 1}</span>
                            <h3 class="font-bold text-slate-800 text-lg leading-snug mt-1">${chap.title}</h3>
                        </div>
                        ${isFinished ? `
                            <span class="bg-success-green text-white text-[9px] font-black uppercase px-2 py-1 rounded tracking-widest shadow-sm flex items-center gap-1 animate-pulse">
                                <i class="fas fa-satellite-dish"></i> Mandatory Sync Active ${dateStr}
                            </span>
                        ` : ''}
                    </div>
                    <div class="mt-6 flex justify-between items-center">
                        <div class="text-xs text-slate-500 font-medium">
                            ${isFinished ? "Mandatory handshake initiated." : "Pending commencement."}
                        </div>
                        ${!isFinished ? `
                            <button onclick="window.markChapterFinished('${chap.id}')" class="bg-cbse-blue text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md hover:bg-blue-800 hover:shadow-lg transition active:scale-95 flex items-center gap-2">
                                <i class="fas fa-flag-checkered"></i> [Mark as Finished]
                            </button>
                        ` : `
                            <div class="flex items-center gap-2">
                                <span class="text-xs text-success-green font-bold flex items-center gap-1"><i class="fas fa-check-circle"></i> Triggered</span>
                                <button onclick="window.revokeChapterFinished('${chap.id}')" class="bg-red-500 text-white px-3 py-1.5 rounded-xl text-[10px] font-bold shadow-sm hover:bg-red-700 transition active:scale-95 flex items-center gap-1">
                                    <i class="fas fa-undo"></i> Revoke
                                </button>
                            </div>
                        `}
                    </div>
                </div>
            `;
        });
    }

    document.getElementById('tab-viewport').innerHTML = `
        <div class="space-y-4">
            <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                <div class="flex justify-between items-center mb-6">
                    <div>
                        <h2 class="text-xl font-black text-slate-800">Curriculum Handshake Hub</h2>
                        <p class="text-sm text-slate-500">Initiate global authoritative triggers for ${currentContext.discipline}.</p>
                    </div>
                    <div class="w-12 h-12 bg-blue-50 text-cbse-blue flex items-center justify-center rounded-2xl text-xl">
                        <i class="fas fa-book-open"></i>
                    </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    ${chaptersHtml}
                </div>
            </div>
        </div>
    `;
}

window.handleSelectChapter = (e) => {
    selectedChapterId = e.target.value;
    // Update the heatmap taught date logic if possible immediately
    if(completedChapters[selectedChapterId] !== undefined) {
         heatmapTaughtDate = completedChapters[selectedChapterId];
    } else {
         heatmapTaughtDate = null;
    }
    renderTab();
};

function renderSectionHeatmap() {
    let optionsHtml = activeChapters.map(c => `<option value="${c.id}" ${c.id === selectedChapterId ? 'selected' : ''}>${esc(c.title)}</option>`).join('');

    const students = window.sectionStudents || { uids: [], names: {} };
    const studentCount = students.uids.length;
    let gridHtml = '';

    if (studentCount === 0) {
        gridHtml = '<div class="col-span-full text-center text-slate-400 italic font-bold py-8">No students found in this section.</div>';
    } else {
        students.uids.forEach((uid, i) => {
            const hasScore = studentScores.some(s =>
                s.user_id === uid && (s.topicSlug === selectedChapterId || s.topic === selectedChapterId || s.chapter === selectedChapterId)
            );
            const colorClass = hasScore
                ? 'bg-success-green shadow-[0_0_12px_rgba(5,150,105,0.4)] border border-green-400 text-white'
                : 'bg-slate-200 border border-slate-300 text-slate-500';
            const name = students.names[uid] || `Student ${i + 1}`;

            gridHtml += `
                <button title="${esc(name)}" onclick="window.showStudentDetail('${uid}')"
                    class="w-full aspect-square rounded-xl transition-all duration-300 transform hover:-translate-y-1 hover:scale-110 flex items-center justify-center font-black text-xs ${colorClass}">
                    ${i + 1}
                </button>
            `;
        });
    }
    const cols = Math.max(1, Math.min(10, Math.ceil(Math.sqrt(studentCount))));

    let syncText = heatmapTaughtDate && heatmapTaughtDate.toDate ? `Sync Activated: ${heatmapTaughtDate.toDate().toLocaleDateString()}` : "Sync Not Activated";

    let sidebarHtml = '';
    if (!heatmapTaughtDate) {
        sidebarHtml = `
            <div class="flex-1 flex items-center justify-center p-6 text-center">
                <div>
                    <div class="w-16 h-16 mx-auto bg-slate-100 text-slate-400 rounded-full flex items-center justify-center text-2xl mb-4 shadow-inner">
                        <i class="fas fa-handshake-slash"></i>
                    </div>
                    <h3 class="text-lg font-black text-slate-800">Waiting for Teacher Handshake</h3>
                    <p class="text-xs text-slate-500 mt-2">Initialize the curriculum sync in the Handshake Hub to activate live analytics.</p>
                </div>
            </div>
        `;
    } else {
        sidebarHtml = `
            <div class="flex-1 flex items-center justify-center p-6 text-center text-slate-400">
                <i class="fas fa-mouse-pointer text-2xl mb-2"></i><br>
                Select a student
            </div>
        `;
    }

    document.getElementById('tab-viewport').innerHTML = `
        <div class="flex gap-6 h-[calc(100vh-200px)]">
            <div class="flex-1 bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col items-center justify-center relative overflow-hidden">

                <div class="absolute top-6 left-6 flex items-center gap-4">
                    <div class="w-10 h-10 bg-slate-100 text-slate-800 flex items-center justify-center rounded-xl text-lg shadow-sm">
                        <i class="fas fa-th-large"></i>
                    </div>
                    <div>
                        <h2 class="text-xl font-black text-slate-800">Section Heatmap</h2>
                        <p class="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">${studentCount}-Student Grid</p>
                    </div>
                </div>

                <div class="absolute top-6 right-6">
                    <select onchange="window.handleSelectChapter(event)" class="bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm font-bold px-4 py-2 outline-none focus:ring-2 focus:ring-cbse-blue cursor-pointer shadow-sm">
                        ${optionsHtml}
                    </select>
                </div>

                <div class="w-full max-w-4xl mt-16 mb-6 flex justify-between items-center px-4">
                    <div class="flex gap-4 text-xs font-bold text-slate-600 bg-slate-50 px-4 py-2 rounded-lg border border-slate-100">
                        <div class="flex items-center gap-2"><span class="w-3 h-3 rounded bg-success-green"></span> Score Exists</div>
                        <div class="flex items-center gap-2"><span class="w-3 h-3 rounded bg-slate-200"></span> Empty</div>
                    </div>
                    <div class="text-xs font-bold uppercase tracking-widest text-slate-400">
                        ${syncText}
                    </div>
                </div>

                <div class="grid gap-3 w-full max-w-4xl mx-auto p-4 bg-slate-50/50 rounded-2xl border border-slate-100 shadow-inner" style="grid-template-columns: repeat(${cols}, 1fr);">
                    ${gridHtml}
                </div>

            </div>

            <div class="w-80 bg-white border border-slate-200 rounded-3xl shadow-lg flex flex-col overflow-hidden">
                ${sidebarHtml}
            </div>
        </div>
    `;
}


window.nudgeParent = async (uid) => {
    const students = window.sectionStudents || { uids: [], names: {}, parentIds: {} };
    const parentId = students.parentIds[uid];
    if (!parentId) return;

    const studentName = students.names[uid] || uid;
    const chapter = activeChapters.find(c => c.id === selectedChapterId)?.title || selectedChapterId;

    try {
        await addDoc(collection(db, "messages"), {
            type: "NUDGE",
            target_role: "parent",
            target_uid: [parentId],
            content: `Hi, your child ${studentName} hasn't attempted the ${chapter} quiz yet. Please encourage them to practice.`,
            timestamp: serverTimestamp(),
            school_id: window.teacherProfile?.school_id || ''
        });
        alert('Nudge sent to parent successfully.');
    } catch (error) {
        console.error("Error sending nudge", error);
        alert("Failed to send nudge: " + error.message);
    }
};

function renderRoster() {
    let optionsHtml = activeChapters.map(c => `<option value="${c.id}" ${c.id === selectedChapterId ? 'selected' : ''}>${esc(c.title)}</option>`).join('');

    const students = window.sectionStudents || { uids: [], names: {}, parentIds: {} };
    const studentCount = students.uids.length;

    let rosterHtml = '';
    if (studentCount === 0) {
        rosterHtml = `<tr><td colSpan="3" class="p-8 text-center text-slate-400 italic font-medium">No students found in this section.</td></tr>`;
    } else {
        students.uids.forEach(uid => {
            const hasScore = studentScores.some(s =>
                s.user_id === uid && (s.topicSlug === selectedChapterId || s.topic === selectedChapterId || s.chapter === selectedChapterId)
            );
            const name = students.names[uid] || uid;
            const parentId = students.parentIds[uid];

            let connectivityHtml = '';
            if (!hasScore) {
                if (parentId) {
                    connectivityHtml = `<button onclick="window.nudgeParent('${uid}')" class="bg-cbse-blue text-white px-3 py-1 rounded-lg text-xs font-bold shadow-sm hover:bg-blue-800 transition active:scale-95">Nudge Parent</button>`;
                } else {
                    connectivityHtml = `
                        <div class="flex items-center gap-2">
                            <span class="bg-warning-yellow/10 text-warning-yellow px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest border border-warning-yellow/20">Unlinked</span>
                            <button class="bg-slate-200 text-slate-600 px-3 py-1 rounded-lg text-xs font-bold shadow-sm hover:bg-slate-300 transition active:scale-95">Prompt Student</button>
                        </div>
                    `;
                }
            } else {
                connectivityHtml = `<span class="text-success-green font-bold text-xs"><i class="fas fa-check"></i> Attempted</span>`;
            }

            rosterHtml += `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100 last:border-0">
                    <td class="p-4 font-bold text-slate-800">${esc(name)}</td>
                    <td class="p-4 text-center font-bold text-slate-500">${currentContext.section}</td>
                    <td class="p-4 text-right">${connectivityHtml}</td>
                </tr>
            `;
        });
    }

    document.getElementById('tab-viewport').innerHTML = `
        <div class="space-y-6">
            <div class="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                <div>
                    <h2 class="text-xl font-black text-slate-800">Section Performance (Roster)</h2>
                    <p class="text-sm text-slate-500">View roster and connectivity status for ${currentContext.grade}-${currentContext.section}.</p>
                </div>
                <select onchange="window.handleSelectChapter(event)" class="bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm font-bold px-4 py-2 outline-none focus:ring-2 focus:ring-cbse-blue cursor-pointer shadow-sm">
                    ${optionsHtml}
                </select>
            </div>

            <div class="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-sm">
                        <thead class="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-100">
                            <tr>
                                <th class="p-4">Student</th>
                                <th class="p-4 text-center">Class / Sec</th>
                                <th class="p-4 text-right">Parent Connectivity</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-50">
                            ${rosterHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function calculateRemedialQueue() {
    const students = window.sectionStudents || { uids: [], names: {} };

    if (students.uids.length === 0 || studentScores.length === 0) {
        return { B: 0, strugglers: [], top10: [] };
    }

    // Group scores by student for the selected chapter
    const studentMap = {};
    studentScores.forEach(s => {
        const matchesChapter = (s.topicSlug === selectedChapterId || s.topic === selectedChapterId || s.chapter === selectedChapterId);
        if (!matchesChapter) return;

        const uid = s.user_id;
        if (!studentMap[uid]) {
            studentMap[uid] = {
                id: uid,
                name: students.names[uid] || uid,
                section: currentContext.section,
                attempts: 0,
                totalScore: 0
            };
        }
        studentMap[uid].attempts++;
        studentMap[uid].totalScore += (s.score ?? s.percentage ?? 0);
    });

    const realStudents = Object.values(studentMap).map(s => ({
        ...s,
        score: s.attempts > 0 ? Math.round(s.totalScore / s.attempts) : 0
    }));

    if (realStudents.length === 0) {
        return { B: 0, strugglers: [], top10: [] };
    }

    // Calculate Benchmark (B) at P70
    const sortedAttempts = realStudents.map(s => s.attempts).sort((a, b) => a - b);
    const p70Index = Math.min(Math.floor(realStudents.length * 0.70), sortedAttempts.length - 1);
    const B = sortedAttempts[p70Index] ?? 1;

    // Filter Strugglers (B+1)
    const strugglers = realStudents
        .filter(s => s.attempts > B)
        .sort((a, b) => a.score - b.score)
        .slice(0, 20);

    const top10 = [...realStudents]
        .sort((a, b) => b.score - a.score || a.attempts - b.attempts)
        .slice(0, 10);

    return { B, strugglers, top10 };
}

function renderRemedialQueue() {
    let optionsHtml = activeChapters.map(c => `<option value="${c.id}" ${c.id === selectedChapterId ? 'selected' : ''}>${esc(c.title)}</option>`).join('');

    const { B, strugglers, top10 } = calculateRemedialQueue();

    let strugglersHtml = '';
    if (strugglers.length > 0) {
        strugglers.forEach(s => {
            const BPlusN = `B+${s.attempts - B}`;
            strugglersHtml += `
                <tr class="hover:bg-red-50/30 transition group">
                    <td class="p-4 font-bold text-slate-800 flex items-center gap-3">
                        <span class="w-2 h-2 rounded-full bg-danger-red block animate-pulse"></span>
                        ${esc(s.name)}
                    </td>
                    <td class="p-4 text-center font-bold text-slate-500">${s.section}</td>
                    <td class="p-4 text-center">
                        <div class="inline-block px-2 py-1 bg-red-100 text-danger-red rounded text-xs font-black border border-red-200">
                            ${s.attempts} (${BPlusN})
                        </div>
                    </td>
                    <td class="p-4 text-right font-black text-slate-700">${s.score}%</td>
                </tr>
            `;
        });
    } else {
        strugglersHtml = `<tr><td colSpan="4" class="p-8 text-center text-slate-400 italic font-medium">No students currently in the remedial loop.</td></tr>`;
    }

    let top10Html = top10.map((s, idx) => `
        <li class="p-4 flex justify-between items-center hover:bg-white/5 transition border-b border-white/5 last:border-0">
            <div class="flex items-center gap-3">
                <div class="w-6 text-center text-blue-300 font-black text-sm">#${idx + 1}</div>
                <div>
                    <div class="font-bold text-white text-sm">${esc(s.name)}</div>
                    <div class="text-[10px] text-blue-300 font-bold tracking-widest uppercase mt-0.5">${s.section} • ${s.attempts} Attempt(s)</div>
                </div>
            </div>
            <div class="font-black text-accent-gold text-lg">${s.score}%</div>
        </li>
    `).join('');

    const isSync = !!completedChapters[selectedChapterId];

    document.getElementById('tab-viewport').innerHTML = `
        <div class="space-y-6">
            <div class="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                <div>
                    <h2 class="text-xl font-black text-slate-800">Dynamic Benchmarking & Remedial Queue</h2>
                    <p class="text-sm text-slate-500">Processing ${window.sectionStudents?.uids?.length || 0} students in ${currentContext.grade}-${currentContext.section}.</p>
                </div>
                <select onchange="window.handleSelectChapter(event)" class="bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm font-bold px-4 py-2 outline-none focus:ring-2 focus:ring-cbse-blue cursor-pointer shadow-sm">
                    ${optionsHtml}
                </select>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="lg:col-span-2 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                    <div class="bg-danger-red p-6 text-white flex justify-between items-center">
                        <div>
                            <h3 class="text-lg font-black flex items-center gap-2">
                                <i class="fas fa-ambulance"></i> Remedial Attention List
                            </h3>
                            <p class="text-xs font-medium text-red-100 mt-1 opacity-90">
                                Bottom Strugglers (breached the <i>B+1</i> threshold).
                            </p>
                        </div>
                        <div class="text-right">
                            <div class="text-3xl font-black">${B}</div>
                            <div class="text-[9px] uppercase tracking-widest font-bold opacity-80">Current Benchmark (B)</div>
                        </div>
                    </div>
                    <div class="p-0 overflow-y-auto max-h-[500px]">
                        <table class="w-full text-left text-sm">
                            <thead class="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400 font-bold sticky top-0 border-b border-slate-100 shadow-sm z-10">
                                <tr>
                                    <th class="p-4">Student</th>
                                    <th class="p-4 text-center">Class / Sec</th>
                                    <th class="p-4 text-center">Attempts</th>
                                    <th class="p-4 text-right">Avg Score</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-50">
                                ${strugglersHtml}
                            </tbody>
                        </table>
                    </div>
                    ${isSync ? '<span class="text-green-600 animate-pulse text-xl">📡</span>' : ''}
                </div>
                <div class="bg-cbse-blue rounded-3xl shadow-sm border border-blue-900 overflow-hidden flex flex-col">
                    <div class="p-6 border-b border-white/10 relative overflow-hidden">
                        <div class="absolute -right-4 -top-4 text-white/10 text-6xl transform rotate-12"><i class="fas fa-trophy"></i></div>
                        <h3 class="text-lg font-black text-accent-gold relative z-10">Top 10 Advanced Finishers</h3>
                        <p class="text-xs font-medium text-blue-200 mt-1 relative z-10">Advanced Phase (Grade ${currentContext.grade})</p>
                    </div>
                    <div class="flex-1 overflow-y-auto max-h-[500px]">
                        <ul class="divide-y divide-white/5">
                            ${top10Html}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// === EVENT LISTENERS ===

document.getElementById('grade-select').addEventListener('change', async (e) => {
    currentContext.grade = e.target.value;
    filterSectionsForGrade(currentContext.grade);
    document.getElementById('header-class').innerText = `${currentContext.grade}-${currentContext.section}`;
    const curr = await loadCurriculum(currentContext.grade);
    updateActiveChapters(curr);
    await fetchSectionStudents();
    attachFirebaseListeners();
    renderTab();
});

document.getElementById('section-select').addEventListener('change', async (e) => {
    currentContext.section = e.target.value;
    document.getElementById('header-class').innerText = `${currentContext.grade}-${currentContext.section}`;
    await fetchSectionStudents();
    attachFirebaseListeners();
    renderTab();
});

document.getElementById('discipline-select').addEventListener('change', async (e) => {
    currentContext.discipline = e.target.value;
    document.getElementById('header-discipline').innerText = currentContext.discipline;
    const curr = await loadCurriculum(currentContext.grade);
    updateActiveChapters(curr);
    attachFirebaseListeners();
    renderTab();
});

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
    window.loadConsoleData = (profile) => init(profile);
    guardConsole("teacher");
    bindConsoleLogout("logout-nav-btn", "../../index.html");
});
