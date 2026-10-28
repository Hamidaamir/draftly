import type { DocumentRole } from "@/lib/types";

export function resolveDocumentRole(
  ownerId: string,
  userId: string,
  permission: string | null | undefined,
): DocumentRole | null {
  if (ownerId === userId) return "owner";
  if (permission === "editor" || permission === "viewer") return permission;
  return null;
}
