// js/api.js
// Optimized for high-speed Supabase reads and lazy-loaded Firestore writes
import { getInitializedClients, getAuthUser, logAnalyticsEvent } from "./config.js";

/**
 * Builds the database-friendly table name
 */
function getTableName(topic) {
  // If the topic is already a table name (contains underscores), return it
  if (topic.includes("_") && topic.includes("quiz")) return topic;

  return (topic || "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .trim();
}

/**
 * Normalizes Assertion-Reason and Case-Study data into a flat, UI-ready format.
 * This ensures quiz-engine.js can render immediately without extra loops.
 */
function normalizeQuestionData(q) {
  let text = q.question_text || "";
  let reason = q.scenario_reason_text || "";
  const type = (q.question_type || "").toLowerCase();

  // === STRICT AR RENDERING LOGIC (Pre-processed for UI) ===
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
    text: text, // Normalized Assertion or MCQ text
    scenario_reason: reason, // Normalized Reason or Case Study context
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

// =============================================================
// FETCH QUESTIONS — OPTIMIZED FOR MOBILE SPEED & TERM PREP
// =============================================================
export async function fetchQuestions(topic, difficulty) {
  const { supabase } = getInitializedClients();
  const cleanDiff = (difficulty || "Simple").trim();

  // 1. Determine topics (handle Term Prep multi-selection)
  let topics = [];
  if (Array.isArray(topic)) topics = topic;
  else if (typeof topic === 'string' && topic.includes(',')) topics = topic.split(',').map(t => t.trim());
  else topics = [topic];

  const isMixedMode = topics.length > 1;
  let allQuestions = [];

  // 2. Fetch from all requested tables in parallel
  const promises = topics.map(async (t) => {
    const table = getTableName(t);
    try {
        const { data, error } = await supabase
        .from(table)
        .select(`
            id,
            question_text,
            question_type,
            scenario_reason_text,
            option_a,
            option_b,
            option_c,
            option_d,
            correct_answer_key,
            difficulty
        `)
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

  if (!allQuestions.length) {
    throw new Error(`No questions found matching "${difficulty}".`);
  }

  // 3. Normalize
  let normalized = allQuestions.map(normalizeQuestionData);

  // 4. If Mixed Mode (Term Prep), Shuffle and Slice 20
  if (isMixedMode) {
    normalized.sort(() => Math.random() - 0.5);
    return normalized.slice(0, 20);
  }

  // Single mode: return all
  return normalized;
}

// =============================================================
// SAVE RESULT — OPTIMIZED VIA DYNAMIC IMPORTS
// =============================================================
export async function saveResult(result) {
  const user = getAuthUser();
  if (!user) return;

  try {
    // Speed Hack: Load Firebase Firestore only when needed
    const { 
      collection, addDoc, serverTimestamp 
    } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
    
    const { db } = getInitializedClients();

    const data = {
      user_id: user.uid,
      email: user.email,
      chapter: result.topicSlug || result.topic || "Unknown",
      difficulty: result.difficulty,
      score: result.score,
      total: result.total,
      percentage: Math.round((result.score / result.total) * 100),
      timestamp: serverTimestamp(),

      // New Fields for Telemetry & Term Prep
      quiz_mode: result.quiz_mode || "standard",
      latency_vector: result.latency_vector || [],
      term_id: result.term_id || null,
      class_id: result.classId || "9" // Default to 9 as per context
    };

    await addDoc(collection(db, "quiz_scores"), data);

    logAnalyticsEvent("quiz_completed", { 
        topic: data.chapter,
        score: data.score,
        mode: data.quiz_mode,
        user_id: user.uid 
    });
  } catch (err) {
    console.warn("Save result failed (background task):", err);
  }
}

// =============================================================
// CHECK MASTERY — FORTRESS PHILOSOPHY
// =============================================================
export async function getChapterMastery(userId, topic) {
    if (!userId || !topic) return 0;

    try {
        const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
        const { db } = getInitializedClients();

        // We check mastery on 'Medium' difficulty to unlock 'Advanced'
        // If topic is mixed (Term Prep), mastery check might not apply or be different,
        // but this function is usually called for single chapter checks.

        const q = query(
            collection(db, "quiz_scores"),
            where("user_id", "==", userId),
            where("chapter", "==", topic),
            where("difficulty", "==", "Medium")
        );

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
        return 0; // Fail safe: assume 0 if error, locking the content
    }
}
