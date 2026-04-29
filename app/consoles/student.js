// app/consoles/student.js
import { guardConsole, bindConsoleLogout } from "../../js/guard.js";
import { getInitializedClients } from "../../js/config.js";
import { collection, query, where, getDocs, orderBy, onSnapshot, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import * as UI from "../../js/ui-renderer.js";
import { loadCurriculum } from "../../js/curriculum/loader.js";

let unsubInbox = null;
let unsubIntercom = null;

UI.injectStyles();

const sanitize = s => String(s ?? '').replace(/&/g,'&amp;')
    .replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const translateSubject = (subject) => window.R4ETranslator ? window.R4ETranslator.translateSubject(subject) : subject;

bindConsoleLogout("logout-nav-btn", "../../index.html");
guardConsole("student");

document.addEventListener('r4e_i18n_update', () => {
    // Avoid full page reload
    if (window.R4ETranslator) {
        window.R4ETranslator.applyTranslations(document);
    }
    // Attempt to re-render dynamic tiles by re-fetching/re-displaying active content if applicable
    if (currentUserProfile && window.loadConsoleData) {
        window.loadConsoleData(currentUserProfile);
    }
});

window.loadConsoleData = async (profile) => {
    console.log("Loading Class Hub for:", profile.displayName);
    document.getElementById("user-welcome").textContent = (profile.displayName || "Student");

    // 1. Determine Grade First
    let grade = "9";
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("grade")) grade = urlParams.get("grade");
    else if (profile.classId) grade = profile.classId;
    else if (profile.grade) grade = profile.grade;
    else if (profile.class_id) grade = profile.class_id;

    // 2. Apply Visibility Logic for Grade-Specific Features (Class 10 and 12 only)
    if (grade === "10" || grade === "12") {
        const pyqBtn = document.getElementById("btn-pyq-vault");
        const pulseBtn = document.getElementById("btn-exam-pulse");
        
        if (pyqBtn) pyqBtn.classList.remove("hidden");
        if (pulseBtn) pulseBtn.classList.remove("hidden");
    }
    else {
    // ADD THIS TO ENSURE OTHER GRADES NEVER SEE IT
    const pyqBtn = document.getElementById("btn-pyq-vault");
    const pulseBtn = document.getElementById("btn-exam-pulse");
    
    if (pyqBtn) pyqBtn.classList.add("hidden");
    if (pulseBtn) pulseBtn.classList.add("hidden");
}

    // 3. Update UI Elements with Detected Grade
    document.getElementById("class-title").textContent = `Class ${grade} Hub`;
    document.getElementById("context-badge").textContent = `Grade ${grade}`;
    const hubTitleEl = document.getElementById("knowledge-hub-title");
    if (hubTitleEl) hubTitleEl.textContent = `Grade ${grade} Knowledge Hub`;

    setupRoomNavigation(grade);
    
    await generateKnowledgeHub(profile, grade);
    await loadStudentStats(profile.uid, grade);
    renderInbox();
    listenToIntercom();
};


async function generateKnowledgeHub(profile, grade) {
    const container = document.getElementById("knowledge-hub-links");
    if (!container) return;

    let curriculum = null;
    try {
        curriculum = await loadCurriculum(grade);
    } catch(e) {
        console.error("Curriculum load failed for knowledge hub:", e);
        container.innerHTML = `<div class="glass-panel p-5 rounded-3xl text-center text-slate-500 italic">Curriculum Coming Soon</div>`;
        return;
    }

    if (!curriculum || Object.keys(curriculum).length === 0) {
        container.innerHTML = `<div class="glass-panel p-5 rounded-3xl text-center text-slate-500 italic">Curriculum Coming Soon</div>`;
        return;
    }

    container.innerHTML = "";
    let subjectsToRender = [];

    if (profile.mapped_disciplines && Array.isArray(profile.mapped_disciplines) && profile.mapped_disciplines.length > 0) {
        // Filter mapping to ensure it exists in curriculum (case-insensitive)
        const curriculumKeys = Object.keys(curriculum).map(k => k.toLowerCase());
        subjectsToRender = profile.mapped_disciplines.filter(d => curriculumKeys.includes(d.toLowerCase()));
    } else {
        // Default triad
        subjectsToRender = ["Mathematics", "Science", "Social Science"].filter(d => {
            const curriculumKeys = Object.keys(curriculum).map(k => k.toLowerCase());
            return curriculumKeys.includes(d.toLowerCase());
        });
    }

    if (subjectsToRender.length === 0) {
        container.innerHTML = `<div class="glass-panel p-5 rounded-3xl text-center text-slate-500 italic">No assigned subjects available.</div>`;
        return;
    }

    subjectsToRender.forEach(subject => {
        const theme = getSubjectTheme(subject);
        const html = `
            <a href="#" onclick="routeToLibrary('${subject}'); return false;"
                class="block glass-panel p-5 rounded-3xl hover:shadow-lg hover:-translate-y-1 transition group relative overflow-hidden border-l-4 ${theme.borderColor}">
                <div class="flex items-center gap-4">
                    <div class="w-12 h-12 rounded-2xl ${theme.bgColor} ${theme.textColor} flex items-center justify-center text-xl">
                        <i class="${theme.icon}"></i>
                    </div>
                    <div>
                        <h4 class="font-bold text-slate-800">${translateSubject(subject)}</h4>
                        <p class="text-[10px] text-slate-500 font-medium">${theme.tagline}</p>
                    </div>
                    <i class="fas fa-chevron-right ml-auto text-slate-300 group-hover:${theme.hoverColor} transition"></i>
                </div>
            </a>
        `;
        container.insertAdjacentHTML('beforeend', html);
    });
}

