import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "dotenv";

const GENERATED_PATH_PREFIXES = [
  ".next/",
  ".open-next/",
  ".wrangler/",
  "dist-cloudflare/",
  "out/",
] as const;

const BINARY_EXTENSIONS = new Set([
  ".avif",
  ".bin",
  ".db",
  ".gif",
  ".gz",
  ".ico",
  ".jpeg",
  ".jpg",
  ".mp3",
  ".mp4",
  ".ogg",
  ".otf",
  ".pdf",
  ".png",
  ".sqlite",
  ".ttf",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".wasm",
  ".zip",
]);

const PROVIDER_PATTERNS = [
  { name: "Anthropic API key", pattern: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "Google API key", pattern: /AIza[0-9A-Za-z_-]{30,}/ },
  { name: "Google OAuth client secret", pattern: /GOCSPX-[0-9A-Za-z_-]{20,}/ },
  { name: "Google OAuth refresh token", pattern: /\b1\/\/[0-9A-Za-z_-]{20,}/ },
  { name: "Telegram bot token", pattern: /\b\d{7,12}:AA[0-9A-Za-z_-]{20,}/ },
  { name: "GitHub token", pattern: /\bgh[pousr]_[0-9A-Za-z_]{20,}/ },
  { name: "AWS access key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  {
    name: "private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
] as const;

const PUBLIC_ENV_NAMES = new Set([
  "INDEXNOW_KEY",
  "NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN",
]);

export interface ExposureFinding {
  file: string;
  kind: "generated-path" | "provider-pattern" | "resolved-environment-value";
  name: string;
}

interface SensitiveValue {
  names: string[];
  value: string;
}

function normalizeGitPath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function isSensitiveEnvironmentName(name: string): boolean {
  if (name.startsWith("NEXT_PUBLIC_") || PUBLIC_ENV_NAMES.has(name)) {
    return false;
  }

  if (
    /(?:_ID|_URL|_URI|_NAME|_PATH|_HOST|_MODE|_ENV|_BUCKET_NAME|_CHANNEL_ID|_CHAT_ID)$/.test(
      name,
    )
  ) {
    return false;
  }

  return /(?:API_KEY|SECRET|TOKEN|PASSWORD|PRIVATE_KEY|ACCESS_KEY|CLIENT_JSON|SERVICE_ACCOUNT_JSON|_PAT)$/.test(
    name,
  );
}

export function findTrackedGeneratedPaths(trackedFiles: string[]): ExposureFinding[] {
  return trackedFiles
    .map(normalizeGitPath)
    .filter((filePath) =>
      GENERATED_PATH_PREFIXES.some((prefix) => filePath.startsWith(prefix)),
    )
    .map((filePath) => ({
      file: filePath,
      kind: "generated-path" as const,
      name: "generated build artifact",
    }));
}

function loadSensitiveValues(): SensitiveValue[] {
  const sources: Array<Record<string, string | undefined>> = [process.env];
  const localEnvPath = path.resolve(process.cwd(), ".env.local");

  if (fs.existsSync(localEnvPath)) {
    sources.push(parse(fs.readFileSync(localEnvPath)));
  }

  const namesByValue = new Map<string, Set<string>>();
  for (const source of sources) {
    for (const [name, value] of Object.entries(source)) {
      if (!value || value.length < 8 || !isSensitiveEnvironmentName(name)) {
        continue;
      }

      const names = namesByValue.get(value) ?? new Set<string>();
      names.add(name);
      namesByValue.set(value, names);
    }
  }

  return [...namesByValue.entries()].map(([value, names]) => ({
    names: [...names].sort(),
    value,
  }));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectFiles(rootPath: string): string[] {
  const files: string[] = [];
  const pending = [rootPath];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      continue;
    }

    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) {
      continue;
    }
    if (stat.isFile()) {
      files.push(current);
      continue;
    }
    if (!stat.isDirectory()) {
      continue;
    }

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      pending.push(path.join(current, entry.name));
    }
  }

  return files;
}

