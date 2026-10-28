import { z } from "zod";
import type { JSONContent } from "@tiptap/core";
import type { Json } from "@/lib/types";

export const titleSchema = z
  .string()
  .trim()
  .min(1, "Give your document a title.")
  .max(120, "Titles must be 120 characters or fewer.");

export const documentIdSchema = z.string().uuid("This document link is invalid.");

export const shareSchema = z.object({
  documentId: documentIdSchema,
  email: z.string().trim().email("Enter a valid email address.").max(254),
  permission: z.enum(["viewer", "editor"]),
});

export const shareUpdateSchema = z.object({
  documentId: documentIdSchema,
  userId: z.string().uuid(),
  permission: z.enum(["viewer", "editor"]),
});

export const saveDocumentSchema = z.object({
  id: documentIdSchema,
  title: titleSchema,
  content: z.unknown(),
  revision: z.number().int().nonnegative(),
});

export const documentOwnerNamesSchema = z.array(z.object({
  document_id: z.string().uuid(),
  display_name: z.string().nullable(),
}));

const tiptapDocumentSchema = z.object({
  type: z.literal("doc"),
  content: z.array(z.record(z.string(), z.unknown())).optional(),
});

export function validateDocumentContent(value: unknown): Json {
  const parsed = tiptapDocumentSchema.safeParse(value);
  if (!parsed.success) throw new Error("Document content is invalid.");
  const json = JSON.stringify(parsed.data);
  if (new TextEncoder().encode(json).byteLength > 1_000_000) throw new Error("Documents must be smaller than 1 MB.");
  let nodeCount = 0;
  const inspect = (node: unknown, depth: number): void => {
    nodeCount += 1;
    if (depth > 40 || nodeCount > 20_000) throw new Error("Document content is too complex.");
    if (typeof node !== "object" || node === null) return;
    if (Array.isArray(node)) {
      for (const child of node) inspect(child, depth + 1);
      return;
    }
    for (const child of Object.values(node)) inspect(child, depth + 1);
  };
  inspect(parsed.data, 0);
  return parsed.data as Json;
}

export function parseTiptapDocument(value: unknown): JSONContent {
  const document = validateDocumentContent(value);
  if (typeof document !== "object" || document === null || Array.isArray(document)) {
    throw new Error("Document content is invalid.");
  }
  const convertNode = (value: Json): JSONContent => {
    if (typeof value !== "object" || value === null || Array.isArray(value) || typeof value.type !== "string") {
      throw new Error("Document content is invalid.");
    }
    const node: JSONContent = { type: value.type };
    if (typeof value.text === "string") node.text = value.text;
    if (Array.isArray(value.content)) node.content = value.content.map(convertNode);
    if (typeof value.attrs === "object" && value.attrs !== null && !Array.isArray(value.attrs)) node.attrs = value.attrs;
    if (Array.isArray(value.marks)) {
      node.marks = value.marks.map((mark) => {
        if (typeof mark !== "object" || mark === null || Array.isArray(mark) || typeof mark.type !== "string") {
          throw new Error("Document content is invalid.");
        }
        return {
          type: mark.type,
          ...(typeof mark.attrs === "object" && mark.attrs !== null && !Array.isArray(mark.attrs) ? { attrs: mark.attrs } : {}),
        };
      });
    }
    return node;
  };
  return {
    type: "doc",
    ...(Array.isArray(document.content) ? { content: document.content.map(convertNode) } : {}),
  };
}