function getSubjectTheme(subject) {
    const s = subject.toLowerCase();
    if (s.includes("physics")) return { icon: "fas fa-atom", borderColor: "border-purple-500", bgColor: "bg-purple-50", textColor: "text-purple-600", hoverColor: "text-purple-500", tagline: "Laws of the universe." };
    if (s.includes("biology")) return { icon: "fas fa-dna", borderColor: "border-green-500", bgColor: "bg-green-50", textColor: "text-green-600", hoverColor: "text-green-500", tagline: "The science of life." };
    if (s.includes("chemistry")) return { icon: "fas fa-flask", borderColor: "border-teal-500", bgColor: "bg-teal-50", textColor: "text-teal-600", hoverColor: "text-teal-500", tagline: "Matter and its interactions." };
    if (s.includes("math")) return { icon: "fas fa-calculator", borderColor: "border-blue-500", bgColor: "bg-blue-50", textColor: "text-blue-600", hoverColor: "text-blue-500", tagline: "Build your foundation." };
    if (s.includes("science")) return { icon: "fas fa-atom", borderColor: "border-purple-500", bgColor: "bg-purple-50", textColor: "text-purple-600", hoverColor: "text-purple-500", tagline: "Explore the universe." };
    if (s.includes("social")) return { icon: "fas fa-globe-americas", borderColor: "border-amber-500", bgColor: "bg-amber-50", textColor: "text-amber-600", hoverColor: "text-amber-500", tagline: "Understand the world." };
    if (s.includes("english")) return { icon: "fas fa-book", borderColor: "border-indigo-500", bgColor: "bg-indigo-50", textColor: "text-indigo-600", hoverColor: "text-indigo-500", tagline: "Master the language." };

    return { icon: "fas fa-book-open", borderColor: "border-slate-500", bgColor: "bg-slate-50", textColor: "text-slate-600", hoverColor: "text-slate-500", tagline: "Explore knowledge." };
}

function setupRoomNavigation(grade) {
    // Header Start Button
    document.getElementById("start-new-quiz-btn").href = `../curriculum.html?grade=${grade}`;
    document.getElementById("btn-mistakes").href = `../mistake-book.html`;
}

function getSubjectIcon(subject) {
    const icons = {
        "Physics": "fa-atom",
        "Chemistry": "fa-flask",
        "Biology": "fa-dna",
        "Mathematics": "fa-calculator",
        "Applied Mathematics": "fa-calculator",
        "Accountancy": "fa-file-invoice-dollar",
        "Business Studies": "fa-briefcase",
        "Economics": "fa-chart-line",
        "History": "fa-landmark",
        "Political Science": "fa-university",
        "Geography": "fa-globe-americas",
        "Sociology": "fa-users",
        "Psychology": "fa-brain",
        "Hindi": "fa-om",
        "English": "fa-language",
        "Science": "fa-microscope",
        "Social Science": "fa-users-cog"
    };
    return icons[subject] || "fa-book";
}

function renderKnowledgeHub(profile) {
    const linksContainer = document.getElementById("knowledge-hub-links");
    if (!linksContainer) return;

    let subjects = [];
    if (profile.mapped_disciplines && profile.mapped_disciplines.length > 0) {
        subjects = profile.mapped_disciplines;
    } else {
        subjects = ["Mathematics", "Science", "Social Science"];
    }

    linksContainer.innerHTML = "";
    subjects.forEach((subject, index) => {
        // Determine a nice color based on index
        const colors = ["blue-500", "purple-500", "amber-500", "green-500", "red-500", "indigo-500"];
        const color = colors[index % colors.length];

        const card = document.createElement("a");
        card.href = "#";
        card.onclick = (e) => { e.preventDefault(); routeToLibrary(subject); };
        card.className = `block glass-panel p-5 rounded-3xl hover:shadow-lg hover:-translate-y-1 transition group relative overflow-hidden border-l-4 border-${color}`;
        card.innerHTML = `
            <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-2xl bg-${color.replace("500", "50")} text-${color.replace("500", "600")} flex items-center justify-center text-xl">
                    <i class="fas ${getSubjectIcon(subject)}"></i>
                </div>
                <div>
                    <h4 class="font-bold text-slate-800">${translateSubject(subject)}</h4>
                    <p class="text-[10px] text-slate-500 font-medium">Explore curriculum.</p>
                </div>
                <i class="fas fa-chevron-right ml-auto text-slate-300 group-hover:text-${color.replace("500", "500")} transition"></i>
            </div>
        `;
        linksContainer.appendChild(card);
    });
}

