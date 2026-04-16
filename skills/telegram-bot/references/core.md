# Telegram Bot API Reference (TokenRadar)

## Markdown vs HTML
While Telegram supports both, the TokenRadar project standardizes on **HTML** for the `parse_mode`.

### Supported HTML Tags
- `<b>bold</b>`, `<strong>bold</strong>`
- `<i>italic</i>`, `<em>italic</em>`
- `<u>underline</u>`, `<ins>underline</ins>`
- `<s>strikethrough</s>`, `<strike>strikethrough</strike>`, `<del>strikethrough</del>`
- `<span class="tg-spoiler">spoiler</span>`, `<tg-spoiler>spoiler</tg-spoiler>`
- `<b>bold <i>italic bold <s>italic bold strikethrough</s> <u>underline italic bold</u></i> bold</b>`
- `<a href="http://www.example.com/">inline URL</a>`
- `<a href="tg://user?id=123456789">inline mention of a user</a>`
- `<tg-emoji emoji-id="5368324170671202286">👍</tg-emoji>`
- `<code>inline fixed-width code</code>`
- `<pre>pre-formatted fixed-width code block</pre>`
- `<pre><code class="language-python">pre-formatted fixed-width code block written in the Python programming language</code></pre>`
- `<blockquote>quoted text</blockquote>`
- `<blockquote expandable>expandable quoted text</blockquote>`

## API Limits

| Resource | Limit |
|----------|-------|
| Messages per second | 30 (to all users/chats combined) |
| Messages per minute | 20 (to a single group/channel) |
| Message Length | 4,096 characters |
| Photo Caption | 1,024 characters |
| Video Caption | 1,024 characters |
| Poll Options | 10 (each 100 chars) |
| Group/Channel Admins | 50 |

## Token & Channel IDs

- **`TELEGRAM_BOT_TOKEN`**: Obtain from [@BotFather](https://t.me/botfather).
- **`TELEGRAM_CHANNEL_ID`**: Typically starts with `-100...` for public channels. To find yours, add [@userinfobot](https://t.me/userinfobot) to the channel or check the URL in TG Desktop.

## grammY Context
We use `grammY` because of its better error handling and reactive middleware.

```typescript
import { Bot } from "grammy";
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

// Standard echo agent
bot.on("message", (ctx) => ctx.reply("I'm an AI agent!"));
```

## Security Best Practices
- Never log the `TELEGRAM_BOT_TOKEN` to console or `reporter.ts`.
- Use `fetchWithRetry` internally for all direct API calls to handle temporary network blips.
