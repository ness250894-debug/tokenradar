import { describe, expect, it, vi } from "vitest";

import {
  maintainInstagramAccessToken,
  maintainThreadsAccessToken,
  type MetaTokenEnvironment,
} from "../src/lib/meta-token-maintenance";

const SIXTY_DAYS_SECONDS = 60 * 24 * 60 * 60;
const INSTAGRAM_LOGIN_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_insights",
];
const FACEBOOK_LOGIN_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_read_engagement",
  "instagram_manage_insights",
];
const THREADS_SCOPES = [
  "threads_basic",
  "threads_content_publish",
  "threads_manage_insights",
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestUrl(fetchMock: ReturnType<typeof vi.fn>, callIndex: number): URL {
  const input = fetchMock.mock.calls[callIndex][0] as URL | Request | string;
  return new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );
}

function matchingRequestUrl(
  urls: URL[],
  predicate: (url: URL) => boolean,
  description: string,
): URL {
  const match = urls.find(predicate);
  if (!match) throw new Error(`Expected request was not made: ${description}`);
  return match;
}

function instagramLoginEnvironment(
  overrides: MetaTokenEnvironment = {},
): MetaTokenEnvironment {
  return {
    IG_AUTH_MODE: "instagram_login",
    IG_ACCOUNT_ID: "178414000000001",
    META_APP_ID: "meta-app-id",
    META_APP_SECRET: "meta-app-secret",
    ...overrides,
  };
}

function facebookLoginEnvironment(
  overrides: MetaTokenEnvironment = {},
): MetaTokenEnvironment {
  return {
    IG_AUTH_MODE: "facebook_login",
    IG_ACCOUNT_ID: "178414000000001",
    META_APP_ID: "meta-app-id",
    META_APP_SECRET: "meta-app-secret",
    ...overrides,
  };
}

function threadsEnvironment(
  overrides: MetaTokenEnvironment & { THREADS_ACCOUNT_ID?: string } = {},
): MetaTokenEnvironment & { THREADS_ACCOUNT_ID?: string } {
  return {
    THREADS_ACCOUNT_ID: "threads-user",
    ...overrides,
  };
}

function facebookUserPageDiscoveryFetchMock(
  pageDiscoveryPayload: unknown,
): typeof fetch {
  const fetchMock = vi.fn<typeof fetch>();
  const payloads = [
    {
      data: {
        app_id: "meta-app-id",
        type: "USER",
        is_valid: true,
        expires_at: 1_800_000_000,
        scopes: [...FACEBOOK_LOGIN_SCOPES, "pages_show_list"],
      },
    },
    {
      id: "178414000000001",
      username: "tokenradar",
    },
    { data: [{ quota_usage: 1 }] },
    { data: [{ name: "reach", values: [] }] },
    {
      access_token: "long-lived-user-token",
      expires_in: SIXTY_DAYS_SECONDS,
    },
    pageDiscoveryPayload,
  ];
  for (const payload of payloads) {
    fetchMock.mockResolvedValueOnce(jsonResponse(payload));
  }
  return fetchMock;
}

