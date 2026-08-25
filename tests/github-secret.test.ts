import type { execFileSync } from "child_process";

import { afterEach, describe, expect, it, vi } from "vitest";

import { persistGitHubActionsSecret } from "../src/lib/github-secret";

describe("GitHub Actions secret persistence", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes the secret through stdin instead of process arguments", () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const execFile = vi.fn(() => Buffer.from("")) as unknown as typeof execFileSync;

    persistGitHubActionsSecret(
      "IG_ACCESS_TOKEN",
      "new-sensitive-token",
      { GH_TOKEN: "github-token" },
      execFile,
    );

    expect(execFile).toHaveBeenCalledTimes(1);
    const [, args, options] = (execFile as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args).toEqual(["secret", "set", "IG_ACCESS_TOKEN"]);
    expect(args).not.toContain("new-sensitive-token");
    expect(options).toMatchObject({
      input: "new-sensitive-token",
      env: { GH_TOKEN: "github-token" },
    });
  });

  it("fails closed when GH_TOKEN is missing", () => {
    const execFile = vi.fn(() => Buffer.from("")) as unknown as typeof execFileSync;

    expect(() => persistGitHubActionsSecret(
      "IG_ACCESS_TOKEN",
      "new-sensitive-token",
      {},
      execFile,
    )).toThrow("GH_TOKEN is required");
    expect(execFile).not.toHaveBeenCalled();
  });

  it("propagates gh failures instead of reporting a successful refresh", () => {
    const execFile = vi.fn(() => {
      throw new Error("permission denied");
    }) as unknown as typeof execFileSync;

    expect(() => persistGitHubActionsSecret(
      "IG_ACCESS_TOKEN",
      "new-sensitive-token",
      { GH_TOKEN: "github-token" },
      execFile,
    )).toThrow("Failed to persist IG_ACCESS_TOKEN");
  });
});
