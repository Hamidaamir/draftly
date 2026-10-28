import type { Json } from "@/lib/types";
import { validateDocumentContent } from "@/lib/validation";

export const IMPORT_LIMIT_BYTES = 1_000_000;

export function validateImportFile(file: Pick<File, "name" | "size" | "type">): string | null {
  const extension = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase();
  if (extension !== "txt" && extension !== "md") return "Choose a .txt or .md file.";
  if (!file.size) return "This file is empty. Choose a text or Markdown file with content.";
  if (file.size > IMPORT_LIMIT_BYTES) return "Files must be 1 MB or smaller.";
  if (file.type && !["text/plain", "text/markdown", "text/x-markdown", "application/octet-stream"].includes(file.type)) {
    return "This file type is not supported.";
  }
  return null;
}

export async function parseImportFile(file: File): Promise<Json> {
  const validationError = validateImportFile(file);
  if (validationError) throw new Error(validationError);

  let bytes: ArrayBuffer;
  try {
    bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error("File reading failed."));
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) resolve(reader.result);
        else reject(new Error("File reader returned an unsupported result."));
      };
      reader.readAsArrayBuffer(file);
    });
  } catch {
    throw new Error("This file couldn't be read. Check that the file is available and try again.");
  }
  if (bytes.byteLength > IMPORT_LIMIT_BYTES) throw new Error("Files must be 1 MB or smaller.");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("This file isn't valid UTF-8 text. Save it as a plain text or Markdown file and try again.");
  }
  if (!text.trim()) throw new Error("This file has no readable text to import.");
  if (text.includes("\0")) throw new Error("This file contains binary data and can't be imported as text.");

  try {
    return markdownToTiptap(text);
  } catch {
    throw new Error("This file couldn't be converted to a valid document. Check its contents and try again.");
  }
}

type Mark = { type: "bold" | "italic"; attrs?: Record<string, never> };
type InlineNode = { type: "text"; text: string; marks?: Mark[] };
type BlockNode = { type: string; attrs?: { level?: number }; content?: InlineNode[] | BlockNode[] };

function inlineNodes(source: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  const pattern = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3/g;
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push({ type: "text", text: source.slice(cursor, index) });
    const strong = Boolean(match[1]);
    nodes.push({
      type: "text",
      text: strong ? match[2] : match[4],
      marks: [{ type: strong ? "bold" : "italic" }],
    });
    cursor = index + match[0].length;
  }
  if (cursor < source.length) nodes.push({ type: "text", text: source.slice(cursor) });
  return nodes;
}

export function markdownToTiptap(source: string): Json {
  const blocks: BlockNode[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        attrs: { level: heading[1].length },
        content: inlineNodes(heading[2]),
      });
      index += 1;
      continue;
    }
    const listMatch = /^\s*(?:[-*+]|\d+[.)])\s+/.exec(line);
    if (listMatch) {
      const ordered = /^\s*\d/.test(line);
      const items: BlockNode[] = [];
      while (index < lines.length && /^\s*(?:[-*+]|\d+[.)])\s+/.test(lines[index])) {
        const text = lines[index].replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "");
        items.push({ type: "listItem", content: [{ type: "paragraph", content: inlineNodes(text) }] });
        index += 1;
      }
      blocks.push({ type: ordered ? "orderedList" : "bulletList", content: items });
      continue;
    }
    const paragraph = [line.trim()];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,3})\s+/.test(lines[index]) &&
      !/^\s*(?:[-*+]|\d+[.)])\s+/.test(lines[index])
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", content: inlineNodes(paragraph.join(" ")) });
  }
  return validateDocumentContent({ type: "doc", content: blocks });
}

export function filenameTitle(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Untitled document";
}
