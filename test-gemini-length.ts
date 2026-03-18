import { generateTokenSummary } from "./src/lib/gemini";

async function test() {
  const summary = await generateTokenSummary(
    "Bitcoin",
    "BTC",
    "Bitcoin is a decentralized digital currency, without a central bank or single administrator, that can be sent from user to user on the peer-to-peer bitcoin network without the need for intermediaries.",
    { riskScore: 2, growthPotentialIndex: 4 }
  );
  console.log("Summary Length:", summary.length);
  console.log("Summary Preview:", summary.substring(0, 500));
}

test();
