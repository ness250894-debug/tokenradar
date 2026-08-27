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
      timeout: 30_000,
      killSignal: "SIGTERM",
      maxBuffer: 1_048_576,
    });
    expect(options.env).not.toHaveProperty("X_OAUTH2_REFRESH_TOKEN");
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

  it("targets an environment secret without putting the value in arguments", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const execFile = vi.fn(() => Buffer.from("")) as unknown as typeof execFileSync;

    persistGitHubActionsSecret(
      "X_OAUTH2_REFRESH_TOKEN",
      "rotated-sensitive-token",
      {
        GH_TOKEN: "github-token",
        GITHUB_REPOSITORY: "owner/repository",
        X_OAUTH2_REFRESH_TOKEN: "must-not-enter-child-env",
        UNRELATED_SECRET: "also-must-not-enter-child-env",
      },
      execFile,
      { environment: "social-automation" },
    );

    const [, args, options] = (execFile as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args).toEqual([
      "secret",
      "set",
      "X_OAUTH2_REFRESH_TOKEN",
      "--env",
      "social-automation",
    ]);
    expect(args).not.toContain("rotated-sensitive-token");
    expect(options).toMatchObject({
      input: "rotated-sensitive-token",
      env: {
        GH_TOKEN: "github-token",
        GH_REPO: "owner/repository",
      },
    });
    expect(options.env).not.toHaveProperty("X_OAUTH2_REFRESH_TOKEN");
    expect(options.env).not.toHaveProperty("UNRELATED_SECRET");
    expect(infoSpy.mock.calls.flat().join("\n")).not.toContain("rotated-sensitive-token");
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

  it("removes the secret value from gh failure messages", () => {
    const secretValue = "sensitive-value-returned-by-gh";
    const execFile = vi.fn(() => {
      throw new Error(`request failed while handling ${secretValue}`);
    }) as unknown as typeof execFileSync;

    expect(() => persistGitHubActionsSecret(
      "X_OAUTH2_REFRESH_TOKEN",
      secretValue,
      { GH_TOKEN: "github-token" },
      execFile,
      { environment: "social-automation" },
    )).toThrow("[REDACTED:SECRET_VALUE]");

    try {
      persistGitHubActionsSecret(
        "X_OAUTH2_REFRESH_TOKEN",
        secretValue,
        { GH_TOKEN: "github-token" },
        execFile,
        { environment: "social-automation" },
      );
    } catch (error) {
      expect(String(error)).not.toContain(secretValue);
    }
  });
});
