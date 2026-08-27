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

find_successful_attested_ci_run() {
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
    if verify_ci_run "$candidate_run_id" && verify_required_status "$candidate_run_id"; then
      echo "$candidate_run_id"
      return 0
    fi
  done < <(jq -r '.workflow_runs[] | .id' <<< "$runs_json")

  return 1
}

required_status_target_url() {
  local run_id="$1"

  echo "https://github.com/${GITHUB_REPOSITORY}/actions/runs/${run_id}"
}

verify_required_status() {
  local run_id="$1"
  local target_url
  local combined_status_json
  local statuses_json

  target_url="$(required_status_target_url "$run_id")"
  combined_status_json="$(gh api \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2026-03-10" \
    "repos/${GITHUB_REPOSITORY}/commits/${HEAD_SHA}/status")"
  jq -e \
    --arg head "$HEAD_SHA" \
    --arg target "$target_url" \
    '(.sha == $head) and
     any(
       .statuses[]?;
       (.context == "Required checks") and
       (.state == "success") and
       (.target_url == $target)
     )' \
    <<< "$combined_status_json" >/dev/null || return 1

  # Combined-status entries omit creator metadata. Read the exact commit's
  # status list as well so the attestation must come from GitHub Actions.
  statuses_json="$(gh api --method GET \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2026-03-10" \
    "repos/${GITHUB_REPOSITORY}/commits/${HEAD_SHA}/statuses" \
    -F per_page=100)"
  jq -e \
    --arg target "$target_url" \
    'any(
      .[]?;
      (.context == "Required checks") and
      (.state == "success") and
      (.target_url == $target) and
      (.creator.login == "github-actions[bot]") and
      (.creator.type == "Bot")
    )' \
    <<< "$statuses_json" >/dev/null
}

publish_required_status() {
  local run_id="$1"
  local attempt
  local target_url
  local status_payload
  local status_json

  target_url="$(required_status_target_url "$run_id")"
  status_payload="$(jq -nc \
    --arg target_url "$target_url" \
    --arg description "Exact-head CI run ${run_id} succeeded" \
    '{
      state: "success",
      context: "Required checks",
      description: $description,
      target_url: $target_url
    }')"
  status_json="$(gh api --method POST \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2026-03-10" \
    "repos/${GITHUB_REPOSITORY}/statuses/${HEAD_SHA}" \
    --input - <<< "$status_payload")"
  jq -e \
    --arg target "$target_url" \
    '(.context == "Required checks") and
     (.state == "success") and
     (.target_url == $target) and
     (.creator.login == "github-actions[bot]") and
     (.creator.type == "Bot")' \
    <<< "$status_json" >/dev/null || \
    fail "GitHub did not return the expected Required checks status for ${HEAD_SHA}."
  for attempt in $(seq 1 12); do
    if verify_required_status "$run_id"; then
      return 0
    fi
    sleep 2
  done
  fail "Required checks status was not readable on exact head ${HEAD_SHA}."
}

verify_merge_commit() {
  local merge_sha="$1"
  local commit_json expected_tree

  expected_tree="$(git rev-parse "${HEAD_SHA}^{tree}")"
  [[ "$expected_tree" =~ ^[0-9a-f]{40}$ ]] || \
    fail "Generated head ${HEAD_SHA} has no valid tree SHA."

  commit_json="$(gh api \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2026-03-10" \
    "repos/${GITHUB_REPOSITORY}/git/commits/${merge_sha}")"
  jq -e --arg base "$BASE_SHA" --arg tree "$expected_tree" \
    '(.parents | length == 1) and
     (.parents[0].sha == $base) and
     (.tree.sha == $tree)' \
    <<< "$commit_json" >/dev/null || \
    fail "Squash merge ${merge_sha} does not exactly apply the generated tree to recorded base ${BASE_SHA}."
}

wait_for_main_at_merge() {
  local merge_sha="$1"
  local attempt current_main

  # The authenticated merge response is authoritative. The pull-request
  # resource can lag behind a completed merge, so wait only for the exact
  # returned commit to become the main ref.
  for attempt in $(seq 1 30); do
    current_main="$(gh api \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2026-03-10" \
      "repos/${GITHUB_REPOSITORY}/git/ref/heads/main" --jq '.object.sha')"
    if [[ "$current_main" == "$merge_sha" ]]; then
      return 0
    fi

    [[ "$current_main" == "$BASE_SHA" ]] || \
      fail "main advanced to unexpected commit ${current_main} while waiting for merge ${merge_sha}."

    if (( attempt < 30 )); then
      echo "Merge ${merge_sha} is not the main ref yet; retrying verification in 2s."
      sleep 2
    fi
  done

  fail "main did not advance from ${BASE_SHA} to authenticated merge ${merge_sha}."
}

