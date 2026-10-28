import { describe, expect, it } from "vitest";
import { formatDocumentDate } from "@/lib/date-format";

describe("formatDocumentDate", () => {
  it("uses a stable UTC month and day independent of browser locale or timezone", () => {
    expect(formatDocumentDate("2026-10-28T23:30:00-07:00")).toBe("Oct 29");
    expect(formatDocumentDate("2026-01-03T00:00:00Z")).toBe("Jan 3");
  });

  it("renders invalid timestamps without throwing", () => {
    expect(formatDocumentDate("not-a-date")).toBe("—");
  });
});
