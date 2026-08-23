import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findTrackedGeneratedPaths,
  isSensitiveEnvironmentName,
  scanFiles,
} from "../scripts/check-secret-exposure";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("secret exposure guard", () => {
  it("does not persist the framework build cache from secret-bearing builds", () => {
    const workflow = fs.readFileSync(
      path.resolve(process.cwd(), ".github/workflows/deploy.yml"),
      "utf8",
    );

    expect(workflow).not.toMatch(
      /^\s*path:\s*(?:\|\s*\r?\n\s*)?\.next\/cache\s*$/m,
    );

    const buildStep = workflow.match(
      /- name: Build static export([\s\S]*?)- name: Audit rendered SEO inventory/,
    )?.[1];
    expect(buildStep).toBeDefined();
    expect(buildStep).not.toContain("secrets.");
  });

  it("classifies private and public environment names", () => {
    expect(isSensitiveEnvironmentName("ANTHROPIC_API_KEY")).toBe(true);
    expect(isSensitiveEnvironmentName("X_OAUTH2_REFRESH_TOKEN")).toBe(true);
    expect(isSensitiveEnvironmentName("GOOGLE_SERVICE_ACCOUNT_JSON")).toBe(true);
    expect(isSensitiveEnvironmentName("NEXT_PUBLIC_GA_MEASUREMENT_ID")).toBe(false);
    expect(isSensitiveEnvironmentName("INDEXNOW_KEY")).toBe(false);
    expect(isSensitiveEnvironmentName("CLOUDFLARE_ACCOUNT_ID")).toBe(false);
  });

  it("rejects tracked generated output", () => {
    expect(
      findTrackedGeneratedPaths([
        "src/app/page.tsx",
        ".wrangler/tmp/worker.mjs",
        "dist-cloudflare/cloudflare/next-env.mjs",
      ]),
    ).toEqual([
      {
        file: ".wrangler/tmp/worker.mjs",
        kind: "generated-path",
        name: "generated build artifact",
      },
      {
        file: "dist-cloudflare/cloudflare/next-env.mjs",
        kind: "generated-path",
        name: "generated build artifact",
      },
    ]);
  });

  it("detects provider patterns and resolved values without returning them", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tokenradar-secret-test-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "bundle.mjs");
    const resolvedValue = "unit-test-private-value-1234567890";
    const providerValue = `sk-ant-${"a".repeat(32)}`;
    fs.writeFileSync(filePath, `export default ${JSON.stringify({ resolvedValue, providerValue })};`);

    const findings = scanFiles(
      [filePath],
      [{ names: ["TEST_API_KEY"], value: resolvedValue }],
      directory,
    );

    expect(findings).toEqual([
      {
        file: "bundle.mjs",
        kind: "provider-pattern",
        name: "Anthropic API key",
      },
      {
        file: "bundle.mjs",
        kind: "resolved-environment-value",
        name: "TEST_API_KEY",
      },
    ]);
    expect(JSON.stringify(findings)).not.toContain(resolvedValue);
    expect(JSON.stringify(findings)).not.toContain(providerValue);
  });
});
