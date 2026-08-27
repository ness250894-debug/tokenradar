import * as fs from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  persistGitHubActionsSecret: vi.fn(),
  sendTelegramAlert: vi.fn(),
  sleep: vi.fn(),
  oauthRefreshToken: vi.fn(),
  events: [] as string[],
}));

vi.mock("@xdevplatform/xdk", () => ({
  Client: class MockClient {},
  OAuth2: class MockOAuth2 {
    refreshToken(token: string) {
      return dependencies.oauthRefreshToken(token);
    }
  },
}));

vi.mock("../src/lib/github-secret", () => ({
  persistGitHubActionsSecret: dependencies.persistGitHubActionsSecret,
}));

vi.mock("../src/lib/reporter", () => ({
  sendTelegramAlert: dependencies.sendTelegramAlert,
}));

vi.mock("../src/lib/shared-utils", () => ({
  sleep: dependencies.sleep,
}));

import {
  getLatestXRefreshToken,
  getXClient,
  persistXRefreshToken,
} from "../src/lib/x-client";

const environmentKeys = [
  "GITHUB_ACTIONS",
  "GH_TOKEN",
  "X_OAUTH2_CLIENT_ID",
  "X_OAUTH2_CLIENT_SECRET",
  "X_OAUTH2_REFRESH_TOKEN",
  "X_REFRESH_TOKEN_SECRET_ENVIRONMENT",
] as const;
const originalEnvironment = Object.fromEntries(
  environmentKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof environmentKeys)[number], string | undefined>;

describe("X refresh-token persistence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.GITHUB_ACTIONS = "true";
    process.env.GH_TOKEN = "github-writer-token";
    process.env.X_OAUTH2_CLIENT_ID = "x-client-id";
    process.env.X_OAUTH2_CLIENT_SECRET = "x-client-secret";
    process.env.X_OAUTH2_REFRESH_TOKEN = "current-x-refresh-token";
    process.env.X_REFRESH_TOKEN_SECRET_ENVIRONMENT = "social-automation";
    dependencies.events.length = 0;
  });

  afterEach(() => {
    for (const key of environmentKeys) {
      const originalValue = originalEnvironment[key];
      if (originalValue === undefined) delete process.env[key];
      else process.env[key] = originalValue;
    }
    vi.restoreAllMocks();
  });

  it("does not consume the active token when the environment-secret preflight fails", async () => {
    dependencies.persistGitHubActionsSecret.mockImplementation(() => {
      throw new Error("environment update denied");
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(getXClient()).rejects.toThrow(
      "Failed to persist the rotated X refresh token after 3 attempts",
    );

    expect(dependencies.persistGitHubActionsSecret).toHaveBeenCalledTimes(3);
    expect(dependencies.oauthRefreshToken).not.toHaveBeenCalled();
  });

  it("fails closed when X omits a replacement refresh token", async () => {
    dependencies.persistGitHubActionsSecret.mockImplementation(() => undefined);
    dependencies.oauthRefreshToken.mockResolvedValue({
      access_token: "short-lived-access-token",
      expires_in: 7_200,
    });
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    await expect(getXClient()).rejects.toThrow(
      "returned no replacement refresh token; refusing to publish",
    );

    expect(dependencies.persistGitHubActionsSecret).toHaveBeenCalledTimes(1);
    expect(dependencies.oauthRefreshToken).toHaveBeenCalledWith("current-x-refresh-token");
  });

  it("preflights the active environment token before exchanging it, then persists the replacement", async () => {
    dependencies.persistGitHubActionsSecret.mockImplementation((
      _name: string,
      value: string,
    ) => {
      dependencies.events.push(`persist:${value}`);
    });
    dependencies.oauthRefreshToken.mockImplementation(async (value: string) => {
      dependencies.events.push(`refresh:${value}`);
      return {
        access_token: "short-lived-access-token",
        refresh_token: "replacement-x-refresh-token",
        expires_in: 7_200,
      };
    });
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    await getXClient();

    expect(dependencies.events).toEqual([
      "persist:current-x-refresh-token",
      "refresh:current-x-refresh-token",
      "persist:replacement-x-refresh-token",
    ]);
  });

  it("never reads .env.local in GitHub Actions", async () => {
    const readSpy = vi.spyOn(fs.promises, "readFile");

    await expect(getLatestXRefreshToken("environment-refresh-token"))
      .resolves.toBe("environment-refresh-token");
    expect(readSpy).not.toHaveBeenCalled();
  });

  it("persists to the serialized environment before returning without printing the token", async () => {
    const rotatedToken = "rotated-x-secret-that-must-never-reach-stdout";
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await persistXRefreshToken(rotatedToken);

    expect(dependencies.persistGitHubActionsSecret).toHaveBeenCalledWith(
      "X_OAUTH2_REFRESH_TOKEN",
      rotatedToken,
      process.env,
      undefined,
      { environment: "social-automation" },
    );
    const renderedOutput = [...infoSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map((value) => String(value))
      .join("\n");
    expect(renderedOutput).not.toContain(rotatedToken);
    expect(renderedOutput).not.toContain("::add-mask::");
  });

  it("retries a failed secret update and succeeds before allowing publication", async () => {
    dependencies.persistGitHubActionsSecret
      .mockImplementationOnce(() => {
        throw new Error("temporary GitHub API failure");
      })
      .mockImplementationOnce(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    await persistXRefreshToken("retry-safe-rotated-token");

    expect(dependencies.persistGitHubActionsSecret).toHaveBeenCalledTimes(2);
    expect(dependencies.sleep).toHaveBeenCalledWith(1_000);
  });

  it("fails after three replacement-write attempts, alerts, and never logs the token", async () => {
    const rotatedToken = "replacement-token-that-must-stay-private";
    dependencies.persistGitHubActionsSecret.mockImplementation(() => {
      throw new Error(`GitHub rejected ${rotatedToken}`);
    });
    dependencies.sendTelegramAlert.mockResolvedValue(true);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(persistXRefreshToken(rotatedToken)).rejects.toThrow(
      "Failed to persist the rotated X refresh token after 3 attempts",
    );

    expect(dependencies.persistGitHubActionsSecret).toHaveBeenCalledTimes(3);
    expect(dependencies.sendTelegramAlert).toHaveBeenCalledTimes(1);
    const renderedOutput = [...infoSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map((value) => String(value))
      .join("\n");
    expect(renderedOutput).not.toContain(rotatedToken);
    expect(JSON.stringify(dependencies.sendTelegramAlert.mock.calls)).not.toContain(rotatedToken);
  });
});