describe("Instagram Login token maintenance", () => {
  it("validates identity, uses ig_refresh_token, and validates the renewed token", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(input instanceof URL ? input.href : String(input));
      if (url.hostname === "graph.instagram.com" && url.pathname === "/v25.0/me") {
        return jsonResponse({
          user_id: "178414000000001",
          username: "tokenradar",
        });
      }
      if (url.hostname === "graph.facebook.com" && url.pathname === "/v25.0/debug_token") {
        return jsonResponse({
          data: {
            app_id: "meta-app-id",
            type: "USER",
            is_valid: true,
            expires_at: 1_800_000_000,
            scopes: INSTAGRAM_LOGIN_SCOPES,
          },
        });
      }
      if (url.hostname === "graph.instagram.com" && url.pathname === "/refresh_access_token") {
        return jsonResponse({
          access_token: "renewed-instagram-token",
          token_type: "bearer",
          expires_in: SIXTY_DAYS_SECONDS,
        });
      }
      throw new Error(`Unexpected Meta request: ${url.href}`);
    });

    const result = await maintainInstagramAccessToken(
      "current-instagram-token",
      instagramLoginEnvironment(),
      fetchMock,
    );

    expect(result).toEqual({
      status: "refreshed",
      accessToken: "renewed-instagram-token",
      expiresIn: SIXTY_DAYS_SECONDS,
      detail: "Renewed the Instagram Login token for 60 days.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);

    const requestUrls = fetchMock.mock.calls.map((_, index) => requestUrl(fetchMock, index));
    const initialValidation = matchingRequestUrl(requestUrls,
      (url) => url.pathname === "/v25.0/me" &&
        url.searchParams.get("access_token") === "current-instagram-token",
      "current Instagram token validation",
    );
    expect(`${initialValidation.origin}${initialValidation.pathname}`).toBe(
      "https://graph.instagram.com/v25.0/me",
    );
    expect(initialValidation.searchParams.get("fields")).toBe("user_id,username");
    expect(initialValidation.searchParams.get("access_token")).toBe(
      "current-instagram-token",
    );

    const refresh = matchingRequestUrl(
      requestUrls,
      (url) => url.pathname === "/refresh_access_token",
      "Instagram token refresh",
    );
    expect(`${refresh.origin}${refresh.pathname}`).toBe(
      "https://graph.instagram.com/refresh_access_token",
    );
    expect(refresh.searchParams.get("grant_type")).toBe("ig_refresh_token");
    expect(refresh.searchParams.get("access_token")).toBe("current-instagram-token");

    const renewedValidation = matchingRequestUrl(requestUrls,
      (url) => url.pathname === "/v25.0/me" &&
        url.searchParams.get("access_token") === "renewed-instagram-token",
      "renewed Instagram token validation",
    );
    expect(renewedValidation.searchParams.get("access_token")).toBe(
      "renewed-instagram-token",
    );

    const inspections = requestUrls.filter((url) => url.pathname === "/v25.0/debug_token");
    expect(inspections).toHaveLength(2);
    expect(inspections.map((url) => url.searchParams.get("input_token"))).toEqual([
      "current-instagram-token",
      "renewed-instagram-token",
    ]);
    expect(inspections.every((url) =>
      url.searchParams.get("access_token") === "meta-app-id|meta-app-secret"
    )).toBe(true);
  });

  it("refuses a token for a different Instagram account before refreshing it", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          app_id: "meta-app-id",
          type: "USER",
          is_valid: true,
          scopes: INSTAGRAM_LOGIN_SCOPES,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        user_id: "178414999999999",
        username: "another_account",
      }));

    await expect(maintainInstagramAccessToken(
      "wrong-account-token",
      instagramLoginEnvironment(),
      fetchMock,
    )).rejects.toThrow(
      "belongs to account 178414999999999, not configured IG_ACCOUNT_ID 178414000000001",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses an identity response that omits user_id", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          app_id: "meta-app-id",
          type: "USER",
          is_valid: true,
          scopes: INSTAGRAM_LOGIN_SCOPES,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: "instagram-scoped-id",
        username: "tokenradar",
      }));

    await expect(maintainInstagramAccessToken(
      "identity-without-user-id",
      instagramLoginEnvironment(),
      fetchMock,
    )).rejects.toThrow("did not return user_id");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects an Instagram Login token missing an operational scope", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          app_id: "meta-app-id",
          type: "USER",
          is_valid: true,
          scopes: [
            "instagram_business_basic",
            "instagram_business_content_publish",
          ],
        },
      }));

    await expect(maintainInstagramAccessToken(
      "instagram-token-without-insights",
      instagramLoginEnvironment(),
      fetchMock,
    )).rejects.toThrow("instagram_business_manage_insights");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const inspection = requestUrl(fetchMock, 0);
    expect(inspection.pathname).toBe("/v25.0/debug_token");
    expect(inspection.searchParams.get("input_token")).toBe(
      "instagram-token-without-insights",
    );
    expect(inspection.searchParams.get("access_token")).toBe(
      "meta-app-id|meta-app-secret",
    );
  });

  it("treats Meta's less-than-24-hours response as a valid skipped refresh", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          app_id: "meta-app-id",
          type: "USER",
          is_valid: true,
          scopes: INSTAGRAM_LOGIN_SCOPES,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        user_id: "178414000000001",
        username: "tokenradar",
      }))
      .mockResolvedValueOnce(jsonResponse({
        error: {
          message: "The access token must be at least 24 hours old to be refreshed.",
          type: "OAuthException",
          code: 100,
        },
      }, 400));

    await expect(maintainInstagramAccessToken(
      "brand-new-instagram-token",
      instagramLoginEnvironment(),
      fetchMock,
    )).resolves.toEqual({
      status: "skipped",
      detail: "Instagram Login token is valid but less than 24 hours old.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(requestUrl(fetchMock, 2).searchParams.get("grant_type")).toBe(
      "ig_refresh_token",
    );
  });
});

