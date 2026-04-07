# Task Plan - Fix Deployment & Workspace Cleanup

The objective is to resolve the build failure in production caused by a parameter mismatch and hide diagnostic logs from the git workspace.

## Phases

### Phase 1: Environment Cleanup (Staged)
- [ ] Add `data/logs/` and `data/cache/` to `.gitignore`.
- [ ] Delete untracked diagnostic `.json` files.

### Phase 2: Code Alignment
- [ ] Verify `scripts/lib/token-selection.ts` has the 7-argument signature.
- [ ] Verify `scripts/post-video-daily.ts` uses the 7-argument call.
- [ ] Run `npm run lint` locally.

### Phase 3: Deployment
- [ ] Commit all changes with a clean message.
- [ ] Push to `main`.
- [ ] Monitor GitHub Actions for a green build.

## Decisions
- **Log Management:** We will ignore `data/logs/` entirely rather than deleting them every time, as they are useful for local debugging but noise for Git.
- **Git State:** I will use `git add .` to ensure the "Staged vs Unstaged" confusion from the previous turn doesn't happen again.
