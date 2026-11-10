import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import { describe, expect, it } from "vitest";

const bash = process.platform === "win32"
  ? path.join(process.env.ProgramFiles || "C:/Program Files", "Git", "bin", "bash.exe")
  : "bash";
const publisher = fs.readFileSync(
  path.join(process.cwd(), ".github/actions/publish-generated-pr/publish.sh"),
  "utf8",
);
// Load the real functions without executing the publication entry point.
const entryPoint = publisher.indexOf('\n[[ -n "${GH_TOKEN:-}" ]]');
if (entryPoint < 0) throw new Error("Cannot locate the publisher entry point safely");
const definitions = publisher.slice(0, entryPoint);

function runScenario(responses: string[], command = 'wait_for_ci_run "123"', expire = false) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "generated-pr-ci-"));
  try {
    fs.writeFileSync(path.join(directory, "responses"), responses.join("\n") + "\n");
    fs.writeFileSync(path.join(directory, "count"), "0");
    return spawnSync(bash, ["--noprofile", "--norc", "-s"], {
      cwd: directory,
      encoding: "utf8",
      timeout: 10_000,
      env: { ...process.env, GITHUB_REPOSITORY: "owner/repo", EXPIRE: expire ? "1" : "0" },
      input: `${definitions}
gh() {
  local count response
  count=$(( $(cat count) + 1 ))
  printf '%s' "$count" > count
  echo "API attempt $count: $*" >&2
  response="$(sed -n "$count"p responses)"
  case "$response" in
    error) echo '{"message":"Internal Server Error"}'; echo "HTTP 500" >&2; return 1 ;;
    '') echo "Unexpected extra API request" >&2; return 1 ;;
    *) printf '%b\\n' "$response" ;;
  esac
}
sleep() {
  echo "Sleep $1" >&2
  if [[ "$EXPIRE" == "1" ]]; then
    SECONDS=$((SECONDS + 2700))
  fi
  return 0
}
${command}
`,
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

describe("generated PR CI monitoring", () => {
  it("recovers from the HTTP 500 immediately after dispatch and waits for success", () => {
    const result = runScenario(["error", "queued\\t", "in_progress\\t", "completed\\tsuccess"]);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain("retrying in 15s");
    expect(result.stderr.match(/API attempt/g)).toHaveLength(4);
    expect(result.stderr).toContain("repos/owner/repo/actions/runs/123 --jq");
    expect(result.stdout).toContain("is queued");
    expect(result.stdout).toContain("is in_progress");
  });

  it.each(["failure", "cancelled", "timed_out", "skipped", "action_required", ""])(
    "rejects a completed run with conclusion %j without retrying it",
    (conclusion) => {
      const result = runScenario([`completed\\t${conclusion}`]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`completed with conclusion ${conclusion || "unknown"}`);
      expect(result.stderr.match(/API attempt/g)).toHaveLength(1);
      expect(result.stderr).not.toContain("Sleep");
    },
  );

  it("fails after five unsuccessful reads without reporting success", () => {
    const result = runScenario(Array(5).fill("error"));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unable to read CI run 123 after 5 attempts");
    expect(result.stderr.match(/API attempt/g)).toHaveLength(5);
    expect(result.stderr.match(/Sleep 15/g)).toHaveLength(4);
  });

  it("resets read retries after a successful poll", () => {
    const result = runScenario([
      ...Array(4).fill("error"), "in_progress\\t",
      ...Array(4).fill("error"), "completed\\tsuccess",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr.match(/API attempt/g)).toHaveLength(10);
  });

  it("bounds the wait for a CI run that never completes", () => {
    const result = runScenario(["in_progress\\t"], undefined, true);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("did not complete within 45 minutes");
    expect(result.stderr.match(/API attempt/g)).toHaveLength(1);
  });

  it("retries the unfiltered read used for final CI identity verification", () => {
    const run = JSON.stringify({ status: "completed", conclusion: "success", head_sha: "abc" });
    const result = runScenario(["error", run], 'read_ci_run "123"');
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(JSON.parse(run));
    expect(result.stderr.match(/API attempt/g)).toHaveLength(2);
  });
});
