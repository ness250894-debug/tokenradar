---
name: telegram-bot
description: >
  Use this skill for any request involving Telegram Bot interactions, including
  sending market updates, creating interactive polls, managing channel content,
  and handling user interaction via the TokenRadar bot. Trigger this skill 
  whenever the user wants to "post to TG", "create a TG poll", or automate
  Telegram-specific workflows.
---

# Telegram Bot Skill

## When to use

Trigger this skill when the user's request matches **any** of the following:

### Content Distribution
- Sending a market update or technical analysis to the Telegram channel.
- Creating an interactive poll (Sentiment, Prediction, etc.).
- Sending photos (Movers cards) or videos (YouTube Shorts/Reels cross-posts).
- Using the `grammY` SDK to create custom Inline Keyboards (e.g. for TMA links).

### Agentic AI & Replying
- Responding to an incoming message from a user in the bot's private chat.
- Triggering an autonomous "Research & Post" cycle for a specific token.
- Summarizing recent channel engagement or poll results.

### Configuration
- Setting up or updating `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHANNEL_ID`.
- Managing webhook registration for Next.js/Cloudflare deployments.

---

## Capabilities & Tools

You have access to the **Shared Telegram Client** (`src/lib/telegram.ts`), which is powered by the **grammY** SDK.

### Core Methods:
- `sendTelegramMessage(text, chatId)`: Sends an HTML-formatted message.
- `sendTelegramPoll(question, options, chatId)`: Sends a native TG poll.
- `sendTelegramPhoto(buffer, caption, chatId)`: Sends a photo with an HTML caption.
- `createTelegramKeyboard(buttons)`: Creates an `InlineKeyboard` for interactive links.

---

## STRICT RULE — Character Limits & Formatting

**1. HTML Formatting:** Telegram only supports a subset of HTML. Always use `<b>`, `<i>`, `<code>`, and `<a>` tags. Avoid complex nesting.
- Use `<b>TEXT</b>` for emphasis.
- Use `<code>CODE</code>` for contract addresses or price figures.

**2. Poll Limits:** 
- Question: Max 300 characters.
- Options: Max 10 options, each max 100 characters.

**3. Captions:** Captions for photos/videos are limited to 1,024 characters. If the text is longer, send it as a separate message immediately after the media.

---

## Workflow

### Step 1 — Identify the Update Type
Determine if the objective is a **Market Update**, a **Poll**, or a **Movers Card**.

### Step 2 — Check Credentials
Ensure `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHANNEL_ID` are available in `.env.local`.

### Step 3 — Draft Content
Use the AI summary logic from `src/lib/gemini.ts` to draft the post. ensure it follows the "Data-driven but slightly degen" TokenRadar voice.

### Step 4 — Execute
Call the appropriate method from `src/lib/telegram.ts`.

---

## Reference index

| File | Purpose |
|---|---|
| `src/lib/telegram.ts` | The primary implementation for all Telegram actions. |
| `skills/telegram-bot/references/core.md` | Deep dive into TG Bot API limits and formatting. |
| `scripts/post-market-updates.ts` | Example of automated channel posting. |
| `src/app/api/telegram/webhook/route.ts` | Entry point for reactive agentic behavior. |
