import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  maintainInstagramAccessToken: vi.fn(),
  maintainThreadsAccessToken: vi.fn(),
  persistGitHubActionsSecret: vi.fn(),
  logError: vi.fn(),
  sendTelegramAlert: vi.fn(),
}));

vi.mock("../src/lib/meta-token-maintenance", () => ({
  maintainInstagramAccessToken: dependencies.maintainInstagramAccessToken,
  maintainThreadsAccessToken: dependencies.maintainThreadsAccessToken,
}));

vi.mock("../src/lib/github-secret", () => ({
  persistGitHubActionsSecret: dependencies.persistGitHubActionsSecret,
}));

vi.mock("../src/lib/utils", () => ({
  formatErrorForLog: (error: unknown) => error instanceof Error ? error.message : String(error),
  loadEnv: vi.fn(),
}));

vi.mock("../src/lib/reporter", () => ({
  logError: dependencies.logError,
  sendTelegramAlert: dependencies.sendTelegramAlert,
}));

import {
  runMetaTokenMaintenance,
  runMetaTokenMaintenanceCommand,
} from "../scripts/refresh-meta-tokens";

const originalArgv = [...process.argv];

describe("Meta token maintenance command output", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.argv = originalArgv.filter((argument) => argument !== "--dry-run");
    process.env.IG_AUTH_MODE = "instagram_login";
    process.env.IG_ACCESS_TOKEN = "existing-instagram-token";
    process.env.IG_ACCOUNT_ID = "178414000000001";
    process.env.THREADS_ACCESS_TOKEN = "existing-threads-token";
    process.env.THREADS_ACCOUNT_ID = "threads-user";
    process.env.GH_TOKEN = "github-token";
    process.env.GITHUB_ACTIONS = "true";
    dependencies.maintainInstagramAccessToken.mockResolvedValue({
      status: "healthy",
      detail: "Instagram token is healthy.",
    });
    dependencies.maintainThreadsAccessToken.mockResolvedValue({
      status: "healthy",
      detail: "Threads token is healthy.",
    });
    dependencies.sendTelegramAlert.mockResolvedValue(true);
  });

  afterEach(() => {
    process.argv = [...originalArgv];
    delete process.env.IG_AUTH_MODE;
    delete process.env.IG_ACCESS_TOKEN;
    delete process.env.IG_ACCOUNT_ID;
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.THREADS_ACCESS_TOKEN;
    delete process.env.THREADS_ACCOUNT_ID;
    vi.restoreAllMocks();
  });

  it("persists a renewed token locally without printing the token or an add-mask command", async () => {
    const renewedToken = "fresh-secret-that-must-not-reach-stdout";
    dependencies.maintainInstagramAccessToken.mockResolvedValue({
      status: "refreshed",
      accessToken: renewedToken,
      expiresIn: 60 * 24 * 60 * 60,
      detail: "Renewed _Instagram_ token [safely]\n(`60 days`).",
    });
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const results = await runMetaTokenMaintenance();

    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ platform: "Instagram", status: "refreshed" }),
    ]));
    expect(dependencies.persistGitHubActionsSecret).toHaveBeenCalledWith(
      "IG_ACCESS_TOKEN",
      renewedToken,
      process.env,
    );

    const renderedOutput = infoSpy.mock.calls
      .flat()
      .map((value) => String(value))
      .join("\n");
    expect(renderedOutput).not.toContain(renewedToken);
    expect(renderedOutput).not.toContain("::add-mask::");
    expect(dependencies.sendTelegramAlert).toHaveBeenCalledWith(
      expect.stringContaining(
        "Renewed _Instagram_ token [safely] (`60 days`).",
      ),
      { parseMode: "plain" },
    );
  });

  it.each([
    {
      envTokenKey: "IG_ACCESS_TOKEN",
      platform: "Instagram",
      maintenance: dependencies.maintainInstagramAccessToken,
    },
    {
      envTokenKey: "THREADS_ACCESS_TOKEN",
      platform: "Threads",
      maintenance: dependencies.maintainThreadsAccessToken,
    },
  ])("treats a missing $envTokenKey as a $platform failure", async ({
    envTokenKey,
    platform,
    maintenance,
  }) => {
    delete process.env[envTokenKey];
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const results = await runMetaTokenMaintenance();

    expect(results).toEqual(expect.arrayContaining([{
      platform,
      status: "failed",
      error: `${envTokenKey} is required for Meta token maintenance.`,
    }]));
    expect(maintenance).not.toHaveBeenCalled();
    expect(dependencies.sendTelegramAlert).toHaveBeenCalledOnce();
    expect(dependencies.sendTelegramAlert).toHaveBeenCalledWith(
      expect.stringContaining(`${platform}: failed`),
      { parseMode: "plain" },
    );
  });

  it("reports missing tokens as failures in dry-run mode", async () => {
    process.argv = [...process.argv, "--dry-run"];
    delete process.env.IG_ACCESS_TOKEN;
    delete process.env.THREADS_ACCESS_TOKEN;
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const results = await runMetaTokenMaintenance();

    expect(results).toEqual([
      {
        platform: "Instagram",
        status: "failed",
        error: "IG_ACCESS_TOKEN is required for Meta token maintenance.",
      },
      {
        platform: "Threads",
        status: "failed",
        error: "THREADS_ACCESS_TOKEN is required for Meta token maintenance.",
      },
    ]);
    expect(dependencies.maintainInstagramAccessToken).not.toHaveBeenCalled();
    expect(dependencies.maintainThreadsAccessToken).not.toHaveBeenCalled();
  });

  it("returns a nonzero command status without sending a redundant fatal alert", async () => {
    delete process.env.IG_ACCESS_TOKEN;
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const exitCode = await runMetaTokenMaintenanceCommand();

    expect(exitCode).toBe(1);
    expect(dependencies.sendTelegramAlert).toHaveBeenCalledOnce();
    expect(dependencies.logError).not.toHaveBeenCalled();
  });
});
