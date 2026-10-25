/**
 * Remotion Dependency Alignment Validator
 *
 * Ensures all installed @remotion/* packages and remotion share the exact same version.
 * Permits compatible security patch versions of extra packages (e.g. zod >= 4.5.4
 * to satisfy GHSA-mrhx-c7xc-m3w5) while strictly catching Remotion version drift.
 */
import { execSync } from "child_process";

export function validateRemotionAlignment(): void {
  console.log("Validating Remotion dependency alignment...");
  let stdout = "";
  let stderr = "";

  try {
    stdout = execSync("npx remotion versions", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; status?: number };
    stdout = error.stdout ?? "";
    stderr = error.stderr ?? "";
  }

  const combined = `${stdout}\n${stderr}`;
  console.log(combined.trim());

  if (combined.includes("Version mismatch: Not all Remotion packages have the same version")) {
    console.error("❌ Remotion package version mismatch detected across @remotion packages.");
    process.exit(1);
  }

  if (combined.includes("No Remotion packages found")) {
    console.error("❌ No Remotion packages found in project.");
    process.exit(1);
  }

  // Check extra packages
  const extraPackagesMatch = combined.match(/Extra packages have incorrect versions:\s*([\s\S]*?)(?:\n\n|\nTo fix|$)/);
  if (extraPackagesMatch) {
    const lines = extraPackagesMatch[1]
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("- "));

    for (const line of lines) {
      // Example line: "- zod: installed 4.6.7, required 4.5.4"
      const match = line.match(/- ([^:]+):\s*installed\s+([0-9.]+),\s*required\s+([0-9.]+)/);
      if (match) {
        const [, pkg, installed, required] = match;
        // Permit zod >= 4.5.4 for security patches (e.g. GHSA-mrhx-c7xc-m3w5)
        const [instMajor, instMinor] = installed.split(".").map(Number);
        const [reqMajor, reqMinor] = required.split(".").map(Number);
        if (
          pkg === "zod" &&
          (instMajor > reqMajor || (instMajor === reqMajor && instMinor >= reqMinor))
        ) {
          console.log(
            `ℹ️ Permitted extra package override: ${pkg}@${installed} (satisfies security patch >= ${required})`
          );
          continue;
        }
        console.error(`❌ Unexpected extra package version: ${line}`);
        process.exit(1);
      }
    }
  }

  console.log("✅ Remotion dependency alignment successfully verified.");
}

if (require.main === module) {
  validateRemotionAlignment();
}