describe("Facebook Login token maintenance", () => {
  it("rejects a non-user token type that cannot be maintained durably", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({
      data: {
        app_id: "meta-app-id",
        type: "APP",
        is_valid: true,
        expires_at: 0,
        scopes: FACEBOOK_LOGIN_SCOPES,
      },
    }));

    await expect(maintainInstagramAccessToken(
      "facebook-app-token",
      facebookLoginEnvironment(),
      fetchMock,
    )).rejects.toThrow("token type APP is not durable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a Facebook Login token missing an operational scope", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({
      data: {
        app_id: "meta-app-id",
        type: "PAGE",
        is_valid: true,
        expires_at: 0,
        scopes: [
          "instagram_basic",
          "instagram_content_publish",
          "pages_read_engagement",
        ],
      },
    }));

    await expect(maintainInstagramAccessToken(
      "facebook-token-without-insights",
      facebookLoginEnvironment(),
      fetchMock,
    )).rejects.toThrow("instagram_manage_insights");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("requires pages_show_list before converting a Facebook USER token", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({
      data: {
        app_id: "meta-app-id",
        type: "USER",
        is_valid: true,
        expires_at: 1_800_000_000,
        scopes: FACEBOOK_LOGIN_SCOPES,
      },
    }));

    await expect(maintainInstagramAccessToken(
      "facebook-user-without-page-list",
      facebookLoginEnvironment(),
      fetchMock,
    )).rejects.toThrow("pages_show_list");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("distinguishes an empty managed Page list from a missing pages_show_list scope", async () => {
    const fetchMock = facebookUserPageDiscoveryFetchMock({ data: [] });

    await expect(maintainInstagramAccessToken(
      "facebook-user-token",
      facebookLoginEnvironment(),
      fetchMock,
    )).rejects.toThrow(
      "Facebook Page discovery returned no managed Pages even though pages_show_list is granted",
    );
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("reports managed Pages that are unrelated to the configured Instagram account", async () => {
    const fetchMock = facebookUserPageDiscoveryFetchMock({
      data: [
        {
          id: "unrelated-page-1",
          name: "Unrelated Page One",
          access_token: "unrelated-page-token-1",
          instagram_business_account: { id: "178414999999991" },
        },
        {
          id: "unrelated-page-2",
          name: "Unrelated Page Two",
          access_token: "unrelated-page-token-2",
          instagram_business_account: { id: "178414999999992" },
        },
      ],
    });

    const error = await maintainInstagramAccessToken(
      "facebook-user-token",
      facebookLoginEnvironment(),
      fetchMock,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain(
      "returned 2 managed Pages, but none is linked to the configured Instagram account",
    );
    expect(message).toContain("granular access");
    expect(message).not.toContain("unrelated-page-token");
    expect(message).not.toContain("Unrelated Page");
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("distinguishes a linked Page that omits its Page access token", async () => {
    const fetchMock = facebookUserPageDiscoveryFetchMock({
      data: [{
        id: "tokenradar-page",
        name: "TokenRadar",
        tasks: ["CREATE_CONTENT", "ANALYZE"],
        instagram_business_account: { id: "178414000000001" },
      }],
    });

    await expect(maintainInstagramAccessToken(
      "facebook-user-token",
      facebookLoginEnvironment(),
      fetchMock,
    )).rejects.toThrow(
      "linked to the configured Instagram account was returned without a Page access token",
    );
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it.each(["CREATE_CONTENT", "ANALYZE"])(
    "rejects a linked Page that lacks the %s task",
    async (missingTask) => {
      const pageTasks = ["CREATE_CONTENT", "ANALYZE"].filter(
        (task) => task !== missingTask,
      );
      const fetchMock = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({
          data: {
            app_id: "meta-app-id",
            type: "USER",
            is_valid: true,
            expires_at: 1_800_000_000,
            scopes: [...FACEBOOK_LOGIN_SCOPES, "pages_show_list"],
          },
        }))
        .mockResolvedValueOnce(jsonResponse({
          id: "178414000000001",
          username: "tokenradar",
        }))
        .mockResolvedValueOnce(jsonResponse({ data: [{ quota_usage: 1 }] }))
        .mockResolvedValueOnce(jsonResponse({ data: [{ name: "reach", values: [] }] }))
        .mockResolvedValueOnce(jsonResponse({
          access_token: "long-lived-user-token",
          expires_in: SIXTY_DAYS_SECONDS,
        }))
        .mockResolvedValueOnce(jsonResponse({
          data: [{
            id: "tokenradar-page",
            name: "TokenRadar",
            access_token: "insufficient-page-token",
            instagram_business_account: { id: "178414000000001" },
            tasks: pageTasks,
          }],
        }));

      await expect(maintainInstagramAccessToken(
        "facebook-user-token",
        facebookLoginEnvironment(),
        fetchMock,
      )).rejects.toThrow(missingTask);
      expect(fetchMock).toHaveBeenCalledTimes(6);
    },
  );

  it("refuses to exchange a Facebook USER token that fails its current capability probe", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          app_id: "meta-app-id",
          type: "USER",
          is_valid: true,
          expires_at: 1_800_000_000,
          scopes: [...FACEBOOK_LOGIN_SCOPES, "pages_show_list"],
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: "178414000000001",
        username: "tokenradar",
      }))
      .mockResolvedValueOnce(jsonResponse({
        error: {
          message: "Current token cannot read the content-publishing limit",
          type: "OAuthException",
          code: 200,
        },
      }, 403));

    await expect(maintainInstagramAccessToken(
      "facebook-user-without-publishing-capability",
      facebookLoginEnvironment(),
      fetchMock,
    )).rejects.toThrow("Instagram content-publishing capability check failed");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map((_, index) => requestUrl(fetchMock, index).pathname))
      .not.toContain("/v25.0/oauth/access_token");
  });

  it("converts a Facebook USER token to its linked non-expiring PAGE token", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          app_id: "meta-app-id",
          type: "USER",
          is_valid: true,
          expires_at: 1_800_000_000,
          scopes: [...FACEBOOK_LOGIN_SCOPES, "pages_show_list"],
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: "178414000000001",
        username: "tokenradar",
      }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ quota_usage: 1 }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ name: "reach", values: [] }] }))
      .mockResolvedValueOnce(jsonResponse({
        access_token: "long-lived-user-token",
        token_type: "bearer",
        expires_in: SIXTY_DAYS_SECONDS,
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: [
          {
            id: "unrelated-page",
            name: "Unrelated Page",
            access_token: "unrelated-page-token",
            instagram_business_account: { id: "178414999999999" },
          },
          {
            id: "tokenradar-page",
            name: "TokenRadar",
            access_token: "durable-page-token",
            instagram_business_account: { id: "178414000000001" },
            tasks: ["CREATE_CONTENT", "ANALYZE"],
          },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: "178414000000001",
        username: "tokenradar",
      }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ quota_usage: 1 }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ name: "reach", values: [] }] }))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          app_id: "meta-app-id",
          type: "PAGE",
          is_valid: true,
          expires_at: 0,
          scopes: FACEBOOK_LOGIN_SCOPES,
        },
      }));

    const result = await maintainInstagramAccessToken(
      "facebook-user-token",
      facebookLoginEnvironment(),
      fetchMock,
    );

    expect(result).toEqual({
      status: "converted",
      accessToken: "durable-page-token",
      detail: "Converted the Facebook User token to the non-expiring Page token for TokenRadar.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(10);

    const initialInspection = requestUrl(fetchMock, 0);
    expect(initialInspection.pathname).toBe("/v25.0/debug_token");
    expect(initialInspection.searchParams.get("input_token")).toBe("facebook-user-token");
    expect(initialInspection.searchParams.get("access_token")).toBe(
      "meta-app-id|meta-app-secret",
    );

    const currentAccountValidation = requestUrl(fetchMock, 1);
    expect(currentAccountValidation.pathname).toBe("/v25.0/178414000000001");
    expect(currentAccountValidation.searchParams.get("access_token")).toBe(
      "facebook-user-token",
    );
    expect(requestUrl(fetchMock, 2).pathname).toContain("content_publishing_limit");
    expect(requestUrl(fetchMock, 2).searchParams.get("access_token")).toBe(
      "facebook-user-token",
    );
    expect(requestUrl(fetchMock, 3).pathname).toContain("insights");
    expect(requestUrl(fetchMock, 3).searchParams.get("access_token")).toBe(
      "facebook-user-token",
    );

    const exchange = requestUrl(fetchMock, 4);
    expect(exchange.pathname).toBe("/v25.0/oauth/access_token");
    expect(exchange.searchParams.get("grant_type")).toBe("fb_exchange_token");
    expect(exchange.searchParams.get("fb_exchange_token")).toBe("facebook-user-token");

    const pageDiscovery = requestUrl(fetchMock, 5);
    expect(pageDiscovery.pathname).toBe("/v25.0/me/accounts");
    expect(pageDiscovery.searchParams.get("access_token")).toBe("long-lived-user-token");
    expect(pageDiscovery.searchParams.get("fields")).toContain(
      "instagram_business_account",
    );
    expect(pageDiscovery.searchParams.get("fields")).toContain("tasks");

    const accountValidation = requestUrl(fetchMock, 6);
    expect(accountValidation.pathname).toBe("/v25.0/178414000000001");
    expect(accountValidation.searchParams.get("access_token")).toBe("durable-page-token");

    const publishingProbe = requestUrl(fetchMock, 7);
    expect(publishingProbe.pathname).toBe(
      "/v25.0/178414000000001/content_publishing_limit",
    );
    expect(publishingProbe.searchParams.get("fields")).toBe("quota_usage,config");
    expect(publishingProbe.searchParams.get("access_token")).toBe("durable-page-token");

    const insightsProbe = requestUrl(fetchMock, 8);
    expect(insightsProbe.pathname).toBe("/v25.0/178414000000001/insights");
    expect(insightsProbe.searchParams.get("metric")).toBe("reach");
    expect(insightsProbe.searchParams.get("period")).toBe("day");
    expect(insightsProbe.searchParams.get("access_token")).toBe("durable-page-token");

    const pageInspection = requestUrl(fetchMock, 9);
    expect(pageInspection.searchParams.get("input_token")).toBe("durable-page-token");
  });

  it("follows graph.facebook.com Page pagination to find the linked account", async () => {
    const secondPageUrl =
      "https://graph.facebook.com/v25.0/me/accounts?after=page-2-cursor&access_token=long-lived-user-token";
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          app_id: "meta-app-id",
          type: "USER",
          is_valid: true,
          expires_at: 1_800_000_000,
          scopes: [...FACEBOOK_LOGIN_SCOPES, "pages_show_list"],
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: "178414000000001",
        username: "tokenradar",
      }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ quota_usage: 1 }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ name: "reach", values: [] }] }))
      .mockResolvedValueOnce(jsonResponse({
        access_token: "long-lived-user-token",
        expires_in: SIXTY_DAYS_SECONDS,
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: [{
          id: "unrelated-page",
          name: "Unrelated Page",
          access_token: "unrelated-page-token",
          tasks: ["CREATE_CONTENT", "ANALYZE"],
          instagram_business_account: { id: "178414999999999" },
        }],
        paging: { next: secondPageUrl },
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: [{
          id: "tokenradar-page",
          name: "TokenRadar",
          access_token: "page-2-durable-token",
          tasks: ["CREATE_CONTENT", "ANALYZE"],
          instagram_business_account: { id: "178414000000001" },
        }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: "178414000000001",
        username: "tokenradar",
      }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ quota_usage: 1 }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ name: "reach", values: [] }] }))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          app_id: "meta-app-id",
          type: "PAGE",
          is_valid: true,
          expires_at: 0,
          scopes: FACEBOOK_LOGIN_SCOPES,
        },
      }));

    await expect(maintainInstagramAccessToken(
      "facebook-user-token",
      facebookLoginEnvironment(),
      fetchMock,
    )).resolves.toEqual({
      status: "converted",
      accessToken: "page-2-durable-token",
      detail: "Converted the Facebook User token to the non-expiring Page token for TokenRadar.",
    });

    expect(fetchMock).toHaveBeenCalledTimes(11);
    expect(requestUrl(fetchMock, 1).searchParams.get("access_token")).toBe(
      "facebook-user-token",
    );
    expect(requestUrl(fetchMock, 2).pathname).toContain("content_publishing_limit");
    expect(requestUrl(fetchMock, 3).pathname).toContain("insights");
    expect(requestUrl(fetchMock, 5).pathname).toBe("/v25.0/me/accounts");
    expect(requestUrl(fetchMock, 6).href).toBe(secondPageUrl);
    expect(requestUrl(fetchMock, 7).searchParams.get("access_token")).toBe(
      "page-2-durable-token",
    );
    expect(requestUrl(fetchMock, 8).pathname).toContain("content_publishing_limit");
    expect(requestUrl(fetchMock, 9).pathname).toContain("insights");
  });

  it("keeps a valid non-expiring PAGE token without rewriting it", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          app_id: "meta-app-id",
          type: "PAGE",
          is_valid: true,
          expires_at: 0,
          scopes: FACEBOOK_LOGIN_SCOPES,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: "178414000000001",
        username: "tokenradar",
      }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ quota_usage: 1 }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ name: "reach", values: [] }] }));

    await expect(maintainInstagramAccessToken(
      "healthy-page-token",
      facebookLoginEnvironment(),
      fetchMock,
    )).resolves.toEqual({
      status: "healthy",
      detail: "Facebook PAGE token is valid and the token itself has no scheduled expiration.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(requestUrl(fetchMock, 1).searchParams.get("access_token")).toBe(
      "healthy-page-token",
    );
    expect(requestUrl(fetchMock, 2).pathname).toContain("content_publishing_limit");
    expect(requestUrl(fetchMock, 3).pathname).toContain("insights");
  });

  it("keeps a valid non-expiring SYSTEM_USER token after both capability probes", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          app_id: "meta-app-id",
          type: "SYSTEM_USER",
          is_valid: true,
          expires_at: 0,
          scopes: FACEBOOK_LOGIN_SCOPES,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: "178414000000001",
        username: "tokenradar",
      }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ quota_usage: 1 }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ name: "reach", values: [] }] }));

    await expect(maintainInstagramAccessToken(
      "healthy-system-user-token",
      facebookLoginEnvironment(),
      fetchMock,
    )).resolves.toEqual({
      status: "healthy",
      detail: "Facebook SYSTEM_USER token is valid and the token itself has no scheduled expiration.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(requestUrl(fetchMock, 2).searchParams.get("access_token")).toBe(
      "healthy-system-user-token",
    );
    expect(requestUrl(fetchMock, 3).searchParams.get("access_token")).toBe(
      "healthy-system-user-token",
    );
  });

  it.each([
    {
      label: "content publishing",
      successfulProbeResponses: [] as Response[],
      expectedError: "Instagram content-publishing capability check failed",
    },
    {
      label: "insights",
      successfulProbeResponses: [jsonResponse({ data: [{ quota_usage: 1 }] })],
      expectedError: "Instagram insights capability check failed",
    },
  ])("rejects a PAGE token when the $label probe fails", async ({
    successfulProbeResponses,
    expectedError,
  }) => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          app_id: "meta-app-id",
          type: "PAGE",
          is_valid: true,
          expires_at: 0,
          scopes: FACEBOOK_LOGIN_SCOPES,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: "178414000000001",
        username: "tokenradar",
      }));
    for (const response of successfulProbeResponses) {
      fetchMock.mockResolvedValueOnce(response);
    }
    fetchMock.mockResolvedValueOnce(jsonResponse({
      error: {
        message: "Permission denied for read-only capability probe",
        type: "OAuthException",
        code: 200,
      },
    }, 403));

    await expect(maintainInstagramAccessToken(
      "page-token-with-broken-capability",
      facebookLoginEnvironment(),
      fetchMock,
    )).rejects.toThrow(expectedError);
  });

  it("surfaces a finite Meta data-access lifetime in expiresIn and detail", async () => {
    vi.useFakeTimers();
    try {
      const now = new Date("2026-08-25T12:00:00.000Z");
      const dataAccessLifetime = 7 * 24 * 60 * 60;
      const dataAccessExpiresAt = Math.floor(now.getTime() / 1000) + dataAccessLifetime;
      vi.setSystemTime(now);
      const fetchMock = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({
          data: {
            app_id: "meta-app-id",
            type: "PAGE",
            is_valid: true,
            expires_at: 0,
            data_access_expires_at: dataAccessExpiresAt,
            scopes: FACEBOOK_LOGIN_SCOPES,
          },
        }))
        .mockResolvedValueOnce(jsonResponse({
          id: "178414000000001",
          username: "tokenradar",
        }))
        .mockResolvedValueOnce(jsonResponse({ data: [{ quota_usage: 1 }] }))
        .mockResolvedValueOnce(jsonResponse({ data: [{ name: "reach", values: [] }] }));

      await expect(maintainInstagramAccessToken(
        "page-token-with-finite-data-access",
        facebookLoginEnvironment(),
        fetchMock,
      )).resolves.toEqual({
        status: "healthy",
        expiresIn: dataAccessLifetime,
        detail: "Facebook PAGE token is valid and the token itself has no scheduled expiration. Meta data access is separately scheduled to expire at 2026-09-01T12:00:00.000Z; the weekly job will keep reporting it until reauthorization.",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a PAGE token whose Meta data access has expired", async () => {
    vi.useFakeTimers();
    try {
      const now = new Date("2026-08-25T12:00:00.000Z");
      vi.setSystemTime(now);
      const fetchMock = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({
          data: {
            app_id: "meta-app-id",
            type: "PAGE",
            is_valid: true,
            expires_at: 0,
            data_access_expires_at: Math.floor(now.getTime() / 1000) - 1,
            scopes: FACEBOOK_LOGIN_SCOPES,
          },
        }))
        .mockResolvedValueOnce(jsonResponse({
          id: "178414000000001",
          username: "tokenradar",
        }))
        .mockResolvedValueOnce(jsonResponse({ data: [{ quota_usage: 1 }] }))
        .mockResolvedValueOnce(jsonResponse({ data: [{ name: "reach", values: [] }] }));

      await expect(maintainInstagramAccessToken(
        "page-token-with-expired-data-access",
        facebookLoginEnvironment(),
        fetchMock,
      )).rejects.toThrow("data access expired");
      expect(fetchMock).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses an expiring PAGE token because it cannot be renewed in place", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          app_id: "meta-app-id",
          type: "PAGE",
          is_valid: true,
          expires_at: 1_800_000_000,
          scopes: FACEBOOK_LOGIN_SCOPES,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: "178414000000001",
        username: "tokenradar",
      }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ quota_usage: 1 }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ name: "reach", values: [] }] }));

    await expect(maintainInstagramAccessToken(
      "expiring-page-token",
      facebookLoginEnvironment(),
      fetchMock,
    )).rejects.toThrow(
      "cannot be renewed automatically",
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("refuses to call a PAGE token non-expiring when introspection omits expires_at", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          app_id: "meta-app-id",
          type: "PAGE",
          is_valid: true,
          scopes: FACEBOOK_LOGIN_SCOPES,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: "178414000000001",
        username: "tokenradar",
      }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ quota_usage: 1 }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ name: "reach", values: [] }] }));

    await expect(maintainInstagramAccessToken(
      "page-token-with-unknown-expiry",
      facebookLoginEnvironment(),
      fetchMock,
    )).rejects.toThrow("durability cannot be verified");
  });
});