function isTextCandidate(filePath: string): boolean {
  return !BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function scanFiles(
  files: string[],
  sensitiveValues: SensitiveValue[],
  workspaceRoot = process.cwd(),
): ExposureFinding[] {
  const findings: ExposureFinding[] = [];
  const namesByValue = new Map(sensitiveValues.map((entry) => [entry.value, entry.names]));
  const exactPattern =
    sensitiveValues.length > 0
      ? new RegExp(sensitiveValues.map((entry) => escapeRegExp(entry.value)).join("|"), "g")
      : null;

  for (const filePath of files) {
    if (!isTextCandidate(filePath)) {
      continue;
    }

    const content = fs.readFileSync(filePath, "utf8");
    const displayPath = normalizeGitPath(path.relative(workspaceRoot, filePath));

    for (const provider of PROVIDER_PATTERNS) {
      if (provider.pattern.test(content)) {
        findings.push({
          file: displayPath,
          kind: "provider-pattern",
          name: provider.name,
        });
      }
    }

    if (!exactPattern) {
      continue;
    }

    exactPattern.lastIndex = 0;
    const matchedNames = new Set<string>();
    for (const match of content.matchAll(exactPattern)) {
      for (const name of namesByValue.get(match[0]) ?? []) {
        matchedNames.add(name);
      }
    }
    for (const name of [...matchedNames].sort()) {
      findings.push({
        file: displayPath,
        kind: "resolved-environment-value",
        name,
      });
    }
  }

  return findings;
}

function trackedFiles(workspaceRoot: string): string[] {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: workspaceRoot,
    encoding: "utf8",
  });

  return output
    .split("\0")
    .filter(Boolean)
    .map((filePath) => path.resolve(workspaceRoot, filePath));
}

function parseCliArguments(args: string[]): { scanTracked: boolean; paths: string[] } {
  let scanTracked = false;
  const paths: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--tracked") {
      scanTracked = true;
      continue;
    }
    if (argument === "--path") {
      const target = args[index + 1];
      if (!target) {
        throw new Error("--path requires a directory or file");
      }
      paths.push(target);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return { scanTracked: scanTracked || paths.length === 0, paths };
}

export function runCli(args = process.argv.slice(2)): number {
  const workspaceRoot = path.resolve(process.cwd());
  const options = parseCliArguments(args);
  const tracked = options.scanTracked ? trackedFiles(workspaceRoot) : [];
  const findings = options.scanTracked
    ? findTrackedGeneratedPaths(tracked.map((filePath) => path.relative(workspaceRoot, filePath)))
    : [];
  const files = new Set(tracked);

  for (const requestedPath of options.paths) {
    const targetPath = path.resolve(workspaceRoot, requestedPath);
    const relativePath = path.relative(workspaceRoot, targetPath);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      throw new Error(`Refusing to scan outside the workspace: ${requestedPath}`);
    }
    if (!fs.existsSync(targetPath)) {
      throw new Error(`Scan target does not exist: ${requestedPath}`);
    }
    for (const filePath of collectFiles(targetPath)) {
      files.add(filePath);
    }
  }

  findings.push(...scanFiles([...files], loadSensitiveValues(), workspaceRoot));

  const uniqueFindings = [
    ...new Map(
      findings.map((finding) => [
        `${finding.kind}\0${finding.name}\0${finding.file}`,
        finding,
      ]),
    ).values(),
  ].sort((left, right) =>
    `${left.file}:${left.name}`.localeCompare(`${right.file}:${right.name}`),
  );

  if (uniqueFindings.length > 0) {
    console.error("Secret exposure check failed. Values are intentionally redacted:");
    for (const finding of uniqueFindings) {
      console.error(`- ${finding.kind}: ${finding.name} in ${finding.file}`);
    }
    return 1;
  }

  console.log(`Secret exposure check passed (${files.size} files scanned).`);
  return 0;
}

const isMainModule =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  try {
    process.exitCode = runCli();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`Secret exposure check could not run: ${message}`);
    process.exitCode = 2;
  }
}
