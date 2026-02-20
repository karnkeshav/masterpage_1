// js/api.js
import { getInitializedClients, getAuthUser, logAnalyticsEvent, initializeServices } from "./config.js";
import { doc, getDoc, collection, addDoc, setDoc, serverTimestamp, query, where, getDocs, orderBy, writeBatch, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Re-export core services for consumers (e.g., student.html)
export { getInitializedClients, initializeServices };

export async function migrateAnonymousData(oldUid, newUid) {
    if (!oldUid || !newUid || oldUid === newUid) return;
    console.log(`[MIGRATE] Moving data from ${oldUid} to ${newUid}`);

    try {
        const { db } = await getInitializedClients();
        const batch = writeBatch(db);
        let opCount = 0;

        // 1. Move Quiz Scores
        const scoresQ = query(collection(db, "quiz_scores"), where("user_id", "==", oldUid));
        const scoresSnap = await getDocs(scoresQ);
        scoresSnap.forEach(doc => {
            batch.update(doc.ref, { user_id: newUid });
            opCount++;
        });

        // 2. Move Mistake Notebook
        const mistakesQ = query(collection(db, "mistake_notebook"), where("user_id", "==", oldUid));
        const mistakesSnap = await getDocs(mistakesQ);
        mistakesSnap.forEach(doc => {
            // Update top level user_id and nested mistakes array
            const data = doc.data();
            const updatedMistakes = (data.mistakes || []).map(m => ({ ...m, user_id: newUid }));

            batch.update(doc.ref, { user_id: newUid, mistakes: updatedMistakes });
            opCount++;
        });

        if (opCount > 0) {
            await batch.commit();
            console.log(`[MIGRATE] Moved ${opCount} records.`);
        } else {
            console.log("[MIGRATE] No records to move.");
        }

        // 3. Delete old profile
        await deleteDoc(doc(db, "users", oldUid));
        console.log("[MIGRATE] Old profile deleted.");

    } catch (e) {
        console.error("[MIGRATE] Failed:", e);
    }
}

export async function ensureUserProfile(uid, username, additionalData = {}) {
    if (!uid) return;
    try {
        const { db } = await getInitializedClients();
        const ref = doc(db, "users", uid);

        const snap = await getDoc(ref);

        // Base profile structure
        let profile = {
            uid: uid,
            displayName: username,
            lastLogin: serverTimestamp()
        };

        if (!snap.exists()) {
            // NEW PROFILE: Set creation timestamp and infer from username
            console.log("Creating new user profile for:", uid);
            profile.createdAt = serverTimestamp();

            // Merge with additionalData from CREDENTIALS (passed from auth-paywall)
            if (additionalData.role) profile.role = additionalData.role;
            if (additionalData.school_id) profile.school_id = additionalData.school_id;
            if (additionalData.tenantType) profile.tenantType = additionalData.tenantType;
            if (additionalData.tenantId) profile.tenantId = additionalData.tenantId;
            if (additionalData.classId) profile.classId = additionalData.classId;

            // Fallback inference from username if no explicit data
            if (!profile.role) {
                const lowerUser = username.toLowerCase();
                if (lowerUser.includes("dps.ready4exam") || lowerUser.includes("admin")) {
                    profile = { ...profile, role: 'admin', school_id: 'DPS_001', tenantType: 'school' };
                } else if (lowerUser.includes("teacher")) {
                    profile = { ...profile, role: 'teacher', school_id: 'DPS_001', tenantType: 'school' };
                } else if (lowerUser.includes("principal")) {
                    profile = { ...profile, role: 'principal', school_id: 'DPS_001', tenantType: 'school' };
                } else if (lowerUser.includes("parent")) {
                    profile = { ...profile, role: 'parent', school_id: 'DPS_001', tenantType: 'school' };
                } else if (lowerUser.includes("student")) {
                    profile = { ...profile, role: 'student', classId: '9', school_id: 'DPS_001', tenantType: 'school' };
                } else {
                    profile = { ...profile, role: 'student', tenantType: 'individual' };
                }
            }

            await setDoc(ref, profile);
        } else {
            // EXISTING PROFILE: Update lastLogin only
            console.log("Updating existing profile for:", uid);
            await updateDoc(ref, { lastLogin: serverTimestamp() });
        }
    } catch (e) {
        console.error("Profile Ensure Failed", e);
    }
}

export async function waitForProfileReady(uid) {
    const { db } = await getInitializedClients();
    const ref = doc(db, "users", uid);
    const maxTime = 5000;
    let elapsed = 0;
    let delay = 50;

    while (elapsed < maxTime) {
        const snap = await getDoc(ref);
        if (snap.exists() && snap.data().role) {
            console.log("Profile ready for:", uid);
            return true;
        }

        console.log(`Waiting for profile... (${elapsed}ms)`);
        await new Promise(r => setTimeout(r, delay));
        elapsed += delay;
        delay = Math.min(delay * 2, 1000); // Exponential backoff capped at 1s
    }

    throw new Error("Timeout waiting for user profile creation.");
}

function getTableName(topic) {
  // Prevent double-slugging if already a table ID
  if (topic && topic.includes("_") && topic.includes("quiz")) {
      return topic;
  }

  // Fallback for older chapter names -> simple slug
  return (topic || "").toLowerCase().replace(/\s+/g, "_").trim();
}

function normalizeQuestionData(q) {
  let text = q.question_text || "";
  let reason = q.scenario_reason_text || "";
  const type = (q.question_type || "").toLowerCase();

  if (type.includes("ar") || type.includes("assertion")) {
    const combined = `${text} ${reason}`.replace(/\s+/g, " ").trim();
    const parts = combined.split(/Reason\s*\(R\)\s*:/i);
    if (parts.length > 1) {
      text = parts[0].replace(/Assertion\s*\(A\)\s*:/i, "").trim();
      reason = parts[1].trim();
    } else {
      text = text.replace(/Assertion\s*\(A\)\s*:/i, "").trim();
      reason = reason.replace(/Reason\s*\(R\)\s*:/i, "").trim();
    }
  }

  return {
    id: q.id,
    question_type: type,
    text: text,
    scenario_reason: reason,
    correct_answer: (q.correct_answer_key || "").trim().toUpperCase(),
    options: {
      A: q.option_a || "",
      B: q.option_b || "",
      C: q.option_c || "",
      D: q.option_d || ""
    },
    difficulty: q.difficulty
  };
}

export async function fetchQuestions(topic, difficulty) {
  const { supabase } = await getInitializedClients();
  if (!supabase) throw new Error("Question service unavailable: Supabase not initialized");

  const cleanDiff = (difficulty || "Simple").trim();

  let topics = [];
  if (Array.isArray(topic)) topics = topic;
  else if (typeof topic === 'string' && topic.includes(',')) topics = topic.split(',').map(t => t.trim());
  else topics = [topic];

  const isMixedMode = topics.length > 1;
  let allQuestions = [];

  const promises = topics.map(async (t) => {
    const table = getTableName(t);
    try {
        const { data, error } = await supabase
        .from(table)
        .select('id,question_text,question_type,scenario_reason_text,option_a,option_b,option_c,option_d,correct_answer_key,difficulty')
        .eq('difficulty', cleanDiff);

        if (error) {
            console.warn(`Supabase fetch error for ${table}:`, error.message);
            return [];
        }
        return data || [];
    } catch (e) {
        console.warn(`Failed to fetch from ${table}`, e);
        return [];
    }
  });

  const results = await Promise.all(promises);
  results.forEach(res => allQuestions.push(...res));

  if (!allQuestions.length) throw new Error(`No questions found matching "${difficulty}".`);

  let normalized = allQuestions.map(normalizeQuestionData);

  if (isMixedMode) {
    normalized.sort(() => Math.random() - 0.5);
    return normalized.slice(0, 20);
  }
  return normalized;
}

export async function saveResult(result) {
  console.log('Attempting to save result...', result);
  const { auth, db } = await getInitializedClients();

  // Persistence Priority: Auth > Window Profile (fallback)
  const uid = auth.currentUser?.uid || window.userProfile?.uid;

  if (!uid) {
      console.error('Save failed: No UID found (User not authenticated)');
      return;
  }

  try {
    // TENANT CONTEXT INJECTION
    const userSnap = await getDoc(doc(db, "users", uid));
    const userData = userSnap.exists() ? userSnap.data() : {};

    const data = {
      user_id: uid,
      email: auth.currentUser?.email || "",
      subject: result.subject || "Unknown",
      topic: result.topicSlug || result.topic || "Unknown",
      difficulty: result.difficulty,
      score: result.score,
      total: result.total,
      score_percent: Math.round((result.score / result.total) * 100),
      percentage: Math.round((result.score / result.total) * 100), // Keep for backward compatibility
      timestamp: serverTimestamp(),

      quiz_mode: result.quiz_mode || "standard",
      latency_vector: result.latency_vector || [],
      term_id: result.term_id || null,
      class_id: result.classId || "9",

      // ISOLATION FIELDS
      tenantType: userData.tenantType || "individual",
      tenantId: userData.tenantId || null,
      school_id: userData.school_id || null
    };

    await addDoc(collection(db, "quiz_scores"), data);
    console.log('Result saved successfully to Firestore');

    logAnalyticsEvent("quiz_completed", {
        topic: data.topic,
        score: data.score,
        mode: data.quiz_mode,
        user_id: uid,
        tenant: data.tenantType
    });
  } catch (err) {
    console.warn("Save result failed", err);
  }
}

export async function saveMistakes(questions, userAnswers, topic, classId) {
    const { auth, db } = await getInitializedClients();
    // Persistence Priority: Auth > Window Profile (fallback)
    const uid = auth.currentUser?.uid || window.userProfile?.uid;

    if (!uid) {
        console.error("Save failed: No UID found (User not authenticated)");
        return;
    }

    try {
        // Filter for wrong answers
        const mistakes = questions.filter(q => userAnswers[q.id] !== q.correct_answer);

        if (mistakes.length === 0) return;

        const data = {
            user_id: uid,
            topic: topic,
            chapter_slug: topic,
            class_id: classId,
            timestamp: serverTimestamp(),
            mistakes: mistakes.map(q => ({
                user_id: uid,
                chapter_slug: topic,
                id: q.id,
                question: q.text,
                options: q.options,
                correct: q.correct_answer,
                selected: userAnswers[q.id] || "Skipped",
                explanation: q.scenario_reason || ""
            }))
        };

        await addDoc(collection(db, "mistake_notebook"), data);
        console.log("Mistakes saved to notebook.");

    } catch (e) {
        console.error("Failed to save mistakes:", e);
    }
}

export async function getChapterMastery(userId, topic) {
    if (!userId || !topic) return 0;

    try {
        const { db } = await getInitializedClients();
        const userSnap = await getDoc(doc(db, "users", userId));
        const userData = userSnap.exists() ? userSnap.data() : {};

        let constraints = [
            where("user_id", "==", userId),
            where("chapter", "==", topic),
            where("difficulty", "==", "Medium")
        ];

        // STRICT SCOPING
        if (userData.tenantType === 'school' && userData.school_id) {
            constraints.push(where("school_id", "==", userData.school_id));
        }

        const q = query(collection(db, "quiz_scores"), ...constraints);
        const snapshot = await getDocs(q);
        if (snapshot.empty) return 0;

        let maxScore = 0;
        snapshot.forEach(doc => {
            const d = doc.data();
            const p = d.percentage || 0;
            if (p > maxScore) maxScore = p;
        });

        return maxScore;
    } catch (e) {
        console.error("Mastery check failed:", e);
        return 0;
    }
}

export async function fetchQuizAttempts(userId) {
    if (!userId) return [];

    try {
        const { db } = await getInitializedClients();
        const q = query(
            collection(db, "quiz_scores"),
            where("user_id", "==", userId),
            orderBy("timestamp", "desc")
        );

        const snap = await getDocs(q);
        return snap.docs.map(doc => {
            const data = doc.data();
            return {
                ...data,
                date: data.timestamp ? data.timestamp.toDate() : new Date(),
                // Infer Subject if possible, or use placeholder if chapter name isn't clear
                subject: inferSubject(data.chapter || data.topic)
            };
        });
    } catch (e) {
        console.error("Fetch attempts failed:", e);
        return [];
    }
}

function inferSubject(chapterSlug) {
    // Basic heuristic based on naming conventions
    const s = (chapterSlug || "").toLowerCase();
    if (s.includes("science") || s.includes("physics") || s.includes("chem") || s.includes("bio")) return "Science";
    if (s.includes("math") || s.includes("algebra") || s.includes("geo")) return "Mathematics";
    if (s.includes("social") || s.includes("history") || s.includes("civics")) return "Social Science";
    return "General";
}

// --- GOVERNANCE & LEDGER ---

export async function recordFinancialEvent(schoolId, type, amount, details) {
    const { db } = await getInitializedClients();
    if (!schoolId) return;

    try {
        const ref = collection(db, "schools", schoolId, "financial_events");
        await addDoc(ref, {
            type,
            amount,
            details,
            timestamp: serverTimestamp(),
            recorded_by: getAuthUser()?.uid || "system"
        });
        console.log("Financial Event Recorded");
    } catch (e) {
        console.error("Ledger Write Failed", e);
    }
}

export async function fetchB2CUsers() {
    const { db } = await getInitializedClients();
    try {
        const q = query(collection(db, "users"), where("tenantType", "==", "individual"));
        const snap = await getDocs(q);
        // Map to simpler object for table
        return snap.docs.map(d => {
            const data = d.data();
            return {
                uid: data.uid,
                email: data.email,
                plan: "Direct (B2C)",
                status: "Active",
                revenue: "₹499" // Mock for prototype, real logic would query payments
            };
        });
    } catch (e) {
        console.error("B2C Fetch Failed", e);
        return [];
    }
}

export async function fetchSchoolAnalytics(schoolId) {
    const { db } = await getInitializedClients();
    if (!schoolId) return null;

    try {
        // Strict Isolation: Query only scores with matching school_id
        const q = query(
            collection(db, "quiz_scores"),
            where("school_id", "==", schoolId),
            where("tenantType", "==", "school") // Double check
        );

        const snap = await getDocs(q);

        // Client-side aggregation (for prototype)
        // In production, use Aggregation Queries or Cloud Functions
        let totalAttempts = 0;
        let totalScore = 0;

        snap.forEach(doc => {
            const d = doc.data();
            totalAttempts++;
            totalScore += (d.percentage || 0);
        });

        return {
            totalAttempts,
            avgMastery: totalAttempts > 0 ? Math.round(totalScore / totalAttempts) : 0,
            activeStudents: new Set(snap.docs.map(d => d.data().user_id)).size
        };
    } catch (e) {
        console.error("Analytics Query Failed", e);
        return null;
    }
}