window.routeToLibrary = (subject) => {
    const gradeBadge = document.getElementById("context-badge").textContent;
    const grade = gradeBadge.replace("Grade ", "").trim();

    if (!grade || grade === "undefined") {
        console.error("Grade not found in context badge.");
        return;
    }

    window.location.href = `../study-library.html?grade=${grade}&subject=${encodeURIComponent(subject)}`;
};

window.loadStudentStats = async (uid, grade) => {
    if (!uid) return;
    document.getElementById("hub-sync-status").classList.remove("hidden"); // Syncing Hub Pulse

    try {
        // Parallel Fetch: Stats & Curriculum
        const { db } = await getInitializedClients();
        const q = query(collection(db, "quiz_scores"), where("user_id", "==", uid), orderBy("timestamp", "desc"));

        let snapshot, curriculum;
        try {
            [snapshot, curriculum] = await Promise.all([
                getDocs(q),
                loadCurriculum(grade).catch(e => {
                    console.error("Curriculum load failed:", e);
                    return null;
                })
            ]);
        } catch(e) {
            if (e.message && e.message.includes("requires an index")) {
                console.error("Missing Index:", e);
                const gridContainer = document.getElementById("grid-container");
                if (gridContainer) gridContainer.innerHTML = `<div class="p-8 text-center text-warning-yellow font-bold">Dashboard requires a one-time index setup. Contact your administrator.</div>`;
                return;
            }
            throw e;
        }

        if (!curriculum || Object.keys(curriculum).length === 0) {
            const hubTitleEl = document.getElementById("knowledge-hub-title");
            if (hubTitleEl) hubTitleEl.textContent = `Grade ${grade} Knowledge Hub`;
            document.getElementById("knowledge-hub-links").innerHTML = `
                <div class="glass-panel p-5 rounded-3xl text-center text-slate-500 italic">
                    Curriculum Coming Soon
                </div>
            `;
        }

        // --- METRIC: Curriculum Totals ---
        const curriculumCounts = { "Mathematics": 0, "Science": 0, "Social Science": 0 };

        // Traverse curriculum to count total chapters
        if (curriculum) {
            for (const subject in curriculum) {
                // Normalize subject key from curriculum to our buckets
                let bucket = subject;
                if (subject === "Maths" || subject === "Mathematics") bucket = "Mathematics";
                // If curriculum has "Social Science" or "Science", it matches our keys.

                if (curriculumCounts.hasOwnProperty(bucket)) {
                    const sections = curriculum[subject];
                    // sections is { "Physics": [...], ... }
                    for (const sectionKey in sections) {
                        const chapters = sections[sectionKey];
                        if (Array.isArray(chapters)) {
                            curriculumCounts[bucket] += chapters.length;
                        }
                    }
                }
            }
        }


        if (Object.values(curriculumCounts).reduce((a, b) => a + b, 0) === 0) {
            const banner = document.createElement('div');
            banner.className = "bg-warning-yellow/10 border-l-4 border-warning-yellow text-warning-yellow p-4 mb-6 rounded-r-xl font-medium text-sm";
            banner.innerHTML = "⚠️ Curriculum data unavailable — coverage stats may be inaccurate.";
            const statsContainer = document.querySelector('.grid.grid-cols-1.md\\:grid-cols-3');
            if (statsContainer && statsContainer.parentNode) {
                statsContainer.parentNode.insertBefore(banner, statsContainer);
            }
        }


        const totalChapters = curriculumCounts["Mathematics"] + curriculumCounts["Science"] + curriculumCounts["Social Science"];
        const totalMasteryPoints = totalChapters * 3;

        // Update Total Chapters and Radial Chart
        if (document.getElementById("stat-total")) document.getElementById("stat-total").textContent = totalChapters;

        // Update Total Attempts (in Average Mastery Card)
        const attemptsEl = document.getElementById("stat-attempts-count");
        if (attemptsEl) attemptsEl.textContent = snapshot.size;

        if (snapshot.empty) {
            renderZeroState(curriculumCounts, totalChapters);
            document.getElementById("hub-sync-status").classList.add("hidden");
            return;
        }

        // --- DATA PROCESSING ---
        let totalScoreSum = 0;
        const subjectScores = {};
        const chapterStats = {};
        const gridData = [];

        // Helper to normalize subject names
        const getActualSubject = (data) => {
            if (data.subject && typeof data.subject === 'string' && data.subject.trim() !== '') {
                const s = data.subject.trim().toLowerCase();
                if (s === 'math' || s === 'maths' || s === 'mathematics') return 'Mathematics';
                if (s === 'sci' || s === 'science') return 'Science';
                if (s === 'social science' || s === 'sst' || s === 'social') return 'Social Science';
                return data.subject;
            }
            const context = `${data.subject || ''} ${data.topicSlug || ''} ${data.topic || ''}`.toLowerCase();
            if (context.includes("social") || context.includes("history") || context.includes("nazism") || context.includes("hitler") || context.includes("civics") || context.includes("geography")) return "Social Science";
            if (context.includes("math") || context.includes("triangle") || context.includes("polynomial") || context.includes("probability") || context.includes("algebra") || context.includes("geometry")) return "Mathematics";
            if (context.includes("science") || context.includes("physics") || context.includes("gravitation") || context.includes("motion") || context.includes("force") || context.includes("atom") || context.includes("chem") || context.includes("bio")) return "Science";
            return "General";
        };

        // --- METRIC: User Progress ---
        const uniqueTouchedChapters = new Set();
        const subjectTouchedCounts = { "Mathematics": new Set(), "Science": new Set(), "Social Science": new Set() };
        const masteredTiers = { "Simple": 0, "Medium": 0, "Advanced": 0 };
        const masteredUniqueMap = new Set(); // Track unique chapter+difficulty mastered

        let latestQuiz = null;

        snapshot.docs.forEach((docSnap, index) => {
            const data = docSnap.data();
            const cleanSubject = getActualSubject(data);
            const cleanChapter = formatChapterName(data.topicSlug || data.topic || data.chapter);

            const scoreVal = data.score || 0;
            const totalVal = data.totalQuestions || data.total || 20;
            const percentage = totalVal > 0 ? Math.round((scoreVal / totalVal) * 100) : (data.score_percent || 0);

            // 0. Capture Latest Quiz
            if (index === 0) {
                latestQuiz = { chapter: cleanChapter, percentage: percentage };
            }

            // 1. Overall Avg
            totalScoreSum += percentage;

            // 2. Subject Aggregation
            if (!subjectScores[cleanSubject]) subjectScores[cleanSubject] = [];
            subjectScores[cleanSubject].push(percentage);

            // 3. Chapter Aggregation (Grit & Mastery)
            if (!chapterStats[cleanChapter]) chapterStats[cleanChapter] = { scores: [], attempts: 0, highest: 0 };
            chapterStats[cleanChapter].attempts++;
            chapterStats[cleanChapter].scores.push(percentage);
            if (percentage > chapterStats[cleanChapter].highest) chapterStats[cleanChapter].highest = percentage;

            // 4. Volume Metrics
            if (cleanSubject !== "General") {
                uniqueTouchedChapters.add(cleanChapter);
                if (subjectTouchedCounts[cleanSubject]) {
                    subjectTouchedCounts[cleanSubject].add(cleanChapter);
                }

                // Mastery Funnel
                if (percentage >= 95) {
                    const difficulty = data.difficulty || "Simple"; // Default to Simple if missing
                    const diffKey = difficulty.charAt(0).toUpperCase() + difficulty.slice(1).toLowerCase();

                    if (["Simple", "Medium", "Advanced"].includes(diffKey)) {
                        const uniqueKey = `${cleanChapter}_${diffKey}`;
                        if (!masteredUniqueMap.has(uniqueKey)) {
                            masteredUniqueMap.add(uniqueKey);
                            masteredTiers[diffKey]++;
                        }
                    }
                }
            }

            // 5. Recent Activity List Data
            const dateStr = data.timestamp ? data.timestamp.toDate().toLocaleDateString() : "N/A";
            gridData.push({
                subject: cleanSubject,
                chapter: cleanChapter,
                difficulty: data.difficulty || 'Mixed',
                percentage: percentage,
                date: dateStr
            });
        });

        // --- UI RENDERING ---

        // 1. Volume Dashboard
        document.getElementById("stat-coverage").textContent = `${uniqueTouchedChapters.size} Chapters Touched`;

        // Radial Chart Update
        const coveragePercent = Math.min((uniqueTouchedChapters.size / totalChapters) * 100, 100);
        const radialBar = document.getElementById("stat-radial-bar");
        if (radialBar) {
            // Circumference is ~100 in this viewbox scaling (2 * pi * 15.9155 = 100)
            radialBar.setAttribute("stroke-dasharray", `${coveragePercent}, 100`);
        }

        // Coverage Grid (Persistent)
        const covMath = `${subjectTouchedCounts["Mathematics"].size}/${curriculumCounts["Mathematics"]}`;
        const covSci = `${subjectTouchedCounts["Science"].size}/${curriculumCounts["Science"]}`;
        const covSoc = `${subjectTouchedCounts["Social Science"].size}/${curriculumCounts["Social Science"]}`;

        document.getElementById("coverage-math").innerHTML = `<i class="fas fa-calculator mb-1"></i> M: ${covMath}`;
        document.getElementById("coverage-sci").innerHTML = `<i class="fas fa-flask mb-1"></i> S: ${covSci}`;
        document.getElementById("coverage-sst").innerHTML = `<i class="fas fa-landmark mb-1"></i> SS: ${covSoc}`;

        // Mastery Funnel (Persistent Mini-Bars)
        const wSimple = (masteredTiers["Simple"] / totalChapters) * 100;
        const wMedium = (masteredTiers["Medium"] / totalChapters) * 100;
        const wAdvanced = (masteredTiers["Advanced"] / totalChapters) * 100;

        document.getElementById("funnel-simple").style.width = `${Math.min(wSimple, 100)}%`;
        document.getElementById("funnel-medium").style.width = `${Math.min(wMedium, 100)}%`;
        document.getElementById("funnel-advanced").style.width = `${Math.min(wAdvanced, 100)}%`;


        // 2. Latest Achievement
        if (latestQuiz && document.getElementById("stat-subject")) {
            document.getElementById("stat-subject").innerHTML = `${sanitize(latestQuiz.chapter)} <span class="${getScoreColor(latestQuiz.percentage)}">(${latestQuiz.percentage}%)</span>`;
            document.getElementById("stat-subject-label").textContent = "Latest Achievement:";
        }

        // 3. Average Mastery
        const avg = Math.round(totalScoreSum / snapshot.size);
        document.getElementById("stat-avg").textContent = `${avg}%`;

        // Update Radial Donut
        const avgRadial = document.getElementById("stat-avg-radial");
        if (avgRadial) {
            avgRadial.setAttribute("stroke-dasharray", `${avg}, 100`);
        }

        // --- NEW: Subject-Based Tier Logic & Diagnostics ---
        const masteryCounts = {
            "Mathematics": { "Advanced": new Set(), "Medium": new Set() },
            "Science": { "Advanced": new Set(), "Medium": new Set() },
            "Social Science": { "Advanced": new Set(), "Medium": new Set() }
        };

        // Diagnostic Data Structure: Subject -> Section -> Scores
        const sectionScores = {}; // { "Mathematics": { "Algebra": [80, 90], ... } }
        const simpleMasteryCounts = { "Mathematics": 0, "Science": 0, "Social Science": 0 };
        const simpleTotalCounts = { "Mathematics": 0, "Science": 0, "Social Science": 0 };

        // Populate Mastery Sets & Diagnostics
        snapshot.docs.forEach(doc => {
            const d = doc.data();
            const totalQ = d.totalQuestions || d.total || 20;
            const p = totalQ > 0 ? Math.round(((d.score || 0) / totalQ) * 100) : (d.score_percent || 0);
            const sub = getActualSubject(d);
            const chap = formatChapterName(d.topicSlug || d.topic || d.chapter);
            const diffRaw = d.difficulty || "Simple";
            const diff = diffRaw.charAt(0).toUpperCase() + diffRaw.slice(1).toLowerCase();

            // Tier Logic (Advanced/Medium)
            if (p >= 95) {
                if (masteryCounts[sub]) {
                    if (diff === "Advanced") masteryCounts[sub]["Advanced"].add(chap);
                    if (diff === "Medium") masteryCounts[sub]["Medium"].add(chap);
                }
            }

            // Diagnostic Logic (Simple Difficulty)
            if (diff === "Simple" || !d.difficulty) {
                // Find Section in Curriculum
                let sectionName = "General";
                if (curriculum && curriculum[sub]) {
                    // Check direct sections first
                    for (const sec in curriculum[sub]) {
                        const chapters = curriculum[sub][sec];
                        // Simple substring match for robustness
                        if (Array.isArray(chapters) && chapters.some(c => chap.includes(c.chapter_title) || c.chapter_title.includes(chap))) {
                            sectionName = sec;
                            break;
                        }
                    }
                    // Fallback mapping for known structures
                    if (sectionName === "General" && sub === "Mathematics") {
                        if (chap.includes("Polynomial") || chap.includes("Number")) sectionName = "Algebra and Number System";
                        else if (chap.includes("Triangle") || chap.includes("Circle") || chap.includes("Line")) sectionName = "Geometry";
                        else sectionName = "Mensuration, Statistics and Probability";
                    }
                }

                if (!sectionScores[sub]) sectionScores[sub] = {};
                if (!sectionScores[sub][sectionName]) sectionScores[sub][sectionName] = [];
                sectionScores[sub][sectionName].push(p);

                // Simple Mastery Tracking for Pips
                if (simpleMasteryCounts[sub] !== undefined) {
                    simpleTotalCounts[sub]++;
                    if (p >= 95) simpleMasteryCounts[sub]++;
                }
            }
        });

        // Calculate Diagnostics (Strong/Weak) per Subject
        const diagnostics = {};
        let globalWeakestSection = "General";
        let globalMinScore = 100;

        ["Mathematics", "Science", "Social Science"].forEach(sub => {
            const sections = sectionScores[sub] || {};
            let maxAvg = -1, minAvg = 101;
            let strong = "None", weak = "None";

            Object.entries(sections).forEach(([sec, scores]) => {
                const secAvg = scores.reduce((a, b) => a + b, 0) / scores.length;
                if (secAvg > maxAvg) { maxAvg = secAvg; strong = sec; }
                if (secAvg < minAvg) { minAvg = secAvg; weak = sec; }

                // Update Global Weakest
                if (secAvg < globalMinScore) {
                    globalMinScore = secAvg;
                    globalWeakestSection = sec;
                }
            });

            diagnostics[sub] = { strong, weak, simpleAvg: 0 };

            // Overall Simple Avg for Radar/Pips
            const subSimpleScores = Object.values(sections).flat();
            if (subSimpleScores.length > 0) {
                diagnostics[sub].simpleAvg = subSimpleScores.reduce((a, b) => a + b, 0) / subSimpleScores.length;
            }
        });

        let challengerCount = 0;
        let standardCount = 0;

        const tierConfig = [
            { key: "Mathematics", label: "M", icon: "fa-calculator", bgClass: "bg-blue-50 border-blue-100 text-blue-700" },
            { key: "Science", label: "S", icon: "fa-flask", bgClass: "bg-purple-50 border-purple-100 text-purple-700" },
            { key: "Social Science", label: "SS", icon: "fa-landmark", bgClass: "bg-amber-50 border-amber-100 text-amber-700" }
        ];

        const tiersHtml = tierConfig.map(config => {
            const sub = config.key;
            const total = curriculumCounts[sub] || 1;
            const advCount = masteryCounts[sub]["Advanced"].size;
            const medCount = masteryCounts[sub]["Medium"].size;

            let shortTier = "F";
            if (advCount > (0.30 * total)) {
                shortTier = "C";
                challengerCount++;
            } else if (medCount > (0.40 * total)) {
                shortTier = "S";
                standardCount++;
            }

            // Box Style Sync with Total Chapters + Tier Letter
            return `
                <div class="px-2 py-1 rounded text-[10px] font-bold text-center border ${config.bgClass} flex items-center gap-1.5 min-w-[80px] justify-between shadow-sm" title="${sub}">
                    <div class="flex items-center gap-1">
                        <i class="fas ${config.icon}"></i>
                        <span>${config.label}:</span>
                    </div>
                    <span class="font-black text-slate-900">${shortTier}</span>
                </div>
            `;
        }).join("");

        const tiersContainer = document.getElementById("subject-tiers-container");
        if (tiersContainer) tiersContainer.innerHTML = tiersHtml;

        // Determine Global Badge
        let globalBadgeText = "Foundational Scholar";
        let globalBadgeClass = "bg-slate-100 text-slate-500 border-slate-200";

        if (challengerCount >= 2) {
            globalBadgeText = "Challenger Scholar";
            globalBadgeClass = "bg-amber-100 text-amber-700 border-amber-200";
        } else if ((challengerCount + standardCount) >= 2) {
            globalBadgeText = "Standard Scholar";
            globalBadgeClass = "bg-blue-100 text-blue-700 border-blue-200";
        }

        const badgeEl = document.getElementById("global-badge");
        if (badgeEl) {
            badgeEl.textContent = globalBadgeText;
            badgeEl.className = `px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm border ${globalBadgeClass}`;
        }

        // Update Journey Line
        const journeyBar = document.getElementById("journey-progress");
        if (journeyBar) {
            let progress = "15%"; // Foundational default
            if (globalBadgeText.includes("Challenger")) progress = "100%";
            else if (globalBadgeText.includes("Standard")) progress = "50%";

            journeyBar.style.width = progress;
        }

        // 4. Subject Mastery (Slim-Tiles)
        const subjectMeterContainer = document.getElementById("subject-mastery-container");

        let diagnosticRows = "";
        const subjectConfigs = [
            { key: "Mathematics", label: "M", icon: "fa-calculator", bg: "bg-blue-50", text: "text-success-green", border: "border-blue-100", bar: "bg-success-green" },
            { key: "Science", label: "S", icon: "fa-atom", bg: "bg-purple-50", text: "text-cbse-blue", border: "border-purple-100", bar: "bg-cbse-blue" },
            { key: "Social Science", label: "SS", icon: "fa-globe-americas", bg: "bg-amber-50", text: "text-accent-gold", border: "border-amber-100", bar: "bg-accent-gold" }
        ];

        subjectConfigs.forEach(cfg => {
            const d = diagnostics[cfg.key];
            const isSimpleMastered = (simpleMasteryCounts[cfg.key] / (simpleTotalCounts[cfg.key] || 1)) >= 0.95;
            const sPipClass = isSimpleMastered ? cfg.text : "text-slate-200";

            // Overall Average for Mini-Spark
            const scores = Array.isArray(subjectScores[cfg.key]) ? subjectScores[cfg.key] : []; // Flatten logic
            const overallAvg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

            diagnosticRows += `
                <div class="p-2 mb-1 rounded-lg border ${cfg.bg} ${cfg.border} flex flex-col justify-between">
                    <div class="flex justify-between items-center mb-1">
                        <div class="flex items-center gap-2">
                            <i class="fas ${cfg.icon} ${cfg.text}"></i>
                            <span class="text-[10px] font-bold text-slate-700">${cfg.key}</span>
                        </div>
                        <div class="flex gap-1 text-[8px]">
                            <i class="fas fa-circle ${sPipClass}"></i>
                            <i class="fas fa-circle text-slate-200"></i>
                            <i class="fas fa-circle text-slate-200"></i>
                        </div>
                    </div>

                    <div class="text-[9px] font-medium text-slate-500 leading-tight mb-1">
                        <span class="font-bold text-success-green">Strong:</span> ${sanitize(d.strong).substring(0, 15)} | <span class="font-bold text-danger-red">Weak:</span> ${sanitize(d.weak).substring(0, 15)}
                    </div>

                    <div class="h-1 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div class="h-full ${cfg.bar} rounded-full" style="width: ${overallAvg}%"></div>
                    </div>
                </div>
            `;
        });

        subjectMeterContainer.innerHTML = `
            <div class="flex flex-col h-full justify-between">
                <div class="space-y-1">
                    ${diagnosticRows}
                </div>

                <div class="mt-2 pt-2 border-t border-slate-50 text-[9px] text-slate-400 italic">
                    <span class="font-bold text-cbse-blue">Expert Insight:</span> Focus on <span class="font-bold text-slate-600">${globalWeakestSection}</span> to improve mastery.
                </div>
            </div>
        `;

        // 5. Chapter Health Grid
        const healthContainer = document.getElementById("chapter-health-grid");
        if (healthContainer) {
            healthContainer.innerHTML = Object.entries(chapterStats).map(([chap, stats]) => {
                const colorClass = getScoreColor(stats.highest);
                return `
                    <div class="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-md transition">
                        <div>
                            <h4 class="font-bold text-slate-800 text-sm truncate" title="${sanitize(chap)}">${sanitize(chap)}</h4>
                            <div class="text-[10px] text-slate-400 uppercase font-bold mt-1">Highest Score</div>
                            <div class="text-2xl font-black ${colorClass}">${stats.highest}%</div>
                        </div>
                        <div class="mt-3 pt-3 border-t border-slate-50 flex justify-between items-center">
                            <span class="text-xs text-slate-500 font-medium">Grit (Attempts)</span>
                            <span class="px-2 py-1 bg-slate-100 rounded-lg text-xs font-bold text-slate-600">${stats.attempts}</span>
                        </div>
                    </div>
                `;
            }).join("");
        }

        // 6. Recent Activity List
        const columns = [
            { key: 'subject', header: 'Subject', cell: (item) => `<span class="font-bold text-cbse-blue">${item.subject}</span>` },
            { key: 'chapter', header: 'Chapter', cell: (item) => `<span class="text-sm font-medium text-slate-600">${item.chapter}</span>` },
            { key: 'difficulty', header: 'Difficulty', cell: (item) => `<span class="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-500">${item.difficulty}</span>` },
            { key: 'percentage', header: 'Score', cell: (item) => `<span class="font-mono font-bold ${getScoreColor(item.percentage)}">${item.percentage}%</span>` },
            { key: 'date', header: 'Date', cell: (item) => `<span class="text-xs text-slate-400">${item.date}</span>` }
        ];

        const cardRenderer = (item) => `
            <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-center mb-2">
                <div>
                    <div class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">${item.subject}</div>
                    <div class="font-bold text-slate-800">${item.chapter}</div>
                    <div class="text-xs text-slate-500 mt-1">${item.date}</div>
                </div>
                <div class="text-right">
                    <div class="text-xl font-black ${getScoreColor(item.percentage)}">${item.percentage}%</div>
                    <div class="text-[10px] font-bold bg-slate-100 px-2 py-1 rounded mt-1">${item.difficulty}</div>
                </div>
            </div>
        `;

        UI.renderResponsiveGrid(document.getElementById("grid-container"), gridData.slice(0, 10), columns, cardRenderer);

    } catch (e) {
        console.error("Dashboard Sync Failed:", e);
        const gridContainer = document.getElementById("grid-container");
        if (gridContainer) {
            gridContainer.innerHTML = `<div class="p-8 text-center text-red-500 font-bold col-span-full">
                Dashboard sync failed: ${e.message}.
                <br><button onclick="location.reload()" class="mt-2 text-cbse-blue underline cursor-pointer">Retry</button>
            </div>`;
        }
    } finally {
        document.getElementById("hub-sync-status").classList.add("hidden");
    }
};

