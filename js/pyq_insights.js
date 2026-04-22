import { getInitializedClients } from './config.js';
import {
    doc,
    getDoc,
    collection,
    getDocs,
    query,
    where,
    collectionGroup
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Global State ---
let state = {
    grade: new URLSearchParams(window.location.search).get('grade') || '10',
    subject: new URLSearchParams(window.location.search).get('subject') || 'Science',
    chapterID: new URLSearchParams(window.location.search).get('chapter') || 'Chemical_Reactions',
    db: null
};

// --- UTIL ---
function normalizeChapter(slug) {
    return slug.replace(/_/g, ' ').trim();
}

/**
 * Main Entry Point
 */
export async function initInsights() {
    try {
        const clients = await getInitializedClients();

        if (!clients || !clients.auth) {
            console.error("Auth client failed to initialize.");
            return;
        }

        const { auth, automationDB, db } = clients;

        // 🔥 Keep automationDB for vault usage
        state.db = automationDB;

        auth.onAuthStateChanged(async (user) => {
            if (user) {
                await user.getIdToken(true);

                // Profile fetch (unchanged)
                let profileName = null;
                try {
                    const userDoc = await getDoc(doc(db, "users", user.uid));
                    if (userDoc.exists()) {
                        profileName = userDoc.data().displayName;
                    }
                } catch (e) {
                    console.warn("Profile fetch failed:", e);
                }

                const welcomeEl = document.getElementById('user-welcome');
                if (welcomeEl) {
                    welcomeEl.textContent =
                        profileName ||
                        user.displayName ||
                        (user.email ? user.email.split('@')[0] : 'Student');
                }

                updateHeaderUI();
                updatePageTitles();

                try {
                    await loadChapterMetadata();
                    await loadBlueprintFromQuestionVault(); // ✅ UPDATED
                    await loadHistoricalQuestions();
                } catch (error) {
                    console.error("Data Load Error:", error);
                }

            } else {
                window.location.href = "../offering.html";
            }
        });

    } catch (err) {
        console.error("Init error:", err);
    }
}

/**
 * Header UI
 */
function updateHeaderUI() {
    const badge = document.getElementById('context-badge');
    if (badge) badge.textContent = `Grade ${state.grade}`;
}

/**
 * Page Titles
 */
function updatePageTitles() {
    const headerTitle = document.getElementById('header-title');
    if (headerTitle) {
        headerTitle.innerHTML = `
            ${state.subject}
            <span class="text-white opacity-80 text-lg font-medium ml-2">
                | ${normalizeChapter(state.chapterID)}
            </span>
        `;
    }
}

/**
 * Chapter Intelligence (UNCHANGED)
 */
async function loadChapterMetadata() {
    const docRef = doc(state.db, 'Chapter_Analysis', `${state.grade}_${state.subject}_${state.chapterID}`);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
        console.warn("No Intelligence document found.");
        return;
    }

    const data = snap.data();

    if (data.blueprint) {
        document.getElementById('blueprint-1m').textContent = data.blueprint['1m'] || 0;
        document.getElementById('blueprint-2m').textContent = data.blueprint['2m'] || 0;
        document.getElementById('blueprint-3m').textContent = data.blueprint['3m'] || 0;
        document.getElementById('blueprint-5m').textContent = data.blueprint['5m'] || 0;
    }
}

/**
 * ✅ UPDATED BLUEPRINT LOGIC (ONLY CHANGE)
 * Uses collectionGroup instead of looping papers
 */
async function loadBlueprintFromQuestionVault() {

    const marksList = [1, 2, 3, 5];
    const chapterName = normalizeChapter(state.chapterID);

    try {

        const tasks = marksList.map(async (mark) => {

            const q = query(
                collectionGroup(state.db, 'questions'),
                where('subject', '==', state.subject),
                where('chapter', '==', chapterName),
                where('marks', '==', mark)
            );

            const snap = await getDocs(q);
            console.log(`Query returned ${snap.size} docs for ${mark}m marks`);
            if (snap.empty) console.warn(`No documents found for marks=${mark}`);
            
            console.log(`Blueprint → ${mark}m:`, snap.size);

            const el = document.getElementById(`blueprint-${mark}m`);
            if (el) el.textContent = snap.size;
        });

        await Promise.all(tasks);

        console.log("✅ Blueprint loaded (collectionGroup)");

    } catch (error) {
        console.error("❌ Blueprint error:", error);

        ['1m', '2m', '3m', '5m'].forEach(id => {
            const el = document.getElementById(`blueprint-${id}`);
            if (el) el.textContent = '!';
        });
    }
}

/**
 * Historical Questions (UNCHANGED)
 */
async function loadHistoricalQuestions() {
    const qRef = collection(state.db, 'Chapter_Analysis',
        `${state.grade}_${state.subject}_${state.chapterID}`,
        'Historical_Questions'
    );

    const qSnap = await getDocs(qRef);
    const container = document.getElementById('compendium-container');

    if (qSnap.empty) {
        container.innerHTML = `<p>No historical questions found.</p>`;
        return;
    }

    const questions = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderQuestions(questions);
}

/**
 * Render Questions (UNCHANGED)
 */
function renderQuestions(questions) {
    const container = document.getElementById('compendium-container');

    if (questions.length === 0) {
        container.innerHTML = `<p>No historical questions found.</p>`;
        return;
    }

    container.innerHTML = questions.map(q => `
        <div class="p-4 border rounded mb-2">
            <div>${q.question_text || ''}</div>
        </div>
    `).join('');
}
