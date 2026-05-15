// app/consoles/parent.js
import { guardConsole, bindConsoleLogout } from "../../js/guard.js";
import { getInitializedClients } from "../../js/config.js";
import { collection, query, where, getDocs, orderBy, doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// LOGOUT LOGIC — use standard bindConsoleLogout for uniformity
bindConsoleLogout("logout-nav-btn", "../../index.html");


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
guardConsole("parent"); 

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
            const children = parentProfile.linked_children;

            // Build child switcher if multiple children are linked
            if (children.length > 1) {
                const switcher = document.getElementById("child-switcher");
                if (switcher) {
                    const childProfiles = await Promise.all(
                        children.map(uid => getDoc(doc(db, "users", uid)).catch(() => null))
                    );
                    switcher.innerHTML = childProfiles.map((snap, i) => {
                        const name = snap?.exists() ? (snap.data().displayName || `Child ${i + 1}`) : `Child ${i + 1}`;
                        return `<button onclick="window._switchChild('${children[i]}')"
                            class="px-3 py-1.5 text-xs font-bold rounded-xl border transition ${i === 0 ? 'bg-cbse-blue text-white border-cbse-blue' : 'bg-white text-slate-600 border-slate-200 hover:border-cbse-blue'}">${name}</button>`;
                    }).join('');
                    switcher.classList.remove('hidden');
                }
            }

            targetUid = children[0];
            try {
                const childSnap = await getDoc(doc(db, "users", targetUid));
                if (childSnap.exists()) childName = childSnap.data().displayName || "Student";
            } catch (e) {
                console.warn("Could not fetch child profile:", e);
            }
        }

        // Allow switching between children from the switcher UI
        window._switchChild = async (uid) => {
            targetUid = uid;
            const snap = await getDoc(doc(db, "users", uid)).catch(() => null);
            childName = snap?.exists() ? (snap.data().displayName || "Student") : "Student";
            const contextBadge = document.getElementById("context-badge");
            if (contextBadge) contextBadge.innerHTML = `<i class="fas fa-child mr-1"></i> ${childName}`;
            // Re-fetch data for newly selected child
            const q = query(collection(db, "quiz_scores"), where("user_id", "==", uid), orderBy("timestamp", "desc"));
            const snap2 = await getDocs(q).catch(() => null);
            if (snap2) await renderSyncWallAndInbox(db, uid, {});
        };



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

        const q = query(
            collection(db, "student_notifications"),
            where("student_id", "==", childUid),
            orderBy("timestamp", "desc")
        );

        const notifDocs = await getDocs(q);

        if (!notifDocs.empty) {

            notifDocs.forEach(doc => {

                const data = doc.data();

                if (data.type !== "TEST_ASSIGNED" || !data.topicSlug) return;

                const chap = data.topicSlug;

                renderedChaps.add(chap);

                const assignedDate = data.timestamp
                    ? data.timestamp.toDate()
                    : new Date();

                const hoursDiff = Math.floor(
                    (now - assignedDate) / (1000 * 60 * 60)
                );

                const scoreData = chapterData[chap];

                const hasScore =
                    scoreData &&
                    (
                        scoreData.simple !== null ||
                        scoreData.medium !== null ||
                        scoreData.advanced !== null
                    );

                priorityCount++;

                const statusLabel = hasScore
                    ? 'Completed'
                    : (hoursDiff <= 48
                        ? 'Pending'
                        : 'Escalated');

                const statusColor = hasScore
                    ? 'text-success-green'
                    : (hoursDiff <= 48
                        ? 'text-accent-gold'
                        : 'text-danger-red');

                // =========================
                // PRIORITY INBOX
                // =========================

                inboxHtml += `
                <div class="bg-white border border-slate-100 rounded-2xl p-3 hover:border-blue-100 transition shadow-sm">

                    <div class="flex items-start justify-between gap-3">

                        <div class="min-w-0">

                            <div class="text-[10px] uppercase tracking-widest font-black ${statusColor}">
                                ${statusLabel}
                            </div>

                            <div class="font-bold text-slate-800 text-xs mt-1 break-words">
                                ${(data.chapter_title || chap)
                                    .replaceAll("_", " ")
                                    .replaceAll("quiz", "")
                                }
                            </div>

                        </div>

                        <div class="w-2.5 h-2.5 rounded-full bg-cbse-blue mt-1.5 shrink-0"></div>

                    </div>

                </div>
                `;

                // =========================
                // PENDING EXECUTION
                // =========================

                if (!hasScore && hoursDiff <= 48) {

                    syncHtml += `
                    <div class="bg-white border border-slate-100 rounded-2xl p-4 hover:border-blue-100 transition shadow-sm">

                        <div class="flex items-start justify-between gap-3">

                            <div class="flex items-start gap-3 min-w-0">

                                <div class="w-3 h-3 rounded-full bg-cbse-blue mt-1.5 shrink-0"></div>

                                <div class="min-w-0">

                                    <div class="text-[10px] uppercase tracking-widest font-black text-cbse-blue mb-1">
                                        Teacher Trigger
                                    </div>

                                    <div class="font-bold text-slate-800 text-sm truncate">
                                        ${chap.replaceAll("_", " ")}
                                    </div>

                                    <div class="text-xs text-slate-500 mt-1">
                                        Autonomous execution window active.
                                    </div>

                                </div>
                            </div>

                            <div class="text-[10px] font-black text-cbse-blue whitespace-nowrap">
                                ${hoursDiff}h
                            </div>

                        </div>

                    </div>
                    `;
                }

                // =========================
                // ESCALATED
                // =========================

                else if (!hasScore && hoursDiff > 48) {

                    syncHtml += `
                    <div class="bg-white border border-amber-100 rounded-2xl p-4 hover:border-warning-yellow transition shadow-sm">

                        <div class="flex items-start justify-between gap-3">

                            <div class="flex items-start gap-3 min-w-0">

                                <div class="w-3 h-3 rounded-full bg-warning-yellow mt-1.5 shrink-0"></div>

                                <div class="min-w-0">

                                    <div class="text-[10px] uppercase tracking-widest font-black text-warning-yellow mb-1">
                                        Escalation Protocol
                                    </div>

                                    <div class="font-bold text-slate-800 text-sm truncate">
                                        ${chap.replaceAll("_", " ")}
                                    </div>

                                    <div class="text-xs text-slate-500 mt-1">
                                        Pending beyond execution window.
                                    </div>

                                </div>
                            </div>

                            <div class="text-[10px] font-black text-danger-red whitespace-nowrap">
                                ${hoursDiff}h
                            </div>

                        </div>

                    </div>
                    `;
                }
            });
        }

    } catch (e) {

        console.warn("Notification fetch error:", e);
    }

    // =========================
    // FALLBACK DIAGNOSTICS
    // =========================

    for (const [chap, scoreData] of Object.entries(chapterData)) {

        if (renderedChaps.has(chap)) continue;

        const hasScore =
            (
                scoreData.simple !== null ||
                scoreData.medium !== null ||
                scoreData.advanced !== null
            );

        if (!hasScore) continue;

        const latestScore = Math.max(
            scoreData.simple || 0,
            scoreData.medium || 0,
            scoreData.advanced || 0
        );

        if (latestScore < 95) {

            priorityCount++;

            inboxHtml += `
            <div class="bg-white border border-red-100 rounded-2xl p-3 hover:border-danger-red transition shadow-sm">

                <div class="flex items-start justify-between gap-3">

                    <div class="min-w-0">

                        <div class="text-[10px] uppercase tracking-widest font-black text-danger-red">
                            Re-Attempt Required
                        </div>

                        <div class="font-bold text-slate-800 text-xs mt-1 break-words">
                            ${chap.replaceAll("_", " ")}
                        </div>

                        <div class="text-[10px] text-slate-400 mt-1">
                            Mastery below 95%
                        </div>

                    </div>

                    <div class="text-[10px] font-black text-danger-red whitespace-nowrap">
                        ${latestScore}%
                    </div>

                </div>

            </div>
            `;

        } else {

            syncHtml += `
            <div class="bg-white border border-green-100 rounded-2xl p-4 opacity-80 hover:opacity-100 transition shadow-sm">

                <div class="flex items-start justify-between gap-3">

                    <div class="flex items-start gap-3 min-w-0">

                        <div class="w-3 h-3 rounded-full bg-success-green mt-1.5 shrink-0"></div>

                        <div class="min-w-0">

                            <div class="text-[10px] uppercase tracking-widest font-black text-success-green mb-1">
                                Mastered
                            </div>

                            <div class="font-bold text-slate-800 text-sm truncate">
                                ${chap.replaceAll("_", " ")}
                            </div>

                        </div>
                    </div>

                    <div class="text-[10px] font-black text-success-green whitespace-nowrap">
                        ${latestScore}%
                    </div>

                </div>

            </div>
            `;
        }
    }

    if (syncHtml === "") {

        syncHtml = `
        <div class="text-sm text-slate-500 italic p-6 text-center bg-white rounded-2xl border border-slate-100">
            No immediate authoritative triggers found.
        </div>
        `;
    }

    syncWall.innerHTML = syncHtml;

    if (priorityCount > 0) {

        if (inboxBadge) {

            inboxBadge.textContent = priorityCount;
            inboxBadge.classList.remove("hidden");
        }

        inboxList.innerHTML = `
        <div class="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            ${inboxHtml}
        </div>
        `;

    } else {

        if (inboxBadge) {
            inboxBadge.classList.add("hidden");
        }

        inboxList.innerHTML = `
        <div class="text-xs text-slate-400 text-center py-4">
            No priority alerts.
        </div>
        `;
    }
}
function renderMatrix(chapterData) {

    const container = document.getElementById("subject-report-container");
    if (!container) return;

    const grouped = {};

    for (const [chap, data] of Object.entries(chapterData)) {
        const subject = data.subject || "General";

        if (!grouped[subject]) grouped[subject] = [];

        grouped[subject].push({
            chap,
            ...data
        });
    }

    let html = "";

    Object.entries(grouped).forEach(([subject, chapters]) => {

        const avg = Math.round(
            chapters.reduce((a, c) => {
                const vals = [c.simple, c.medium, c.advanced].filter(v => v !== null);
                const localAvg = vals.length ? vals.reduce((x,y)=>x+y,0)/vals.length : 0;
                return a + localAvg;
            }, 0) / chapters.length
        );

        let strength = "WEAK";
        let strengthColor = "text-danger-red bg-red-50 border-red-100";

        if (avg >= 95) {
            strength = "MASTERED";
            strengthColor = "text-success-green bg-green-50 border-green-100";
        } else if (avg >= 80) {
            strength = "STRONG";
            strengthColor = "text-cbse-blue bg-blue-50 border-blue-100";
        } else if (avg >= 60) {
            strength = "MODERATE";
            strengthColor = "text-warning-yellow bg-amber-50 border-amber-100";
        }

        html += `
        <div class="bg-slate-50 border border-slate-100 rounded-2xl overflow-hidden">

            <button onclick="toggleSubjectCard(this)"
                class="w-full flex items-center justify-between px-5 py-4 hover:bg-white transition group">

                <div class="flex items-center gap-4">

                    <div class="w-11 h-11 rounded-xl bg-blue-50 text-cbse-blue flex items-center justify-center">
                        <i class="fas fa-book"></i>
                    </div>

                    <div class="text-left">
                        <div class="font-black text-slate-900 text-sm uppercase tracking-wide">
                            ${subject}
                        </div>

                        <div class="text-[11px] text-slate-400 font-semibold mt-0.5">
                            ${chapters.length} Chapters • ${avg}% Avg Mastery
                        </div>
                    </div>
                </div>

                <div class="flex items-center gap-3">

                    <div class="px-3 py-1 rounded-full border text-[10px] font-black ${strengthColor}">
                        ${strength}
                    </div>

                    <i class="fas fa-chevron-down text-slate-400 transition subject-chevron"></i>
                </div>
            </button>

            <div class="subject-content hidden border-t border-slate-100 bg-white">

                <div class="grid grid-cols-12 gap-2 px-5 py-3 text-[10px] uppercase tracking-widest font-black text-slate-400 border-b border-slate-100 sticky top-0 bg-white z-10">
                    <div class="col-span-5">Chapter</div>
                    <div class="col-span-2 text-center text-success-green">Simple</div>
                    <div class="col-span-2 text-center text-cbse-blue">Medium</div>
                    <div class="col-span-2 text-center text-accent-gold">Advanced</div>
                    <div class="col-span-1 text-right">Status</div>
                </div>

                <div class="max-h-[420px] overflow-y-auto">
        `;

        chapters.forEach(data => {

            const latest = Math.max(
                data.simple || 0,
                data.medium || 0,
                data.advanced || 0
            );

            let status = "bg-danger-red";

            if (latest >= 95) status = "bg-success-green";
            else if (latest >= 80) status = "bg-cbse-blue";
            else if (latest >= 60) status = "bg-warning-yellow";

            html += `
            <div class="grid grid-cols-12 gap-2 px-5 py-4 border-b border-slate-50 hover:bg-slate-50 transition items-center">

                <div class="col-span-5 min-w-0">
                    <div class="font-bold text-slate-800 text-sm truncate">
                        ${data.chap}
                    </div>

                    <div class="text-[10px] text-slate-400 mt-1">
                        ${data.attempts} attempts • Last ${data.lastDate || 'N/A'}
                    </div>
                </div>

                <div class="col-span-2 text-center">
                    ${getBadgeHtml(data.simple)}
                </div>

                <div class="col-span-2 text-center">
                    ${getBadgeHtml(data.medium)}
                </div>

                <div class="col-span-2 text-center">
                    ${getBadgeHtml(data.advanced)}
                </div>

                <div class="col-span-1 flex justify-end">
                    <div class="w-2.5 h-2.5 rounded-full ${status}"></div>
                </div>

            </div>
            `;
        });

        html += `
                </div>
            </div>
        </div>
        `;
    });

    container.innerHTML = html;
}

window.toggleSubjectCard = function(btn) {

    const card = btn.parentElement;
    const content = card.querySelector(".subject-content");
    const chevron = card.querySelector(".subject-chevron");

    content.classList.toggle("hidden");
    chevron.classList.toggle("rotate-180");
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
window.launchMirrorPortal = async function () {

    const profile = window.userProfile;

    if (!profile?.linked_children?.length) {
        alert("No linked student found.");
        return;
    }

    const childUid = profile.linked_children[0];

    sessionStorage.setItem("mirror_student_uid", childUid);
    sessionStorage.setItem("mirror_mode", "parent");

    window.location.href = "/masterpage_1/app/consoles/student.html";
}

