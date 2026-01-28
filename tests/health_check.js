
import { loadCurriculum } from "../js/curriculum/loader.js";
import { saveMistakes, getChapterMastery } from "../js/api.js";
import { routeUser } from "../js/auth-paywall.js";

console.log("Starting Health Check...");

// 1. Verify Loader
try {
    const c9 = await loadCurriculum(9);
    if (c9 && c9.Science) console.log("✅ Curriculum Loader: Success");
    else console.error("❌ Curriculum Loader: Failed structure");
} catch (e) {
    console.error("❌ Curriculum Loader: Error", e);
}

// 2. Verify API Exports
if (typeof saveMistakes === 'function') console.log("✅ API saveMistakes: Exported");
else console.error("❌ API saveMistakes: Missing");

if (typeof getChapterMastery === 'function') console.log("✅ API getChapterMastery: Exported");
else console.error("❌ API getChapterMastery: Missing");

// 3. Verify Auth Routing
if (typeof routeUser === 'function') console.log("✅ Auth routeUser: Exported");
else console.error("❌ Auth routeUser: Missing");

console.log("Health Check Complete.");
