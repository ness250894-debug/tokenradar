/**
 * Remotion Dependency Alignment Validator
 *
 * Ensures all installed @remotion/* packages and remotion share the exact same version.
 * Permits compatible security patch versions of extra packages (e.g. zod >= 4.5.4
 * to satisfy GHSA-mrhx-c7xc-m3w5) while strictly catching Remotion version drift.
 */
import { execFileSync, execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

/**
 * Evaluate stdout/stderr output from `npx remotion versions`.
 * Throws an Error on any Remotion core version mismatch or unpermitted extra-package mismatch.
 */
export function assertRemotionAlignmentOutput(stdout: string, stderr: string): string[] {
  // Note: `remotion versions` writes headers like "Extra packages have incorrect versions:"
  // to stderr while writing the bullet list (`- zod: installed ...`) to stdout.
  const combined = `${stderr}\n${stdout}`;
  const permittedOverrides: string[] = [];

  if (combined.includes("Version mismatch: Not all Remotion packages have the same version")) {
    throw new Error("Remotion package version mismatch detected across @remotion packages.");
  }

  if (combined.includes("No Remotion packages found")) {
    throw new Error("No Remotion packages found in project.");
  }

  if (combined.includes("Extra packages have incorrect versions:")) {
    const bulletLines = combined
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^-\s+[^:]+:\s*installed\s+[0-9.]+,\s*required\s+[0-9.]+/.test(line));

    if (bulletLines.length === 0) {
      throw new Error("Remotion reported extra package mismatches without parseable package lines.");
    }

    for (const line of bulletLines) {
      const match = line.match(/^-\s+([^:]+):\s*installed\s+([0-9.]+),\s*required\s+([0-9.]+)/);
      if (!match) continue;

      const [, pkg, installed, required] = match;
      const [instMajor, instMinor] = installed.split(".").map(Number);
      const [reqMajor, reqMinor] = required.split(".").map(Number);

      if (
        pkg === "zod" &&
        (instMajor > reqMajor || (instMajor === reqMajor && instMinor >= reqMinor))
      ) {
        permittedOverrides.push(
          `Permitted extra package override: ${pkg}@${installed} (satisfies security patch >= ${required})`,
        );
        continue;
      }

      throw new Error(`Unexpected extra package version: ${line}`);
    }
  }

  return permittedOverrides;
}

export function validateRemotionAlignment(): void {
  console.log("Validating Remotion dependency alignment...");
  let stdout = "";
  let stderr = "";

  const remotionCliPath = path.resolve(process.cwd(), "node_modules/@remotion/cli/remotion-cli.js");

  try {
    stdout = fs.existsSync(remotionCliPath)
      ? execFileSync(process.execPath, [remotionCliPath, "versions"], {
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "pipe"],
        })
      : execSync("npx remotion versions", {
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "pipe"],
        });
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; status?: number };
    stdout = error.stdout ?? "";
    stderr = error.stderr ?? "";
  }

  const displayOutput = `${stdout}\n${stderr}`.trim();
  if (displayOutput) {
    console.log(displayOutput);
  }

  try {
    const permitted = assertRemotionAlignmentOutput(stdout, stderr);
    for (const note of permitted) {
      console.log(`ℹ️ ${note}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ ${message}`);
    process.exit(1);
  }

  console.log("✅ Remotion dependency alignment successfully verified.");
}

if (require.main === module) {
  validateRemotionAlignment();
}
