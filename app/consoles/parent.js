// app/consoles/parent.js
import { guardConsole, bindConsoleLogout } from "../../js/guard.js";
import { getInitializedClients } from "../../js/config.js";
import { collection, query, where, getDocs, orderBy, doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// LOGOUT LOGIC — use standard bindConsoleLogout for uniformity
bindConsoleLogout("logout-nav-btn", "../../index.html");

// GLOBAL GUARD
guardConsole("parent");

window.loadConsoleData = async (profile) => {
    console.log("Loading Parent Console for:", profile.uid);
    const welcomeEl = document.getElementById("user-welcome");
    if (welcomeEl) {
        welcomeEl.textContent = profile.displayName || "Guardian";
    }

    const overallAvg = await fetchChildData(profile);
    renderGrowthChart(overallAvg);
    listenToIntercom();
    
};

async function listenToIntercom() {
    const { auth, db } = await getInitializedClients();
    const feed = document.getElementById('intercom-feed');
    if (!feed || !auth.currentUser) return;

    const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
    if (!userSnap.exists()) return;
    const profile = userSnap.data();

    const schoolId = profile.school_id;
    if(!schoolId) return;

    // Try to find the linked student or fallback to prompt requirement.
    let targetGrade = "9";
    let targetSection = "A";

    try {
        if(profile.linked_children && profile.linked_children.length > 0) {
            const linkedUid = profile.linked_children[0];
            const linkedSnap = await getDoc(doc(db, "users", linkedUid));
            if(linkedSnap.exists()) {
                const linkedData = linkedSnap.data();
                if(linkedData.classId) targetGrade = linkedData.classId;
                if(linkedData.section) targetSection = linkedData.section;
            }
        }
    } catch (e) {
        console.warn("Could not query child profile for intercom.", e);
    }

    const q = query(
        collection(db, "messages"),
        where("school_id", "==", schoolId)
    );
onSnapshot(q, (snapshot) => {  
    feed.innerHTML = "";  
    const badge = document.getElementById("parent-inbox-badge");  
  
    // Read the priority count already set by renderSyncWallAndInbox  
    const priorityCount = badge ? (parseInt(badge.textContent) || 0) : 0;  
    let intercomCount = 0;  
  
    const docs = [];  
    snapshot.forEach(doc => docs.push(doc));  
    docs.sort((a, b) => {  
        const ta = a.data().timestamp ? a.data().timestamp.toMillis() : 0;  
        const tb = b.data().timestamp ? b.data().timestamp.toMillis() : 0;  
        return tb - ta;  
    });  
  
    docs.forEach(doc => {  
        const data = doc.data();  
        if (data.target_grade === targetGrade && data.target_section === targetSection) {  
            const date = data.timestamp?.toDate ? data.timestamp.toDate().toLocaleString() : 'Just now';  
            const toast = document.createElement('div');  
            toast.className = 'bg-blue-50 border-l-4 border-blue-500 p-3 rounded shadow-sm text-xs relative';  
            toast.innerHTML = `  
                <div class="flex justify-between items-start mb-1">  
                    <span class="font-bold text-blue-700 uppercase tracking-widest text-[9px]">${data.sender || 'Admin'}</span>  
                    <span class="text-[9px] text-slate-400 font-bold">${date}</span>  
                </div>  
                <p class="text-slate-700 font-medium">${data.text}</p>  
            `;  
            feed.appendChild(toast);  
            intercomCount++;  
        }  
    });  
  
    // Merge: priority inbox count + intercom message count  
    const totalCount = priorityCount + intercomCount;  
    if (badge) {  
        badge.textContent = totalCount;  
        if (totalCount > 0) badge.classList.remove("hidden");  
        else badge.classList.add("hidden");  
    }  
}, (error) => {  
    console.warn("Parent intercom listener error:", error.message);  

});
}
async function fetchChildData(parentProfile) {
    try {
        const { db } = await getInitializedClients();
        const parentUid = parentProfile.uid;

        let targetUid = null;
        let childName = "Student";

        // Step 1: Use linked_children from parent profile
        if (parentProfile.linked_children && parentProfile.linked_children.length > 0) {
            targetUid = parentProfile.linked_children[0]; // First linked child
            // Fetch child's display name using direct document read (document ID = UID)
            try {
                const childSnap = await getDoc(doc(db, "users", targetUid));
                if (childSnap.exists()) {
                    const childData = childSnap.data();
                    childName = childData.displayName || "Student";
                }
            } catch (e) {
                console.warn("Could not fetch child profile:", e);
            }
        }



        if (!targetUid) {
            console.error("No linked student found for parent.");
            document.getElementById("matrix-body").innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-500 text-xs">No linked student found. Please contact admin.</td></tr>`;
            document.getElementById("sync-wall-container").innerHTML = `<div class="text-sm text-slate-500 italic p-4 text-center">No student linked to this parent account.</div>`;
            return 0;
        }

        // Update UI with child name
        const contextBadge = document.getElementById("context-badge");
        if (contextBadge) {
            contextBadge.innerHTML = `<i class="fas fa-child mr-1"></i> ${childName}`;
        }

        let snapshot;
        try {
            const q = query(collection(db, "quiz_scores"), where("user_id", "==", targetUid), orderBy("timestamp", "desc"));
            snapshot = await getDocs(q);
        } catch (e) {
            console.error("Critical Permission Error fetching quiz_scores. The parent account may not have rule access.", e);
            // Force clear matrix to remove static html
            document.getElementById("matrix-body").innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-500 text-xs">Permission Denied: Unable to fetch actual student data.</td></tr>`;
            document.getElementById("sync-wall-container").innerHTML = `<div class="text-sm text-slate-500 italic p-4 text-center">Data access restricted.</div>`;
            return 0;
        }

       if (snapshot.empty) {  
    console.log("No data found for student.");  
    document.getElementById("matrix-body").innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-500 text-xs">No quiz data available to generate Report Card.</td></tr>`;  
    // Still render sync wall & inbox — notifications exist even without quiz scores  
    await renderSyncWallAndInbox(db, targetUid, {});  
    return;  
}
        

        const chapterData = {};
        let totalMCQ = 0, mcqScore = 0;
        let totalAR = 0, arScore = 0;
        let totalCase = 0, caseScore = 0;

        snapshot.docs.forEach((doc) => {
            const d = doc.data();
            const chap = d.topic || d.topicSlug || d.chapter || "Unknown Chapter";
            const sub = d.subject || "General";
            const diff = (d.difficulty || "Simple").toLowerCase();
            const totalQ = d.totalQuestions || d.total || 20;
            const p = totalQ > 0 ? Math.round(((d.score || 0) / totalQ) * 100) : (d.score_percent || 0);

            if (!chapterData[chap]) {
                chapterData[chap] = { subject: sub, simple: null, medium: null, advanced: null, attempts: 0, lastDate: null };
            }

            chapterData[chap].attempts++;
            if (!chapterData[chap].lastDate && d.timestamp) {
                chapterData[chap].lastDate = d.timestamp.toDate().toLocaleDateString();
            }

            // Store highest score per difficulty
            if (diff.includes('simple') && (chapterData[chap].simple === null || p > chapterData[chap].simple)) chapterData[chap].simple = p;
            if (diff.includes('medium') && (chapterData[chap].medium === null || p > chapterData[chap].medium)) chapterData[chap].medium = p;
            if (diff.includes('advanced') && (chapterData[chap].advanced === null || p > chapterData[chap].advanced)) chapterData[chap].advanced = p;

            if (diff.includes('simple')) { totalMCQ++; mcqScore += p; }
            if (diff.includes('medium')) { totalAR++; arScore += p; }
            if (diff.includes('advanced')) { totalCase++; caseScore += p; }
        });

        let totalScore = mcqScore + arScore + caseScore;
        let totalQs = totalMCQ + totalAR + totalCase;
        let overallAvg = totalQs > 0 ? Math.round(totalScore / totalQs) : 0;

        renderMatrix(chapterData);
        renderAnalyzer(totalMCQ, mcqScore, totalAR, arScore, totalCase, caseScore);

        // Fetch assignments & notifications to populate Sync Wall & Inbox
        await renderSyncWallAndInbox(db, targetUid, chapterData);

        return overallAvg;

    } catch (error) {
        console.error("Error fetching child data:", error);
        return 0;
    }
}

async function renderSyncWallAndInbox(db, childUid, chapterData) {
    const syncWall = document.getElementById("sync-wall-container");
    const inboxList = document.getElementById("parent-inbox-list");
    const inboxBadge = document.getElementById("parent-inbox-badge");

    if (!syncWall || !inboxList) return;

    let syncHtml = "";
    let inboxHtml = "";
    let priorityCount = 0;
    const now = new Date();
    const renderedChaps = new Set();

    try {
        const q = query(collection(db, "student_notifications"), where("student_id", "==", childUid), orderBy("timestamp", "desc"));
        const notifDocs = await getDocs(q);

        if (!notifDocs.empty) {
            notifDocs.forEach(doc => {
                const data = doc.data();
                if (data.type !== "TEST_ASSIGNED" || !data.topicSlug) return;

                const chap = data.topicSlug;
                renderedChaps.add(chap);
                const assignedDate = data.timestamp ? data.timestamp.toDate() : new Date();
                const hoursDiff = Math.floor((now - assignedDate) / (1000 * 60 * 60));

                // Check if student has taken it
                const scoreData = chapterData[chap];
                const hasScore = scoreData && (scoreData.simple !== null || scoreData.medium !== null || scoreData.advanced !== null);
                const latestScore = hasScore ? Math.max(scoreData.simple || 0, scoreData.medium || 0, scoreData.advanced || 0) : null;

                // ALWAYS add to priority inbox regardless of score or time
                priorityCount++;
                const statusLabel = hasScore ? 'Test Taken' : (hoursDiff <= 48 ? 'Pending Execution' : 'Overdue');
                const statusColor = hasScore ? 'text-success-green' : (hoursDiff <= 48 ? 'text-accent-gold' : 'text-danger-red');
                inboxHtml += `
                <div class="text-xs border-b border-slate-50 pb-2 mb-2 p-2 rounded hover:bg-blue-50 transition cursor-pointer">
                    <span class="font-bold text-cbse-blue">Chapter Finished:</span> ${data.chapter_title || chap} — <span class="${statusColor} font-bold">${statusLabel}</span>
                </div>`;

                if (!hasScore) {
                    if (hoursDiff <= 48) {
                        // Scenario 1: Pending Execution
                        syncHtml += `
                        <div class="flex gap-4">
                            <div class="flex-shrink-0 w-2 h-full bg-slate-100 rounded-full mx-auto relative mt-1">
                                <div class="absolute top-1 left-1/2 -translate-x-1/2 w-4 h-4 bg-cbse-blue rounded-full border-4 border-white"></div>
                            </div>
                            <div class="pb-4 w-full">
                                <div class="flex justify-between items-start">
                                    <div>
                                        <div class="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1">Teacher Trigger</div>
                                        <div class="font-bold text-slate-800 text-sm">${chap}</div>
                                    </div>
                                    <span class="text-[9px] text-slate-400 font-bold bg-slate-50 px-2 py-0.5 rounded">Assigned ${hoursDiff}h ago</span>
                                </div>
                                <div class="text-xs text-slate-500 mt-1">Verification Status: <span class="text-accent-gold font-bold">Pending Execution</span></div>
                                <p class="text-[10px] text-slate-400 mt-1 italic"><i class="fas fa-lock mr-0.5 text-slate-300"></i> Nudge locked. Student is in 48-hour autonomous window.</p>
                            </div>
                        </div>`;
                    } else {
                        // Scenario 2: Overdue
                        syncHtml += `
                        <div class="flex gap-4">
                            <div class="flex-shrink-0 w-2 h-full bg-slate-100 rounded-full mx-auto relative mt-1">
                                <div class="absolute top-1 left-1/2 -translate-x-1/2 w-4 h-4 bg-warning-yellow rounded-full border-4 border-white shadow-[0_0_8px_rgba(202,138,4,0.3)]"></div>
                            </div>
                            <div class="pb-4 w-full">
                                <div class="flex justify-between items-start">
                                    <div>
                                        <div class="text-[10px] font-bold text-warning-yellow uppercase tracking-widest mb-1">Escalation Protocol Active</div>
                                        <div class="font-bold text-slate-800 text-sm">${chap}</div>
                                    </div>
                                    <span class="text-[9px] text-danger-red font-bold animate-pulse bg-red-50 px-2 py-0.5 rounded">Overdue (${hoursDiff}h)</span>
                                </div>
                                <div class="text-xs text-slate-500 mt-1">Verification Status: <span class="text-danger-red font-bold">Missed Deadline</span></div>
                                <button class="mt-2 text-[10px] bg-cbse-blue text-white hover:bg-blue-800 px-3 py-1.5 rounded font-bold transition flex items-center gap-1 shadow-sm"><i class="fas fa-bell"></i> Issue Command Nudge to Student</button>
                                <p class="text-[9px] text-slate-400 mt-1">If unaddressed by 96h, Teacher Escalation Protocol automatically activates.</p>
                            </div>
                        </div>`;
                    }
                }
            });
        }
    } catch (e) {
        console.warn("Skipping notification fetch due to rules error, falling back to pure mastery data.", e);
    }

    // Fallback - Map remaining chapters to diagnostic alerts if they score below 95%
    for (const [chap, scoreData] of Object.entries(chapterData)) {
        if (renderedChaps.has(chap)) continue;

        const hasScore = (scoreData.simple !== null || scoreData.medium !== null || scoreData.advanced !== null);
        if (!hasScore) continue;

        const latestScore = Math.max(scoreData.simple || 0, scoreData.medium || 0, scoreData.advanced || 0);

        if (latestScore < 95) {
            priorityCount++;
            inboxHtml += `
            <div class="text-xs border-b border-slate-50 pb-2 mb-2 p-2 rounded hover:bg-amber-50 transition cursor-pointer">
                <span class="font-bold text-warning-yellow">Test Completed:</span> Score below 95% threshold in ${chap}. Re-attempt required.
            </div>`;

            syncHtml += `
            <div class="flex gap-4 relative">
                <div class="flex-shrink-0 w-2 h-full bg-slate-100 rounded-full mx-auto relative mt-1">
                    <div class="absolute top-1 left-1/2 -translate-x-1/2 w-4 h-4 bg-danger-red rounded-full border-4 border-white shadow-[0_0_8px_rgba(220,38,38,0.3)]"></div>
                </div>
                <div class="pb-4 w-full">
                    <div class="text-[10px] font-bold text-danger-red uppercase tracking-widest mb-1">Diagnostic Alert (System to Parent)</div>
                    <div class="font-bold text-slate-800 text-sm">${chap}</div>
                    <div class="text-xs text-slate-500 mt-1">Latest Score: <span class="text-danger-red font-bold">${latestScore}%</span></div>
                    <p class="text-xs text-slate-500 mt-1"><i class="fas fa-exclamation-triangle text-amber-500"></i> Student completed execution, but failed to reach 95% Mastery threshold. Task persists in Student Inbox.</p>
                    <div class="flex gap-2 mt-2">
                        <button class="text-[10px] bg-cbse-blue text-white hover:bg-blue-800 px-3 py-1.5 rounded font-bold transition flex items-center gap-1 shadow-sm"><i class="fas fa-redo"></i> Nudge Re-Attempt</button>
                        <button class="text-[10px] bg-slate-100 text-slate-600 hover:bg-slate-200 px-3 py-1.5 rounded font-bold transition flex items-center gap-1"><i class="fas fa-reply"></i> Request Teacher Review</button>
                    </div>
                </div>
            </div>`;
        } else {
            syncHtml += `
            <div class="flex gap-4 relative opacity-60">
                <div class="flex-shrink-0 w-2 h-full bg-slate-100 rounded-full mx-auto relative mt-1">
                    <div class="absolute top-1 left-1/2 -translate-x-1/2 w-4 h-4 bg-success-green rounded-full border-4 border-white"></div>
                </div>
                <div class="pb-4 w-full">
                    <div class="text-[10px] font-bold text-success-green uppercase tracking-widest mb-1">Student Execution</div>
                    <div class="font-bold text-slate-800 text-sm">${chap}</div>
                    <div class="text-xs text-slate-500 mt-1">Verification Status: <span class="text-success-green font-bold">Mastered (${latestScore}%)</span></div>
                </div>
            </div>`;
        }
    }

    if (syncHtml === "") syncHtml = `<div class="text-sm text-slate-500 italic p-4 text-center">No immediate authoritative triggers found. Student is performing nominally.</div>`;
    syncWall.innerHTML = syncHtml;

    if (priorityCount > 0) {
        if (inboxBadge) {
            inboxBadge.textContent = priorityCount;
            inboxBadge.classList.remove("hidden");
        }
        inboxList.innerHTML = inboxHtml;
    } else {
        if (inboxBadge) inboxBadge.classList.add("hidden");
        inboxList.innerHTML = `<div class="text-xs text-slate-400 text-center py-4">No priority alerts. Dashboard nominal.</div>`;
    }
}

function renderMatrix(chapterData) {
    const tbody = document.getElementById("matrix-body");
    if (!tbody) return;

    let html = "";
    for (const [chap, data] of Object.entries(chapterData)) {

        const sLabel = getBadgeHtml(data.simple);
        const mLabel = getBadgeHtml(data.medium);
        const aLabel = getBadgeHtml(data.advanced);

        let diagnostic = "";
        let diagColor = "text-slate-400";

        if (data.advanced !== null && data.advanced < 80) {
            diagnostic = `<div class="text-[9px] text-danger-red mt-1 font-bold"><i class="fas fa-exclamation-circle"></i> Struggles with Higher Order</div>`;
        } else if (data.medium !== null && data.medium < 80) {
            diagnostic = `<div class="text-[9px] text-warning-yellow mt-1 font-bold"><i class="fas fa-exclamation-triangle"></i> Application Logic Weak</div>`;
        } else if (data.simple !== null && data.simple < 80) {
            diagnostic = `<div class="text-[9px] text-danger-red mt-1 font-bold"><i class="fas fa-bomb"></i> Core Foundation Gap</div>`;
        }

        html += `
            <tr class="border-b border-slate-50 hover:bg-slate-50 transition">
                <td class="py-3 px-2">
                    <div class="text-slate-800 font-bold">${chap}</div>
                    <div class="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">${data.subject}</div>
                </td>
                <td class="py-3 px-2 text-center">${sLabel}</td>
                <td class="py-3 px-2 text-center">${mLabel}</td>
                <td class="py-3 px-2 text-center">${aLabel}</td>
                <td class="py-3 px-2 text-right">
                    <button class="text-[10px] text-cbse-blue font-bold hover:underline transition"><i class="fas fa-history"></i> Deep-Dive</button>
                    ${diagnostic}
                    <div class="text-[9px] text-slate-400 mt-1">${data.attempts} attempts • Last ${data.lastDate || 'N/A'}</div>
                </td>
            </tr>
        `;
    }
    tbody.innerHTML = html;
}

function getBadgeHtml(score) {
    if (score === null) return `<span class="text-slate-300 text-xs font-bold">—</span>`;
    if (score >= 95) return `<div class="inline-block px-2 py-1 bg-green-50 text-success-green rounded font-black border border-green-100" title="Mastered">${score}%</div>`;
    if (score >= 80) return `<div class="inline-block px-2 py-1 bg-blue-50 text-cbse-blue rounded font-black border border-blue-100" title="Proficient">${score}%</div>`;
    if (score >= 60) return `<div class="inline-block px-2 py-1 bg-amber-50 text-warning-yellow rounded font-black border border-amber-100" title="Amber: Retake Required">${score}%</div>`;
    return `<div class="inline-block px-2 py-1 bg-red-50 text-danger-red rounded font-black border border-red-100" title="Red: Critical Gap">${score}%</div>`;
}

function renderAnalyzer(mcqCount, mcqSum, arCount, arSum, caseCount, caseSum) {
    const mcqPct = mcqCount > 0 ? Math.round(mcqSum / mcqCount) : 0;
    const arPct = arCount > 0 ? Math.round(arSum / arCount) : 0;
    const casePct = caseCount > 0 ? Math.round(caseSum / caseCount) : 0;

    const mcqEl = document.getElementById("bar-mcq");
    const arEl = document.getElementById("bar-ar");
    const caseEl = document.getElementById("bar-case");

    if (mcqEl) {
        mcqEl.style.width = `${mcqPct}%`;
        document.getElementById("txt-mcq").textContent = `${mcqPct}%`;
        mcqEl.className = `h-full rounded-full ${getBarColor(mcqPct)}`;
    }
    if (arEl) {
        arEl.style.width = `${arPct}%`;
        document.getElementById("txt-ar").textContent = `${arPct}%`;
        arEl.className = `h-full rounded-full ${getBarColor(arPct)}`;
    }
    if (caseEl) {
        caseEl.style.width = `${casePct}%`;
        document.getElementById("txt-case").textContent = `${casePct}%`;
        caseEl.className = `h-full rounded-full ${getBarColor(casePct)}`;
    }
}

function getBarColor(score) {
    if (score >= 85) return "bg-success-green";
    if (score >= 60) return "bg-warning-yellow";
    return "bg-danger-red";
}

function renderGrowthChart(overallAvg) {
    const ctx = document.getElementById('growthChart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Class 6', 'Class 7', 'Class 8', 'Class 9'],
            datasets: [{
                label: 'Mastery Average (%)',
                data: [null, null, null, overallAvg || 0],
                borderColor: '#1a3e6a',
                backgroundColor: 'rgba(26, 62, 106, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, max: 100, grid: { color: '#f1f5f9' } },
                x: { grid: { display: false } }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}
