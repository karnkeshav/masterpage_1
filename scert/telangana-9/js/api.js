// js/api.js
// Optimized for high-speed Supabase reads and lazy-loaded Firestore writes
import { getInitializedClients, getAuthUser, logAnalyticsEvent } from "./config.js";

/**
 * Builds the database-friendly table name
 */
function getTableName(topic) {
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
// FETCH QUESTIONS — OPTIMIZED FOR MOBILE SPEED
// =============================================================
export async function fetchQuestions(topic, difficulty) {
  const { supabase } = getInitializedClients();
  const table = getTableName(topic);
  
  // Use exact match for difficulty to leverage DB indexing (faster than ilike)
  const cleanDiff = (difficulty || "Simple").trim();

  // Fetch only necessary fields to keep network payload minimal
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
    console.error("❌ SUPABASE ERROR:", error);
    throw new Error(error.message);
  }

  if (!data || !data.length) {
    throw new Error(`No questions found matching "${difficulty}" for this chapter.`);
  }

  // Map and Normalize in one single pass before returning to the engine
  return data.map(normalizeQuestionData);
}

// =============================================================
// SAVE RESULT — OPTIMIZED VIA DYNAMIC IMPORTS
// =============================================================
export async function saveResult(result) {
  const user = getAuthUser();
  if (!user) return;

  try {
    // Speed Hack: Load Firebase Firestore only when needed (saves 100kb+ at load)
    const { 
      collection, addDoc, serverTimestamp 
    } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
    
    const { db } = getInitializedClients();

    await addDoc(collection(db, "quiz_scores"), {
      user_id: user.uid,
      email: user.email,
      chapter: result.topicSlug || result.topic || "Unknown",
      difficulty: result.difficulty,
      score: result.score,
      total: result.total,
      percentage: Math.round((result.score / result.total) * 100),
      timestamp: serverTimestamp()
    });

    logAnalyticsEvent("quiz_completed", { 
        topic: result.topicSlug, 
        score: result.score,
        user_id: user.uid 
    });
  } catch (err) {
    console.warn("Save result failed (background task):", err);
  }
}
