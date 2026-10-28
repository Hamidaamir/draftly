import type { JSONContent } from "@tiptap/core";

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type DocumentRole = "owner" | "editor" | "viewer";

export interface DocumentSummary {
  id: string;
  title: string;
  updated_at: string;
  updated_label: string;
  owner_id: string;
  role: DocumentRole;
  owner_name: string | null;
}

export interface DocumentRecord {
  id: string;
  title: string;
  content: JSONContent;
  revision: number;
  updated_at: string;
  owner_id: string;
  role: DocumentRole;
}

export interface Collaborator {
  user_id: string;
  email: string;
  display_name: string | null;
  permission: "viewer" | "editor";
}
