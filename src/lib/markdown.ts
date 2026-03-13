import { marked } from "marked";

/**
 * Robust markdown → HTML converter for article content.
 * Now uses the `marked` library to perfectly parse tables, lists, and headings
 * regardless of minor formatting inconsistencies from the AI.
 */
export function markdownToHtml(md: string): string {
  // Parse the markdown synchronously
  return marked.parse(md, { async: false }) as string;
}
