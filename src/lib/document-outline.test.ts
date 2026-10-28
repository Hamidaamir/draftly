import { describe, expect, it } from "vitest";
import { getDocumentOutline } from "@/lib/document-outline";

describe("document outline", () => {
  it("extracts non-empty headings in document order with their levels and positions", () => {
    expect(getDocumentOutline({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Overview" }] },
        { type: "paragraph", content: [{ type: "text", text: "Intro" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Details" }] },
        { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "  " }] },
      ],
    })).toEqual([
      { position: 0, level: 1, text: "Overview" },
      { position: 17, level: 2, text: "Details" },
    ]);
  });
});
