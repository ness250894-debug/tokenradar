---
name: x-platform
description: >
  Use this skill for any request involving X (Twitter) interactions, including
  posting tweets, creating polls, searching for trending crypto narratives, 
  fetching user data, and managing social engagement. Trigger this skill 
  whenever the user wants to research "what is being said on X" about a token,
  post a market update, or automate social media workflows for TokenRadar.
---

# X (Twitter) Skill

## When to use

Trigger this skill when the user's request matches **any** of the following:

### Social Research & Listening
- Searching for recent tweets about a specific token (e.g., "$SOL sentiment").
- Identifying trending crypto narratives or hashtags on X.
- Looking up official accounts for crypto projects or developers.
- Analyzing "Social Dominance" or community buzz.

### Content Posting & Automation
- Posting a new tweet or a thread.
- Creating an interactive poll (Sentiment, Prediction, etc.).
- Posting a tweet with media (charts, movers cards).
- Replying to a specific tweet to create an engagement loop.

### Engagement & Monitoring
- Fetching mentions or replies to the @TokenRadar account.
- Checking worldwide or niche-specific trending topics.
- Matching X trends against the local TokenRadar registry.

---

## Capabilities & Tools

You have access to the **Shared X Client** (`src/lib/x-client.ts`), which provides a high-level wrapper around the `@xdevplatform/xdk` SDK.

### Core Methods:
- `postTweet(text, replyToId)`: Sends a plain-text tweet. Handles truncation and cashtag rules.
- `postTweetWithMedia(text, buffer, type)`: Sends a tweet with an image or video.
- `postPoll(options)`: Sends a native poll or a text-fallback poll.
- `searchTweets(query)`: [NEW] Searches for recent tweets matching a query.
- `getUserByUsername(username)`: [NEW] Fetches profile data for a specific user.
- `fetchXTrends()`: Fetches worldwide trending topics.

---

## STRUCT RULE — Social Etiquette & Rate Limits

**1. Respect Rate Limits:** X API v2 has very strict rate limits (especially on the Basic/Pro tiers).
- Avoid bulk searching in a tight loop.
- Consolidate research queries into a single focused search per token.

**2. One Cashtag Rule:** X (and our client) enforces a "one-cashtag-per-post" rule to avoid being flagged as spam.
- **Good:** "Is $SOL the new king of DeFi? 👇"
- **Bad:** "$SOL and $ETH are both pumping!" (The client will auto-strip the second `$`).

**3. Tone Consistency:** All posts should follow the TokenRadar brand voice:
- Data-driven, analytical, slightly degen but professional.
- Always include an actionable takeaway or a question to spark debate.

---

## Workflow

### Step 1 — Identify the Social Goal
Determine if the objective is **Research** (gathering data for an article) or **Action** (posting a tweet).

### Step 2 — Check Logic & Credentials
Ensure `X_OAUTH2_CLIENT_ID`, `X_OAUTH2_CLIENT_SECRET`, and `X_OAUTH2_REFRESH_TOKEN` are available in `.env.local`.

### Step 3 — Perform Research (if needed)
Use `searchTweets` to find recent sentiment before drafting a post. This ensures the agent isn't "posting into a vacuum."

### Step 4 — Draft and Execute
Use the `generateTweet` or `generatePollHook` AI utilities from `src/lib/gemini.ts` to create high-engagement copy that fits within the 280-character limit.

---

## Reference index

| File | Purpose |
|---|---|
| `src/lib/x-client.ts` | The primary implementation for all X actions. |
| `scripts/post-market-updates.ts` | Example of automated daily market alerting. |
| `scripts/post-interactive-daily.ts` | Example of AI-driven interactive polls. |
| `data/x-oauth-state.json` | Persistent storage for the rotating refresh token. |
