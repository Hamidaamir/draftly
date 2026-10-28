import { describe, expect, it } from "vitest";
import { filenameTitle, markdownToTiptap, parseImportFile, validateImportFile } from "@/lib/import";
import { titleSchema, validateDocumentContent } from "@/lib/validation";

describe("document validation", () => {
  it("requires a non-empty title no longer than 120 characters", () => {
    expect(titleSchema.safeParse("  Notes  ").data).toBe("Notes");
    expect(titleSchema.safeParse("  ").success).toBe(false);
    expect(titleSchema.safeParse("a".repeat(121)).success).toBe(false);
  });

  it("rejects malformed or oversized editor content", () => {
    expect(() => validateDocumentContent({ type: "paragraph" })).toThrow("Document content is invalid.");
    expect(() => validateDocumentContent({ type: "doc", content: [{ text: "x".repeat(1_000_001) }] })).toThrow("smaller than 1 MB");
  });

  it("rejects excessively nested editor content", () => {
    let node: Record<string, unknown> = { type: "paragraph" };
    for (let depth = 0; depth < 45; depth += 1) node = { type: "wrapper", content: [node] };
    expect(() => validateDocumentContent({ type: "doc", content: [node] })).toThrow("too complex");
  });
});

describe("text and Markdown import", () => {
  it("supports plain text and Markdown under the upload limit", () => {
    expect(validateImportFile({ name: "notes.txt", size: 12, type: "text/plain" })).toBeNull();
    expect(validateImportFile({ name: "notes.md", size: 12, type: "text/markdown" })).toBeNull();
    expect(validateImportFile({ name: "notes.md", size: 1_000_000, type: "text/markdown" })).toBeNull();
    expect(validateImportFile({ name: ".md", size: 12, type: "text/markdown" })).toBeNull();
    expect(validateImportFile({ name: "notes.html", size: 12, type: "text/html" })).toContain(".txt or .md");
    expect(validateImportFile({ name: "notes.md", size: 12, type: "text/html" })).toContain("file type");
    expect(validateImportFile({ name: "notes.md", size: 0, type: "text/markdown" })).toContain("empty");
    expect(validateImportFile({ name: "notes.md", size: 1_000_001, type: "text/markdown" })).toContain("1 MB");
  });

  it("parses UTF-8 text/Markdown and rejects empty, binary, and malformed input", async () => {
    const markdown = new File(["# Imported\n\nReadable text"], "notes.md", { type: "text/markdown" });
    await expect(parseImportFile(markdown)).resolves.toMatchObject({
      type: "doc",
      content: [{ type: "heading", attrs: { level: 1 } }, { type: "paragraph" }],
    });

    await expect(parseImportFile(new File([" \n "], "empty.txt", { type: "text/plain" })))
      .rejects.toThrow("no readable text");
    await expect(parseImportFile(new File(["\0binary"], "binary.txt", { type: "text/plain" })))
      .rejects.toThrow("binary data");
    const malformed = new File([new Uint8Array([0xc3, 0x28])], "bad.md", { type: "text/markdown" });
    await expect(parseImportFile(malformed)).rejects.toThrow("UTF-8");
  });

  it("converts Markdown headings, inline marks, and lists to Tiptap JSON", () => {
    const result = markdownToTiptap("# Notes\n\nA **bold** word and *emphasis*.\n\n- one\n- two");
    expect(result).toMatchObject({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 } },
        { type: "paragraph", content: expect.arrayContaining([{ type: "text", text: "bold", marks: [{ type: "bold" }] }]) },
        { type: "bulletList", content: [{ type: "listItem" }, { type: "listItem" }] },
      ],
    });
    expect(filenameTitle("meeting-notes.md")).toBe("meeting notes");
  });

  it("keeps HTML imports as inert text instead of parsing HTML", () => {
    expect(markdownToTiptap("<script>alert('unsafe')</script>")).toMatchObject({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "<script>alert('unsafe')</script>" }] }],
    });
  });
});
