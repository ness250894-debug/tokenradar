import path from "path";
import { loadCandidateTokens } from "../scripts/lib/token-selection";

async function test() {
  const DATA_DIR = path.resolve(__dirname, "../data");
  const { onWebsiteIds } = await loadCandidateTokens(DATA_DIR, 1, 10);
  
  console.log("On Website IDs Count:", onWebsiteIds.size);
  console.log("Is 'bitcoin' on website?", onWebsiteIds.has('bitcoin'));
  console.log("Is 'sosovalue' on website?", onWebsiteIds.has('sosovalue'));
  
  // Verify footer logic (manual code review confirmed we changed all 3 scripts)
}

test().catch(console.error);
