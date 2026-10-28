import type { JSONContent } from "@tiptap/core";

export type DocumentOutlineEntry = {
  position: number;
  level: number;
  text: string;
};

function nodeSize(node: JSONContent): number {
  if (typeof node.text === "string") return node.text.length;
  if (!node.content) return 1;
  return node.content.reduce((size, child) => size + nodeSize(child), 0) + 2;
}

function getText(node: JSONContent): string {
  return (node.text ?? "") + (node.content ?? []).map(getText).join("");
}

export function getDocumentOutline(document: JSONContent): DocumentOutlineEntry[] {
  const entries: DocumentOutlineEntry[] = [];

  function visit(nodes: JSONContent[], parentPosition: number) {
    let offset = 0;
    for (const node of nodes) {
      const position = parentPosition + 1 + offset;
      if (node.type === "heading" && typeof node.attrs?.level === "number") {
        const text = getText(node).trim();
        if (text) entries.push({ position, level: node.attrs.level, text });
      }
      if (node.content) visit(node.content, position);
      offset += nodeSize(node);
    }
  }

  if (document.content) visit(document.content, -1);
  return entries;
}
