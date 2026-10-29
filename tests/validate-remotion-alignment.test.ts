import { describe, expect, it } from "vitest";
import {
  assertRemotionAlignmentOutput,
  validateRemotionAlignment,
} from "../scripts/validate-remotion-alignment";

describe("validateRemotionAlignment", () => {
  it("permits zod >= required security override when header is on stderr and bullets are on stdout", () => {
    const stdout = [
      "4.0.523",
      "- @remotion/cli",
      "- remotion",
      "- zod: installed 4.6.7, required 4.5.4",
    ].join("\n");
    const stderr = "Extra packages have incorrect versions:\nTo fix this issue, run: npx remotion versions --fix";

    const notes = assertRemotionAlignmentOutput(stdout, stderr);
    expect(notes).toEqual([
      "Permitted extra package override: zod@4.6.7 (satisfies security patch >= 4.5.4)",
    ]);
  });

  it("rejects unexpected extra package mismatches even when stdout/stderr are split", () => {
    const stdout = "- react: installed 18.2.0, required 19.3.0\n";
    const stderr = "Extra packages have incorrect versions:\n";

    expect(() => assertRemotionAlignmentOutput(stdout, stderr)).toThrow(
      "Unexpected extra package version: - react: installed 18.2.0, required 19.3.0",
    );
  });

  it("rejects @remotion core version mismatches", () => {
    expect(() =>
      assertRemotionAlignmentOutput(
        "",
        "Version mismatch: Not all Remotion packages have the same version",
      ),
    ).toThrow("Remotion package version mismatch detected");
  });

  it("executes without throwing and validates installed Remotion packages are aligned", () => {
    expect(() => validateRemotionAlignment()).not.toThrow();
  }, 90_000);
});