function renderZeroState(curriculumCounts, totalChapters) {
    // Update Volume Dashboard for Zero State
    if (curriculumCounts && totalChapters) {
        if (document.getElementById("stat-coverage")) document.getElementById("stat-coverage").textContent = `0 Chapters Touched`;

        const radialBar = document.getElementById("stat-radial-bar");
        if (radialBar) radialBar.setAttribute("stroke-dasharray", "0, 100");

        if (document.getElementById("coverage-math")) document.getElementById("coverage-math").innerHTML = `<i class="fas fa-calculator mb-1"></i> M: 0/${curriculumCounts["Mathematics"]}`;
        if (document.getElementById("coverage-sci")) document.getElementById("coverage-sci").innerHTML = `<i class="fas fa-flask mb-1"></i> S: 0/${curriculumCounts["Science"]}`;
        if (document.getElementById("coverage-sst")) document.getElementById("coverage-sst").innerHTML = `<i class="fas fa-landmark mb-1"></i> SS: 0/${curriculumCounts["Social Science"]}`;

        if (document.getElementById("funnel-simple")) document.getElementById("funnel-simple").style.width = "0%";
        if (document.getElementById("funnel-medium")) document.getElementById("funnel-medium").style.width = "0%";
        if (document.getElementById("funnel-advanced")) document.getElementById("funnel-advanced").style.width = "0%";
    }

    if (document.getElementById("stat-avg")) document.getElementById("stat-avg").textContent = "0%";
    if (document.getElementById("stat-subject")) document.getElementById("stat-subject").textContent = "None";
    if (document.getElementById("subject-mastery-container")) document.getElementById("subject-mastery-container").innerHTML = `
        <div class="text-center py-4">
            <p class="text-xs text-slate-400 mb-2">No data yet.</p>
            <a href="#" onclick="routeToLibrary('Mathematics'); return false;" class="text-xs font-bold text-blue-600 hover:underline">Start Your First Journey</a>
        </div>
     `;
    if (document.getElementById("grid-container")) document.getElementById("grid-container").innerHTML = `<div class="p-8 text-center text-slate-400">Welcome! Visit the Knowledge Hub to begin.</div>`;
}

