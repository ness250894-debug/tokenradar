import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchR2AccountMetrics,
  formatR2AccountMetricsFailure,
  loadR2MetricsConfig,
} from "../scripts/snapshot-cloudflare-usage";

const ENV_KEYS = [
  "CLOUDFLARE_API_BASE_URL",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_R2_METRICS_API_TOKEN",
  "R2_ACCOUNT_ID",
] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

describe("Cloudflare usage snapshot R2 account metrics", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.restoreAllMocks();
  });

  it("keeps account-wide R2 metrics disabled without a dedicated token", () => {
    process.env.R2_ACCOUNT_ID = "r2-account";
    process.env.CLOUDFLARE_API_TOKEN = "d1-token";

    expect(loadR2MetricsConfig()).toBeNull();
  });

  it("requires R2_ACCOUNT_ID when the dedicated metrics token is configured", () => {
    process.env.CLOUDFLARE_R2_METRICS_API_TOKEN = "r2-read-token";

    expect(() => loadR2MetricsConfig()).toThrow("R2_ACCOUNT_ID is missing");
  });

  it("uses only the dedicated read token and R2 account for account metrics", async () => {
    process.env.CLOUDFLARE_API_TOKEN = "d1-token-must-not-be-used";
    process.env.CLOUDFLARE_R2_METRICS_API_TOKEN = "r2-read-token";
    process.env.R2_ACCOUNT_ID = "r2-account";
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          result: {
            standard: {
              published: { payloadSize: 100, metadataSize: 5, objects: 3 },
              uploaded: { payloadSize: 23, metadataSize: 2, objects: 1 },
            },
            infrequentAccess: {
              published: { payloadSize: 0, metadataSize: 0, objects: 0 },
              uploaded: { payloadSize: 0, metadataSize: 0, objects: 0 },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const config = loadR2MetricsConfig();
    expect(config).not.toBeNull();
    const result = await fetchR2AccountMetrics(config!, fetchMock);

    expect(result).toEqual({
      standard: {
        published: { payloadSize: 100, metadataSize: 5, objects: 3 },
        uploaded: { payloadSize: 23, metadataSize: 2, objects: 1 },
      },
      infrequentAccess: {
        published: { payloadSize: 0, metadataSize: 0, objects: 0 },
        uploaded: { payloadSize: 0, metadataSize: 0, objects: 0 },
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/r2-account/r2/metrics",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer r2-read-token",
          "Content-Type": "application/json",
        },
      }),
    );
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("d1-token-must-not-be-used");
  });

  it("rejects a successful response without an R2 metrics result object", async () => {
    const config = {
      accountId: "r2-account",
      apiToken: "r2-read-token",
      apiBaseUrl: "https://api.cloudflare.com/client/v4",
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(fetchR2AccountMetrics(config, fetchMock))
      .rejects.toThrow("missing a valid result object");
  });

  it("returns an actionable permission error without exposing token values", async () => {
    const config = {
      accountId: "r2-account",
      apiToken: "super-secret-token",
      apiBaseUrl: "https://api.cloudflare.com/client/v4",
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({ success: false, errors: [{ message: "Authentication error" }] }),
        { status: 403, statusText: "Forbidden", headers: { "Content-Type": "application/json" } },
      ),
    );

    let failure: unknown;
    try {
      await fetchR2AccountMetrics(config, fetchMock);
    } catch (error) {
      failure = error;
    }
    const message = formatR2AccountMetricsFailure(failure);

    expect(message).toContain("Cloudflare API request failed (403): Authentication error");
    expect(message).toContain("Workers R2 Storage Read");
    expect(message).toContain("R2_ACCOUNT_ID");
    expect(message).toContain("Bucket-level S3 metrics are handled separately");
    expect(message).not.toContain(config.apiToken);
  });
});
