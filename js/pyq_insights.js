import { getInitializedClients } from './config.js';
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Global State ---
let state = {
    grade: new URLSearchParams(window.location.search).get('grade') || '10',
    subject: new URLSearchParams(window.location.search).get('subject') || 'Science',
    chapterID: new URLSearchParams(window.location.search).get('chapter') || 'Chemical_Reactions',
    db: null
};

/**
 * Main Entry Point
 */
export async function initInsights() {
    const { auth, db } = await getInitializedClients();
    state.db = db;

    // Use 'async' callback to allow 'await' inside
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            try {
                // Fix: Sync user token
                await user.getIdToken(true);
                
                // 1. Update UI Elements immediately
                updateHeaderUI(user);
                updatePageTitles();

                // 2. Load Data from Firestore
                await loadChapterMetadata();
                await loadHistoricalQuestions();
            } catch (err) {
                console.error("Initialization Error:", err);
            }
        } else {
            window.location.href = "../index.html";
        }
    });
}

/**
 * UI: Updates the Header with User Info
 */
function updateHeaderUI(user) {
    // Update Grade Badge
    const badge = document.getElementById('context-badge');
    if (badge) badge.textContent = `Grade ${state.grade}`;

    // Update Username (checks common classes used in shell.js)
    const nameDisplay = document.querySelector('.user-welcome-name') || 
                        document.getElementById('user-name');
    if (nameDisplay) {
        nameDisplay.textContent = user.displayName || user.email.split('@')[0];
    }
}

/**
 * UI: Updates Page Headings based on URL Params
 */
function updatePageTitles() {
    const headerTitle = document.getElementById('header-title');
    if (headerTitle) {
        headerTitle.innerHTML = `
            <span>${state.subject.replace(/_/g, ' ')}</span>
            <span class="text-white opacity-80 text-lg font-medium ml-2">| ${state.chapterID.replace(/_/g, ' ')}</span>
        `;
    }
}

/**
 * Backend: Fetch Grid Intelligence (Heatmap, Blueprint, etc.)
 */
async function loadChapterMetadata() {
    const docRef = doc(state.db, 'Chapter_Analysis', `${state.grade}_${state.subject}_${state.chapterID}`);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
        const data = snap.data();
        
        // Populate Heatmap
        if (data.heatmap) {
            document.getElementById('heatmap-container').innerHTML = data.heatmap.map(item => `
                <div class="flex justify-between items-center mb-2">
                    <span class="text-sm font-medium text-slate-700">${item.topic}</span>
                    <div class="w-1/2 bg-slate-200 rounded-full h-2">
                        <div class="bg-warning-yellow h-2 rounded-full" style="width: ${item.frequency}%"></div>
                    </div>
                </div>
            `).join('');
        }

        // Populate Blueprint
        if (data.blueprint) {
            document.getElementById('blueprint-1m').textContent = data.blueprint['1m'] || 0;
            document.getElementById('blueprint-2m').textContent = data.blueprint['2m'] || 0;
            document.getElementById('blueprint-3m').textContent = data.blueprint['3m'] || 0;
            document.getElementById('blueprint-5m').textContent = data.blueprint['5m'] || 0;
        }

        // Populate AI Text Sections
        if (data.forensics) document.getElementById('forensics-text').textContent = data.forensics;
        if (data.predictive) document.getElementById('predictive-text').textContent = data.predictive;
        if (data.industry_connection) document.getElementById('industry-connection-text').textContent = data.industry_connection;

    } else {
        document.getElementById('grid-loading').innerHTML = `<p class="p-4 text-slate-500 italic">No intelligence data found.</p>`;
    }
}

/**
 * Backend: Fetch Questions Sub-collection
 */
async function loadHistoricalQuestions() {
    const qRef = collection(state.db, 'Chapter_Analysis', `${state.grade}_${state.subject}_${state.chapterID}`, 'Historical_Questions');
    const qSnap = await getDocs(qRef);
    const container = document.getElementById('compendium-container');

    if (qSnap.empty) {
        container.innerHTML = `<p class="text-center text-slate-500 py-8">No historical questions found.</p>`;
        return;
    }

    // Sort and Render Logic (Simplified)
    const questions = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    // ... insert your group-by-marks rendering logic here ...
    // (Refer to original code for the full mapping function)
}
