#!/usr/bin/env bash
# Keep this runner script LF-only; `.gitattributes` enforces that across platforms.

set -euo pipefail

fail() {
  echo "::error::$*" >&2
  exit 1
}

write_outputs() {
  local merge_sha="$1"
  local pr_number="$2"
  local ci_run_id="${3:-}"

  {
    echo "merge_sha=$merge_sha"
    echo "pr_number=$pr_number"
    echo "ci_run_id=$ci_run_id"
  } >> "$GITHUB_OUTPUT"
}

delete_automation_branch() {
  gh api --method DELETE \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2026-03-10" \
    "repos/${GITHUB_REPOSITORY}/git/refs/heads/${AUTOMATION_BRANCH}" \
    >/dev/null 2>&1 || true
}

close_stale_pr() {
  local pr_number="${1:-}"

  if [[ -n "$pr_number" ]]; then
    gh api --method PATCH \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2026-03-10" \
      "repos/${GITHUB_REPOSITORY}/pulls/${pr_number}" \
      -f state=closed \
      >/dev/null 2>&1 || true
  fi
  delete_automation_branch
}

is_allowed_path() {
  local path="$1"

  case "$AUTOMATION_BRANCH" in
    automation/daily-launch-content-*)
      case "$path" in
        content/tokens/* | data/tokens/* | data/prices/* | \
          data/search-intent.json | data/search-intent-history.json | \
          data/_tokens_blob.json | data/_metrics_blob.json | \
          data/_prices_blob.json | data/_registry.json | \
          public/og/movers.png | public/sitemap.xml | \
          public/sitemap-main.xml | public/sitemap-tokens.xml)
          return 0
          ;;
      esac
      ;;
    automation/daily-refresh-*)
      case "$path" in
        data/tokens/* | data/metrics/* | data/prices/* | data/references/* | \
          data/tokens.json | data/upcoming-tges.json | \
          data/search-intent.json | data/search-intent-history.json | \
          data/_tokens_blob.json | data/_metrics_blob.json | \
          data/_prices_blob.json | data/_registry.json | \
          public/og/movers.png | public/sitemap.xml | \
          public/sitemap-main.xml | public/sitemap-tokens.xml)
          return 0
          ;;
      esac
      ;;
  esac

  return 1
}

require_main_ruleset() {
  local rules_json

  rules_json="$(gh api \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2026-03-10" \
    "repos/${GITHUB_REPOSITORY}/rules/branches/main")"
  jq -e '
    any(.[]; .type == "deletion") and
    any(.[]; .type == "non_fast_forward") and
    any(.[]; .type == "required_linear_history") and
    any(.[]; .type == "pull_request") and
    all(.[]; .type != "merge_queue") and
    any(
      .[];
      .type == "required_status_checks" and
      .parameters.strict_required_status_checks_policy == true and
      any(
        .parameters.required_status_checks[]?;
        .context == "Required checks" and .integration_id == 15368
      )
    )
  ' <<< "$rules_json" >/dev/null || \
    fail "main must have compatible PR, strict Required checks, linear-history, deletion, and force-push rules without a merge queue before automation can merge."
}

verify_ci_run() {
  local run_id="$1"
  local ci_run_json

  [[ "$run_id" =~ ^[0-9]+$ ]] || return 1
  ci_run_json="$(gh api \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2026-03-10" \
    "repos/${GITHUB_REPOSITORY}/actions/runs/${run_id}")"
  jq -e \
    --arg head "$HEAD_SHA" \
    --arg branch "$AUTOMATION_BRANCH" \
    '(.status == "completed") and
     (.conclusion == "success") and
     (.event == "workflow_dispatch") and
     (.head_sha == $head) and
     (.head_branch == $branch) and
     (.path == ".github/workflows/ci.yml")' \
    <<< "$ci_run_json" >/dev/null
}

find_successful_ci_run() {
  local runs_json
  local candidate_run_id

  runs_json="$(gh api --method GET \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2026-03-10" \
    "repos/${GITHUB_REPOSITORY}/actions/workflows/ci.yml/runs" \
    -f branch="$AUTOMATION_BRANCH" \
    -f event=workflow_dispatch \
    -f status=success \
    -f head_sha="$HEAD_SHA" \
    -F per_page=100)"
  while IFS= read -r candidate_run_id; do
    if verify_ci_run "$candidate_run_id"; then
      echo "$candidate_run_id"
      return 0
    fi
  done < <(jq -r '.workflow_runs[] | .id' <<< "$runs_json")

  return 1
}

verify_merge_parent() {
  local merge_sha="$1"
  local commit_json

  commit_json="$(gh api \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2026-03-10" \
    "repos/${GITHUB_REPOSITORY}/git/commits/${merge_sha}")"
  jq -e --arg base "$BASE_SHA" \
    '(.parents | length == 1) and (.parents[0].sha == $base)' \
    <<< "$commit_json" >/dev/null || \
    fail "Squash merge ${merge_sha} was not created directly on recorded base ${BASE_SHA}."
}

[[ -n "${GH_TOKEN:-}" ]] || fail "The integration job did not receive GITHUB_TOKEN."
[[ "${BASE_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || fail "base-sha must be 40 lowercase hexadecimal characters."
[[ "${HEAD_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || fail "head-sha must be 40 lowercase hexadecimal characters."
[[ "$BASE_SHA" != "$HEAD_SHA" ]] || fail "Generated head SHA must differ from its base SHA."
[[ "${AUTOMATION_BRANCH:-}" =~ ^automation/(daily-launch-content|daily-refresh)-[0-9]+-[0-9]+$ ]] || \
  fail "Unexpected automation branch: ${AUTOMATION_BRANCH:-<empty>}"
[[ -n "${PR_TITLE:-}" ]] || fail "Pull request title is empty."
[[ -n "${PR_BODY:-}" ]] || fail "Pull request body is empty."
[[ -n "${GITHUB_REPOSITORY:-}" ]] || fail "GITHUB_REPOSITORY is unavailable."

repo_owner="${GITHUB_REPOSITORY%%/*}"
require_main_ruleset

# A rerun after a successful merge must be idempotent. The branch may already
# be deleted, so inspect any matching PR before requiring the remote ref.
pulls_json="$(gh api --method GET \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  "repos/${GITHUB_REPOSITORY}/pulls" \
  -f state=all \
  -f base=main \
  -f "head=${repo_owner}:${AUTOMATION_BRANCH}" \
  -F per_page=10)"

matching_pr_count="$(jq --arg branch "$AUTOMATION_BRANCH" --arg head "$HEAD_SHA" \
  '[.[] | select(.head.ref == $branch and .head.sha == $head and .base.ref == "main")] | length' \
  <<< "$pulls_json")"
(( matching_pr_count <= 1 )) || fail "Multiple pull requests match the same automation branch and head SHA."

pr_number=""
pr_state=""
pr_merged=false
existing_merge_sha=""
fetch_ref="refs/heads/${AUTOMATION_BRANCH}"
if (( matching_pr_count == 1 )); then
  pr_json="$(jq --arg branch "$AUTOMATION_BRANCH" --arg head "$HEAD_SHA" \
    '[.[] | select(.head.ref == $branch and .head.sha == $head and .base.ref == "main")][0]' \
    <<< "$pulls_json")"
  pr_number="$(jq -r '.number' <<< "$pr_json")"
  pr_state="$(jq -r '.state' <<< "$pr_json")"
  merged_at="$(jq -r '.merged_at // empty' <<< "$pr_json")"

  if [[ -n "$merged_at" ]]; then
    pr_merged=true
    existing_merge_sha="$(jq -r '.merge_commit_sha // empty' <<< "$pr_json")"
    [[ "$existing_merge_sha" =~ ^[0-9a-f]{40}$ ]] || \
      fail "Merged PR #${pr_number} has no valid merge commit SHA."
    fetch_ref="refs/pull/${pr_number}/head"
  fi
fi

current_main="$(gh api \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  "repos/${GITHUB_REPOSITORY}/git/ref/heads/main" --jq '.object.sha')"
if [[ "$pr_merged" == "true" ]]; then
  [[ "$current_main" == "$existing_merge_sha" ]] || \
    fail "PR #${pr_number} is already merged, but main advanced to ${current_main}; refusing a stale deploy."
elif [[ "$current_main" != "$BASE_SHA" ]]; then
  close_stale_pr "$pr_number"
  fail "main changed from ${BASE_SHA} to ${current_main}; closed the stale generated change."
fi

checked_out_sha="$(git rev-parse HEAD)"
[[ "$checked_out_sha" == "$BASE_SHA" ]] || \
  fail "The trusted integration checkout is ${checked_out_sha}, expected base ${BASE_SHA}."

cleanup_git_auth() {
  git config --local --unset-all http.https://github.com/.extraheader 2>/dev/null || true
}
trap cleanup_git_auth EXIT
auth_header="$(printf 'x-access-token:%s' "$GH_TOKEN" | base64 -w0)"
git config --local http.https://github.com/.extraheader "AUTHORIZATION: basic ${auth_header}"
unset auth_header

git fetch --no-tags --no-recurse-submodules --depth=2 origin \
  "+${fetch_ref}:refs/remotes/origin/${AUTOMATION_BRANCH}"
cleanup_git_auth
trap - EXIT

fetched_sha="$(git rev-parse "refs/remotes/origin/${AUTOMATION_BRANCH}")"
[[ "$fetched_sha" == "$HEAD_SHA" ]] || \
  fail "Automation branch points to ${fetched_sha}, expected ${HEAD_SHA}."

read -r commit_sha parent_sha extra_parent < <(git rev-list --parents -n 1 "$HEAD_SHA")
[[ "$commit_sha" == "$HEAD_SHA" && "$parent_sha" == "$BASE_SHA" && -z "${extra_parent:-}" ]] || \
  fail "Generated change must be exactly one non-merge commit on the recorded main base."

git log -1 --format=%B "$HEAD_SHA" | grep -Fq '[skip ci]' || \
  fail "Generated commit must contain [skip ci] so only the exact dispatched CI run executes."

changed_file_count=0
changed_blob_bytes=0
while IFS= read -r -d '' changed_path; do
  ((changed_file_count += 1))
  (( changed_file_count <= 5000 )) || fail "Generated commit changes more than 5,000 files."
  [[ "$changed_path" =~ ^[A-Za-z0-9._/-]+$ ]] || \
    fail "Generated commit contains a path with unsupported characters."
  is_allowed_path "$changed_path" || fail "Generated commit changes disallowed path: ${changed_path}"

  tree_entry="$(git ls-tree "$HEAD_SHA" -- "$changed_path")"
  [[ -n "$tree_entry" ]] || \
    fail "Generated automation may not delete tracked files: ${changed_path}"
  read -r file_mode object_type object_sha _ <<< "$tree_entry"
  [[ "$file_mode" == "100644" && "$object_type" == "blob" && "$object_sha" =~ ^[0-9a-f]{40}$ ]] || \
    fail "Generated path must remain a regular non-executable file: ${changed_path}"
  blob_size="$(git cat-file -s "$object_sha")"
  (( blob_size <= 52428800 )) || fail "Generated file exceeds the 50 MiB safety limit: ${changed_path}"
  ((changed_blob_bytes += blob_size))
  (( changed_blob_bytes <= 524288000 )) || fail "Generated files exceed the 500 MiB aggregate safety limit."
done < <(git diff --name-only --no-renames -z "$BASE_SHA" "$HEAD_SHA")
(( changed_file_count > 0 )) || fail "Generated commit has no changed files."

if [[ "$pr_merged" == "true" ]]; then
  verify_merge_parent "$existing_merge_sha"
  ci_run_id="$(find_successful_ci_run)" || \
    fail "Merged PR #${pr_number} has no successful exact-head workflow_dispatch CI run."
  write_outputs "$existing_merge_sha" "$pr_number" "$ci_run_id"
  {
    echo "### Generated change already merged"
    echo
    echo "- PR: #${pr_number}"
    echo "- CI run: ${ci_run_id}"
    echo "- Merge SHA: \`${existing_merge_sha}\`"
  } >> "$GITHUB_STEP_SUMMARY"
  echo "Generated change was already validated and merged as ${existing_merge_sha}."
  exit 0
fi

if [[ -z "$pr_number" ]]; then
  printf -v full_pr_body '%s\n\nBase SHA: `%s`\nGenerated head SHA: `%s`\n\nThis PR is merged only after exact-head CI succeeds.' \
    "$PR_BODY" "$BASE_SHA" "$HEAD_SHA"
  pr_payload="$(jq -nc \
    --arg title "$PR_TITLE" \
    --arg head "$AUTOMATION_BRANCH" \
    --arg body "$full_pr_body" \
    '{title: $title, head: $head, base: "main", body: $body}')"
  pr_json="$(gh api --method POST \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2026-03-10" \
    "repos/${GITHUB_REPOSITORY}/pulls" \
    --input - <<< "$pr_payload")"
  pr_number="$(jq -r '.number' <<< "$pr_json")"
  pr_state="$(jq -r '.state' <<< "$pr_json")"
elif [[ "$pr_state" == "closed" ]]; then
  pr_json="$(gh api --method PATCH \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2026-03-10" \
    "repos/${GITHUB_REPOSITORY}/pulls/${pr_number}" \
    -f state=open)"
  pr_state="$(jq -r '.state' <<< "$pr_json")"
fi

[[ "$pr_number" =~ ^[0-9]+$ && "$pr_state" == "open" ]] || \
  fail "Unable to create or reopen the generated-change pull request."
echo "Opened generated-change PR #${pr_number}."

dispatch_payload="$(jq -nc \
  --arg ref "$AUTOMATION_BRANCH" \
  --arg expected_sha "$HEAD_SHA" \
  '{ref: $ref, inputs: {expected_sha: $expected_sha}}')"
dispatch_json="$(gh api --method POST \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  "repos/${GITHUB_REPOSITORY}/actions/workflows/ci.yml/dispatches" \
  --input - <<< "$dispatch_payload")"
ci_run_id="$(jq -r '.workflow_run_id // empty' <<< "$dispatch_json")"
[[ "$ci_run_id" =~ ^[0-9]+$ ]] || fail "CI dispatch did not return a workflow run ID."
echo "ci_run_id=$ci_run_id" >> "$GITHUB_OUTPUT"
echo "Dispatched exact-head CI run ${ci_run_id} for ${HEAD_SHA}."

gh run watch "$ci_run_id" --repo "$GITHUB_REPOSITORY" --exit-status --interval 15

verify_ci_run "$ci_run_id" || fail "CI run identity or conclusion did not match the generated head."

current_main="$(gh api \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  "repos/${GITHUB_REPOSITORY}/git/ref/heads/main" --jq '.object.sha')"
if [[ "$current_main" != "$BASE_SHA" ]]; then
  close_stale_pr "$pr_number"
  fail "main advanced during CI; closed PR #${pr_number} instead of merging stale generated data."
fi

fresh_pr_json="$(gh api \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  "repos/${GITHUB_REPOSITORY}/pulls/${pr_number}")"
jq -e \
  --arg head "$HEAD_SHA" \
  --arg base "$BASE_SHA" \
  '(.state == "open") and
   (.draft == false) and
   (.head.sha == $head) and
   (.base.ref == "main") and
   (.base.sha == $base)' \
  <<< "$fresh_pr_json" >/dev/null || fail "PR #${pr_number} changed while CI was running."

merge_payload="$(jq -nc --arg sha "$HEAD_SHA" \
  '{sha: $sha, merge_method: "squash"}')"
merge_sha=""
for attempt in $(seq 1 12); do
  current_main="$(gh api \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2026-03-10" \
    "repos/${GITHUB_REPOSITORY}/git/ref/heads/main" --jq '.object.sha')"
  if [[ "$current_main" != "$BASE_SHA" ]]; then
    close_stale_pr "$pr_number"
    fail "main advanced before merge; closed stale PR #${pr_number}."
  fi

  set +e
  merge_response="$(gh api --method PUT \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2026-03-10" \
    "repos/${GITHUB_REPOSITORY}/pulls/${pr_number}/merge" \
    --input - <<< "$merge_payload" 2>&1)"
  merge_exit=$?
  set -e

  if (( merge_exit == 0 )) && [[ "$(jq -r '.merged // false' <<< "$merge_response")" == "true" ]]; then
    merge_sha="$(jq -r '.sha // empty' <<< "$merge_response")"
    break
  fi

  if (( attempt == 12 )); then
    echo "$merge_response" >&2
    fail "PR #${pr_number} did not become mergeable after exact-head CI succeeded."
  fi
  echo "Required-check state has not propagated to PR #${pr_number}; retrying merge in 5s."
  sleep 5
done

[[ "$merge_sha" =~ ^[0-9a-f]{40}$ ]] || fail "Merge API returned an invalid commit SHA."
merged_pr_json="$(gh api \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  "repos/${GITHUB_REPOSITORY}/pulls/${pr_number}")"
jq -e --arg merge "$merge_sha" \
  '(.merged == true) and (.state == "closed") and (.merge_commit_sha == $merge)' \
  <<< "$merged_pr_json" >/dev/null || fail "PR merge state does not match returned commit ${merge_sha}."

current_main="$(gh api \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  "repos/${GITHUB_REPOSITORY}/git/ref/heads/main" --jq '.object.sha')"
[[ "$current_main" == "$merge_sha" ]] || \
  fail "main is ${current_main}, expected freshly merged commit ${merge_sha}; refusing a stale deploy."
verify_merge_parent "$merge_sha"

delete_automation_branch
write_outputs "$merge_sha" "$pr_number" "$ci_run_id"
{
  echo "### Generated change merged"
  echo
  echo "- PR: #${pr_number}"
  echo "- CI run: ${ci_run_id}"
  echo "- Merge SHA: \`${merge_sha}\`"
} >> "$GITHUB_STEP_SUMMARY"