describe("Threads token maintenance", () => {
  it("requires THREADS_ACCOUNT_ID before making a network request", async () => {
    const fetchMock = vi.fn<typeof fetch>();

    await expect(maintainThreadsAccessToken(
      "current-threads-token",
      threadsEnvironment({ THREADS_ACCOUNT_ID: "  " }),
      fetchMock,
    )).rejects.toThrow("THREADS_ACCOUNT_ID");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a scoped Threads introspection response without app_id", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          is_valid: true,
          scopes: THREADS_SCOPES,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ id: "threads-user", username: "tokenradar" }))
      .mockResolvedValueOnce(jsonResponse({
        error: {
          message: "The Threads access token is less than 24 hours old.",
          type: "OAuthException",
          code: 100,
        },
      }, 400));

    await expect(maintainThreadsAccessToken(
      "valid-threads-token-without-app-id",
      threadsEnvironment(),
      fetchMock,
    )).resolves.toEqual({
      status: "skipped",
      detail: "Threads token is valid but less than 24 hours old.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects the current token when it belongs to another Threads account", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          app_id: "threads-app-id",
          is_valid: true,
          scopes: THREADS_SCOPES,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: "another-threads-user",
        username: "another_account",
      }));

    await expect(maintainThreadsAccessToken(
      "wrong-current-threads-token",
      threadsEnvironment(),
      fetchMock,
    )).rejects.toThrow("THREADS_ACCOUNT_ID threads-user");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a Threads token missing an operational scope", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          app_id: "threads-app-id",
          is_valid: true,
          scopes: ["threads_basic", "threads_content_publish"],
        },
      }));

    await expect(maintainThreadsAccessToken(
      "threads-token-without-insights",
      threadsEnvironment(),
      fetchMock,
    )).rejects.toThrow("threads_manage_insights");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestUrl(fetchMock, 0).pathname).toBe("/debug_token");
    expect(requestUrl(fetchMock, 0).searchParams.get("input_token")).toBe(
      "threads-token-without-insights",
    );
  });

  it("rejects a renewed token when its identity changes", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          app_id: "threads-app-id",
          is_valid: true,
          scopes: THREADS_SCOPES,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ id: "threads-user", username: "tokenradar" }))
      .mockResolvedValueOnce(jsonResponse({
        access_token: "renewed-for-another-account",
        token_type: "bearer",
        expires_in: SIXTY_DAYS_SECONDS,
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          app_id: "threads-app-id",
          is_valid: true,
          scopes: THREADS_SCOPES,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: "another-threads-user",
        username: "another_account",
      }));

    await expect(maintainThreadsAccessToken(
      "current-threads-token",
      threadsEnvironment(),
      fetchMock,
    )).rejects.toThrow("THREADS_ACCOUNT_ID threads-user");
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(requestUrl(fetchMock, 4).searchParams.get("access_token")).toBe(
      "renewed-for-another-account",
    );
  });

  it("rejects a renewed Threads token that loses an operational scope", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          app_id: "threads-app-id",
          is_valid: true,
          scopes: THREADS_SCOPES,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ id: "threads-user", username: "tokenradar" }))
      .mockResolvedValueOnce(jsonResponse({
        access_token: "renewed-threads-token-without-insights",
        token_type: "bearer",
        expires_in: SIXTY_DAYS_SECONDS,
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          app_id: "threads-app-id",
          is_valid: true,
          scopes: ["threads_basic", "threads_content_publish"],
        },
      }));

    await expect(maintainThreadsAccessToken(
      "current-threads-token",
      threadsEnvironment(),
      fetchMock,
    )).rejects.toThrow("threads_manage_insights");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(requestUrl(fetchMock, 3).searchParams.get("input_token")).toBe(
      "renewed-threads-token-without-insights",
    );
  });

  it("treats a less-than-24-hours Threads response as a valid skipped refresh", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          app_id: "threads-app-id",
          is_valid: true,
          scopes: THREADS_SCOPES,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ id: "threads-user", username: "tokenradar" }))
      .mockResolvedValueOnce(jsonResponse({
        error: {
          message: "The Threads access token is less than 24 hours old.",
          type: "OAuthException",
          code: 100,
        },
      }, 400));

    await expect(maintainThreadsAccessToken(
      "brand-new-threads-token",
      threadsEnvironment(),
      fetchMock,
    )).resolves.toEqual({
      status: "skipped",
      detail: "Threads token is valid but less than 24 hours old.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(requestUrl(fetchMock, 2).pathname).toBe("/refresh_access_token");
  });

  it("self-inspects both token scopes and identities without relying on app_id", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          is_valid: true,
          scopes: THREADS_SCOPES,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ id: "threads-user", username: "tokenradar" }))
      .mockResolvedValueOnce(jsonResponse({
        access_token: "renewed-threads-token",
        token_type: "bearer",
        expires_in: SIXTY_DAYS_SECONDS,
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          is_valid: true,
          scopes: THREADS_SCOPES,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ id: "threads-user", username: "tokenradar" }));

    await expect(maintainThreadsAccessToken(
      "current-threads-token",
      threadsEnvironment(),
      fetchMock,
    )).resolves.toEqual({
      status: "refreshed",
      accessToken: "renewed-threads-token",
      expiresIn: SIXTY_DAYS_SECONDS,
      detail: "Renewed the Threads token for 60 days.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);

    const currentInspection = requestUrl(fetchMock, 0);
    expect(currentInspection.pathname).toBe("/debug_token");
    expect(currentInspection.searchParams.get("input_token")).toBe("current-threads-token");
    expect(currentInspection.searchParams.has("access_token")).toBe(false);
    expect(new Headers(
      (fetchMock.mock.calls[0][1] as RequestInit).headers,
    ).get("Authorization")).toBe(
      "Bearer current-threads-token",
    );

    const validation = requestUrl(fetchMock, 1);
    expect(`${validation.origin}${validation.pathname}`).toBe(
      "https://graph.threads.net/v1.0/me",
    );
    expect(validation.searchParams.get("access_token")).toBe("current-threads-token");

    const refresh = requestUrl(fetchMock, 2);
    expect(`${refresh.origin}${refresh.pathname}`).toBe(
      "https://graph.threads.net/refresh_access_token",
    );
    expect(refresh.searchParams.get("grant_type")).toBe("th_refresh_token");
    expect(refresh.searchParams.get("access_token")).toBe("current-threads-token");

    const renewedInspection = requestUrl(fetchMock, 3);
    expect(renewedInspection.pathname).toBe("/debug_token");
    expect(renewedInspection.searchParams.get("input_token")).toBe(
      "renewed-threads-token",
    );
    expect(renewedInspection.searchParams.has("access_token")).toBe(false);
    expect(new Headers(
      (fetchMock.mock.calls[3][1] as RequestInit).headers,
    ).get("Authorization")).toBe(
      "Bearer renewed-threads-token",
    );

    const renewedValidation = requestUrl(fetchMock, 4);
    expect(renewedValidation.searchParams.get("access_token")).toBe(
      "renewed-threads-token",
    );
  });

  it("rejects a renewed Threads token whose reported app_id changes", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          app_id: "threads-app-id",
          is_valid: true,
          scopes: THREADS_SCOPES,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ id: "threads-user", username: "tokenradar" }))
      .mockResolvedValueOnce(jsonResponse({
        access_token: "renewed-token-for-another-app",
        token_type: "bearer",
        expires_in: SIXTY_DAYS_SECONDS,
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          app_id: "another-threads-app-id",
          is_valid: true,
          scopes: THREADS_SCOPES,
        },
      }));

    await expect(maintainThreadsAccessToken(
      "current-threads-token",
      threadsEnvironment(),
      fetchMock,
    )).rejects.toThrow(
      "belongs to app another-threads-app-id, not the current token app threads-app-id",
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(new Headers(
      (fetchMock.mock.calls[3][1] as RequestInit).headers,
    ).get("Authorization")).toBe("Bearer renewed-token-for-another-app");
  });
});
