import { formatErrorForLog } from "./utils";

export type D1Param = string | number | boolean | null;

export interface D1Config {
  accountId: string;
  apiToken: string;
  databaseId: string;
  apiBaseUrl: string;
}

export interface D1QueryMeta {
  changed_db?: boolean;
  changes?: number;
  duration?: number;
  last_row_id?: number;
  rows_read?: number;
  rows_written?: number;
  served_by_colo?: string;
  served_by_primary?: boolean;
  served_by_region?: string;
  size_after?: number;
}

export interface D1StatementResult<T = Record<string, unknown>> {
  success: boolean;
  results?: T[];
  meta?: D1QueryMeta;
}

interface D1ApiError {
  code?: number;
  message?: string;
}

interface D1ApiResponse<T> {
  success: boolean;
  errors?: D1ApiError[];
  messages?: D1ApiError[];
  result?: D1StatementResult<T>[];
}

interface D1ConfigOptions {
  required?: boolean;
}

interface D1QueryOptions extends D1ConfigOptions {
  config?: D1Config;
}

const DEFAULT_D1_API_BASE_URL = "https://api.cloudflare.com/client/v4";

function firstEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

export function loadD1Config(options: D1ConfigOptions = {}): D1Config | null {
  const accountId = firstEnv("CLOUDFLARE_ACCOUNT_ID", "R2_ACCOUNT_ID");
  const apiToken = firstEnv("CLOUDFLARE_API_TOKEN", "D1_API_TOKEN");
  const databaseId = firstEnv("D1_DATABASE_ID", "CLOUDFLARE_D1_DATABASE_ID");
  const apiBaseUrl = firstEnv("CLOUDFLARE_API_BASE_URL") || DEFAULT_D1_API_BASE_URL;

  if (!accountId || !apiToken || !databaseId) {
    if (options.required) {
      throw new Error(
        "Missing D1 configuration. Required: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, D1_DATABASE_ID",
      );
    }
    return null;
  }

  return { accountId, apiToken, databaseId, apiBaseUrl };
}

export function hasD1Config(): boolean {
  return loadD1Config() !== null;
}

function formatD1ApiErrors(errors: D1ApiError[] | undefined): string {
  if (!errors || errors.length === 0) return "Unknown D1 API error";
  return errors
    .map((error) => {
      const code = error.code ? `${error.code}: ` : "";
      return `${code}${error.message || "Unknown error"}`;
    })
    .join("; ");
}

export async function executeD1Query<T = Record<string, unknown>>(
  sql: string,
  params: D1Param[] = [],
  options: D1QueryOptions = {},
): Promise<D1StatementResult<T>[]> {
  const config = options.config || loadD1Config({ required: options.required });
  if (!config) return [];

  const url = `${config.apiBaseUrl.replace(/\/$/, "")}/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });

  let payload: D1ApiResponse<T> | null = null;
  const text = await response.text();
  if (text.trim()) {
    try {
      payload = JSON.parse(text) as D1ApiResponse<T>;
    } catch (error) {
      throw new Error(`D1 API returned invalid JSON: ${formatErrorForLog(error)}`);
    }
  }

  if (!response.ok || !payload?.success) {
    const details = payload ? formatD1ApiErrors(payload.errors) : text.slice(0, 300);
    throw new Error(`D1 query failed (${response.status} ${response.statusText}): ${details}`);
  }

  const results = payload.result || [];
  const failedStatement = results.find((result) => !result.success);
  if (failedStatement) {
    throw new Error("D1 statement failed inside a successful API response.");
  }

  return results;
}