function formatChapterName(slug) {
    if (!slug) return "General Quiz";
    return slug
      .replace(/_quiz$/i, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
      .trim();
}

function getScoreColor(p) {
    if (p >= 85) return "text-success-green";
    if (p >= 50) return "text-cbse-blue";
    return "text-danger-red";
}
window.toggleInbox = () => {
    const inbox = document.getElementById("student-inbox");
    if (inbox) inbox.classList.toggle("translate-x-full");
};

window.launchFromInbox = async (topicSlug, discipline, notifGrade, chapterTitle) => {
    const grade = notifGrade || new URLSearchParams(window.location.search).get("grade") || "9";
    const chapter = chapterTitle || topicSlug;

    let subject = discipline;
    try {
        const { loadCurriculum } = await import("../../js/curriculum/loader.js");
        const curriculum = await loadCurriculum(grade);

        if (!curriculum[discipline]) {
            for (const [topSubject, subData] of Object.entries(curriculum)) {
                if (typeof subData === 'object' && !Array.isArray(subData)) {
                    const match = Object.keys(subData).some(k => k.toLowerCase().includes(discipline.toLowerCase()));
                    if (match) {
                        subject = topSubject;
                        break;
                    }
                }
            }
        }
    } catch (e) {
        console.warn("Curriculum lookup failed, using discipline as subject:", e);
    }

    window.location.href = `../study-content.html?grade=${grade}&subject=${encodeURIComponent(subject)}&chapter=${encodeURIComponent(chapter)}`;
};

async function listenToIntercom() {
    if (unsubIntercom) unsubIntercom();
    const { auth, db } = await getInitializedClients();
    const feed = document.getElementById('intercom-feed');
    if (!feed || !auth.currentUser) return;

    const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
    if (!userSnap.exists()) return;
    const profile = userSnap.data();

    const schoolId = profile.school_id;
    const targetGrade = profile.classId || "9"; // default
    const targetSection = profile.section || "A"; // default

    if(!schoolId) return;

    const q = query(
        collection(db, "messages"),
        where("school_id", "==", schoolId)
    );

    unsubIntercom = onSnapshot(q, (snapshot) => {
        feed.innerHTML = "";


        // Sort manually client side
        const docs = [];
        snapshot.forEach(doc => docs.push(doc));
        docs.sort((a,b) => {
            const ta = a.data().timestamp ? a.data().timestamp.toMillis() : 0;
            const tb = b.data().timestamp ? b.data().timestamp.toMillis() : 0;
            return tb - ta; // desc
        });

        docs.forEach(doc => {
            const data = doc.data();

            if(data.target_grade === targetGrade && data.target_section === targetSection) {
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
                // Using appendChild because we iterate desc (newest first). Wait, if we iterate newest first and append, newest is at the top.
                feed.appendChild(toast);

                const badge = document.getElementById("inbox-badge");
                if (badge) {
                    badge.classList.remove("hidden");
                    badge.textContent = parseInt(badge.textContent || "0") + 1;
                }
            }
        });
    }, (error) => {
        console.warn("Intercom listener error:", error.message);
    });
}

async function renderInbox() {
    if (unsubInbox) unsubInbox();
    const { auth, db } = await getInitializedClients();
    const notificationContainer = document.getElementById('notification-list');
    if (!notificationContainer || !auth.currentUser) return;

    // Querying notifications for the logged-in student
    const q = query(collection(db, "student_notifications"), where("student_id", "==", auth.currentUser.uid));

    unsubInbox = onSnapshot(q, (snapshot) => {
        notificationContainer.innerHTML = "";
        let count = 0;
        snapshot.forEach(doc => {
            const msg = doc.data();
            const color = msg.priority === 'admin' ? 'border-red-500' : 'border-blue-500';

            const card = document.createElement('div');
            card.className = `p-3 mb-2 border-l-4 ${color} bg-slate-50 shadow-sm rounded-r-md`;
            card.innerHTML = `
                <p class="text-[10px] font-bold uppercase text-slate-400 mb-1">${msg.sender_name || 'System'}</p>
                <p class="text-sm font-medium mb-2">${msg.text}</p>
               ${msg.type === 'TEST_ASSIGNED' && msg.topicSlug ?
`<button onclick="launchFromInbox('${msg.topicSlug}', '${(msg.discipline || '').replace(/'/g, "\\'")}', '${msg.grade || ''}', '${(msg.chapter_title || '').replace(/'/g, "\\'")}')" class="text-xs bg-slate-900 text-white px-2 py-1 rounded hover:bg-slate-800 transition">Take Test Now</button>`
: ''}
`;
            notificationContainer.appendChild(card);
            count++;
        });

        const badge = document.getElementById("inbox-badge");
        if (badge) {
            if (count > 0) {
                badge.textContent = count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    }, (error) => {
        console.warn("Inbox listener error:", error.message);
    });
}