wait_for_main_after_recorded_base() {
  local attempt current_main

  # A merged PR can temporarily omit merge_commit_sha. In that case, discover
  # the candidate from main and authenticate it later by its exact parent and
  # generated tree rather than trusting eventually consistent PR metadata.
  for attempt in $(seq 1 30); do
    current_main="$(gh api \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2026-03-10" \
      "repos/${GITHUB_REPOSITORY}/git/ref/heads/main" --jq '.object.sha')"
    [[ "$current_main" =~ ^[0-9a-f]{40}$ ]] || fail "main returned an invalid commit SHA."
    if [[ "$current_main" != "$BASE_SHA" ]]; then
      printf '%s\n' "$current_main"
      return 0
    fi

    if (( attempt < 30 )); then
      echo "Merged PR #${pr_number} is not visible on main yet; retrying verification in 2s." >&2
      sleep 2
    fi
  done

  fail "Merged PR #${pr_number} did not advance main from recorded base ${BASE_SHA}."
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

  # Collection responses can lag behind the canonical pull-request resource.
  # Use the collection only for discovery, then reload the PR before deciding
  # whether this is an open change, a closed change, or an idempotent rerun.
  pr_json="$(gh api \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2026-03-10" \
    "repos/${GITHUB_REPOSITORY}/pulls/${pr_number}")"
  jq -e \
    --argjson number "$pr_number" \
    --arg branch "$AUTOMATION_BRANCH" \
    --arg head "$HEAD_SHA" \
    --arg base "$BASE_SHA" \
    '(.number == $number) and
     ((.state == "open") or (.state == "closed")) and
     ((.merged == true) or (.merged == false)) and
     (.head.ref == $branch) and
     (.head.sha == $head) and
     (.base.ref == "main") and
     (.base.sha == $base)' \
    <<< "$pr_json" >/dev/null || \
    fail "PR #${pr_number} no longer matches the generated change."
  pr_state="$(jq -r '.state' <<< "$pr_json")"

  if [[ "$(jq -r '.merged' <<< "$pr_json")" == "true" ]]; then
    [[ "$pr_state" == "closed" ]] || fail "Merged PR #${pr_number} is not closed."
    pr_merged=true
    fetch_ref="refs/pull/${pr_number}/head"
  fi
fi

current_main="$(gh api \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  "repos/${GITHUB_REPOSITORY}/git/ref/heads/main" --jq '.object.sha')"
[[ "$current_main" =~ ^[0-9a-f]{40}$ ]] || fail "main returned an invalid commit SHA."
if [[ "$pr_merged" == "true" ]]; then
  if [[ "$current_main" == "$BASE_SHA" ]]; then
    existing_merge_sha="$(wait_for_main_after_recorded_base)"
  else
    existing_merge_sha="$current_main"
  fi
  current_main="$existing_merge_sha"
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
  verify_merge_commit "$existing_merge_sha"
  ci_run_id="$(find_successful_attested_ci_run)" || \
    fail "Merged PR #${pr_number} has no successful, attested exact-head workflow_dispatch CI run."
  verify_required_status "$ci_run_id" || \
    fail "Merged PR #${pr_number} has no trusted Required checks status for its exact generated head."
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

# workflow_dispatch checks validate the exact generated branch but are not
# surfaced as the PR's required status. Bridge only the already-verified result
# onto the exact head, from this trusted job, before asking GitHub to merge.
publish_required_status "$ci_run_id"

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
wait_for_main_at_merge "$merge_sha"
verify_merge_commit "$merge_sha"

delete_automation_branch
write_outputs "$merge_sha" "$pr_number" "$ci_run_id"
{
  echo "### Generated change merged"
  echo
  echo "- PR: #${pr_number}"
  echo "- CI run: ${ci_run_id}"
  echo "- Merge SHA: \`${merge_sha}\`"
} >> "$GITHUB_STEP_SUMMARY"
