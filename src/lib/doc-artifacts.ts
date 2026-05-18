export interface MarkdownHeading {
  level: number;
  text: string;
  slug: string;
  line: number;
}

export interface MarkdownSection {
  heading: string;
  level: number;
  lineStart: number;
  lineEnd: number;
  content: string;
}

export interface MarkdownDocumentArtifact {
  name: string;
  documentType: "markdown_document_representation";
  version: number;
  updatedAt: string;
  sourcePath: string | null;
  sourceStatus?: string;
  htmlArtifact: string;
  jsonArtifact: string;
  title: string;
  stats: {
    lineCount: number;
    wordCount: number;
    headingCount: number;
    codeBlockCount: number;
    tableCount: number;
    linkCount: number;
  };
  headings: MarkdownHeading[];
  links: string[];
  tables: string[];
  codeBlocks: string[];
  sections: MarkdownSection[];
  rawMarkdown: string;
}

export interface BuildMarkdownDocumentArtifactOptions {
  name: string;
  title: string;
  rawMarkdown: string;
  sourcePath: string | null;
  sourceStatus?: string;
  htmlArtifact: string;
  jsonArtifact: string;
  updatedAt: string;
  version: number;
}

export interface RenderDocumentHtmlOptions {
  jsonFilename: string;
  sourceLabel: string;
}

