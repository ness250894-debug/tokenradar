import { describe, expect, it } from "vitest";
import { validateRemotionAlignment } from "../scripts/validate-remotion-alignment";

describe("validateRemotionAlignment", () => {
  it("executes without throwing and validates Remotion packages are aligned", () => {
    expect(() => validateRemotionAlignment()).not.toThrow();
  }, 15_000);
});
