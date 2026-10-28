import { describe, expect, it } from "vitest";
import { resolveDocumentRole } from "@/lib/permissions";

describe("document permissions", () => {
  const owner = "owner-user";
  const other = "other-user";

  it("always gives the owner full ownership", () => {
    expect(resolveDocumentRole(owner, owner, "viewer")).toBe("owner");
  });

  it("grants editors and viewers only their assigned role", () => {
    expect(resolveDocumentRole(owner, other, "editor")).toBe("editor");
    expect(resolveDocumentRole(owner, other, "viewer")).toBe("viewer");
  });

  it("denies users without a recognized share", () => {
    expect(resolveDocumentRole(owner, other, null)).toBeNull();
    expect(resolveDocumentRole(owner, other, "admin")).toBeNull();
  });
});