function slugifyHeading(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInlineMarkdown(value: string): string {
  return escapeHtml(value).replace(/`([^`]+)`/g, "<code>$1</code>");
}

function extractHeadings(lines: string[]): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+(.+)$/.exec(lines[index]);
    if (!match) continue;
    const text = match[2].trim();
    headings.push({
      level: match[1].length,
      text,
      slug: slugifyHeading(text),
      line: index + 1,
    });
  }
  return headings;
}

function buildSections(lines: string[], headings: MarkdownHeading[]): MarkdownSection[] {
  return headings.map((heading, index) => {
    const lineStart = heading.line;
    const lineEnd = index + 1 < headings.length ? headings[index + 1].line - 1 : lines.length;
    return {
      heading: heading.text,
      level: heading.level,
      lineStart,
      lineEnd,
      content: lines.slice(lineStart - 1, lineEnd).join("\n"),
    };
  });
}

function countMarkdownTables(lines: string[]): number {
  let count = 0;
  for (let index = 0; index < lines.length - 1; index += 1) {
    const current = lines[index].trim();
    const next = lines[index + 1].trim();
    if (
      current.startsWith("|") &&
      current.endsWith("|") &&
      next.startsWith("|") &&
      /^\|\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(next)
    ) {
      count += 1;
    }
  }
  return count;
}

function extractCodeBlocks(rawMarkdown: string): string[] {
  return Array.from(rawMarkdown.matchAll(/```[\s\S]*?```/g), (match) => match[0]);
}

function extractMarkdownLinks(rawMarkdown: string): string[] {
  return Array.from(rawMarkdown.matchAll(/(?<!!)\[[^\]]+\]\([^)]+\)/g), (match) => match[0]);
}

export function buildMarkdownDocumentArtifact(
  options: BuildMarkdownDocumentArtifactOptions,
): MarkdownDocumentArtifact {
  const rawMarkdown = options.rawMarkdown.replace(/\r\n/g, "\n");
  const lines = rawMarkdown.split("\n");
  const headings = extractHeadings(lines);
  const codeBlocks = extractCodeBlocks(rawMarkdown);
  const links = extractMarkdownLinks(rawMarkdown);

  return {
    name: options.name,
    documentType: "markdown_document_representation",
    version: options.version,
    updatedAt: options.updatedAt,
    sourcePath: options.sourcePath,
    sourceStatus: options.sourceStatus,
    htmlArtifact: options.htmlArtifact,
    jsonArtifact: options.jsonArtifact,
    title: options.title,
    stats: {
      lineCount: lines.length,
      wordCount: (rawMarkdown.match(/\S+/g) || []).length,
      headingCount: headings.length,
      codeBlockCount: codeBlocks.length,
      tableCount: countMarkdownTables(lines),
      linkCount: links.length,
    },
    headings,
    links,
    tables: [],
    codeBlocks,
    sections: buildSections(lines, headings),
    rawMarkdown,
  };
}

function renderMarkdownBody(rawMarkdown: string): string {
  const lines = rawMarkdown.split("\n");
  const html: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      html.push(`<h${level} id="${slugifyHeading(text)}">${renderInlineMarkdown(text)}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^-\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^-\s+/.test(lines[index])) {
        items.push(`<li>${renderInlineMarkdown(lines[index].replace(/^-\s+/, ""))}</li>`);
        index += 1;
      }
      html.push(`<ul>\n${items.join("\n")}\n</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(`<li>${renderInlineMarkdown(lines[index].replace(/^\d+\.\s+/, ""))}</li>`);
        index += 1;
      }
      html.push(`<ol>\n${items.join("\n")}\n</ol>`);
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,6})\s+/.test(lines[index]) &&
      !/^-\s+/.test(lines[index]) &&
      !/^\d+\.\s+/.test(lines[index])
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    html.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
  }

  return html.join("\n");
}

export function renderDocumentHtml(
  artifact: MarkdownDocumentArtifact,
  options: RenderDocumentHtmlOptions,
): string {
  const outline = artifact.headings
    .map((heading) => (
      `<li class="level-${heading.level}"><a href="#${heading.slug}">${escapeHtml(heading.text)}</a> <span>line ${heading.line}</span></li>`
    ))
    .join("");
  const retiredMatch = artifact.sourceStatus?.match(/^retired:\s*(.+?)\s+deleted after artifact update$/);
  const retiredSource = retiredMatch?.[1] ? `; legacy <code>${escapeHtml(retiredMatch[1])}</code> retired` : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(artifact.title)} - TokenRadar Docs</title>
    <style>
      :root { color-scheme: dark; --bg: #0b0d10; --panel: #151922; --panel-2: #10141b; --line: #2c3443; --text: #f5f7fb; --muted: #aeb8c8; --soft: #768297; --cyan: #31c7d7; --green: #35d18a; --amber: #f2b84b; --blue: #7aa2ff; }
      * { box-sizing: border-box; }
      body { margin: 0; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.5; }
      main { width: min(1180px, calc(100vw - 40px)); margin: 0 auto; padding: 44px 0 64px; }
      h1, h2, h3, p { margin-top: 0; }
      h1 { max-width: 980px; margin-bottom: 12px; font-size: clamp(34px, 5vw, 62px); line-height: 1.02; letter-spacing: 0; }
      h2 { margin: 28px 0 14px; font-size: 26px; }
      h3 { margin: 24px 0 10px; color: var(--text); font-size: 19px; }
      p, .content, .content ul, .content ol, .outline ol { color: var(--muted); }
      a { color: var(--cyan); text-decoration: none; }
      a:hover { text-decoration: underline; }
      code { color: #dce6f7; font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace; font-size: 0.92em; }
      pre { overflow-x: auto; margin: 14px 0; padding: 16px; border: 1px solid var(--line); border-radius: 8px; background: #070a0f; }
      pre code { color: #dce6f7; white-space: pre; }
      .lead { max-width: 900px; margin-bottom: 0; color: var(--muted); font-size: 18px; }
      .section { margin-top: 22px; padding: 24px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel-2); }
      .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
      .box { min-height: 116px; padding: 18px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
      .box p { margin-bottom: 0; }
      .tag { display: inline-block; margin-bottom: 10px; color: var(--cyan); font-size: 12px; font-weight: 800; letter-spacing: 0; text-transform: uppercase; }
      .tag.green { color: var(--green); }
      .tag.amber { color: var(--amber); }
      .tag.blue { color: var(--blue); }
      .content h1 { margin-top: 0; font-size: 36px; }
      .content ul, .content ol { margin: 10px 0 16px; padding-left: 22px; }
      .content li + li, .outline li + li { margin-top: 6px; }
      .outline ol { margin: 0; padding-left: 22px; }
      .outline .level-2 { margin-left: 16px; }
      .outline span { color: var(--soft); font-size: 12px; }
      @media (max-width: 920px) { .grid { grid-template-columns: 1fr; } }
      @media (max-width: 640px) { main { width: min(100vw - 28px, 1180px); padding-top: 30px; } .section { padding: 18px; } }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>${escapeHtml(artifact.title)}</h1>
        <p class="lead">Standalone HTML representation of the TokenRadar document. The paired JSON file preserves the raw Markdown, extracted headings, sections, and document statistics.</p>
      </header>

      <section class="section">
        <h2>Document Contract</h2>
        <div class="grid">
          <div class="box"><span class="tag green">Source</span><h3><code>${escapeHtml(options.sourceLabel)}</code></h3><p>Artifact-maintained source of record${retiredSource}.</p></div>
          <div class="box"><span class="tag blue">Structure</span><h3>${artifact.stats.headingCount} headings</h3><p>${artifact.stats.codeBlockCount} code blocks, ${artifact.stats.tableCount} tables, ${artifact.stats.linkCount} Markdown links.</p></div>
          <div class="box"><span class="tag amber">Pair</span><h3><a href="${escapeHtml(options.jsonFilename)}">${escapeHtml(options.jsonFilename)}</a></h3><p>Machine-readable representation of this same document.</p></div>
        </div>
      </section>

      <section class="section outline">
        <h2>Outline</h2>
        <ol>${outline}</ol>
      </section>

      <section class="section content">
${renderMarkdownBody(artifact.rawMarkdown)}
      </section>

      <section class="section">
        <h2>Raw Markdown</h2>
        <pre><code>${escapeHtml(artifact.rawMarkdown)}</code></pre>
      </section>
    </main>
  </body>
</html>
`;
}
