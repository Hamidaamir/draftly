"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { documentIdSchema, documentOwnerNamesSchema, parseTiptapDocument, saveDocumentSchema, shareSchema, shareUpdateSchema, titleSchema, validateDocumentContent } from "@/lib/validation";
import type { Collaborator, DocumentRecord, DocumentSummary, Json } from "@/lib/types";
import { resolveDocumentRole } from "@/lib/permissions";
import { formatDocumentDate } from "@/lib/date-format";

const EMPTY_DOCUMENT: Json = { type: "doc", content: [{ type: "paragraph" }] };

function logDocumentCreationError(stage: "authentication" | "insert" | "select", error: { code?: string; message: string }) {
  if (process.env.NODE_ENV !== "development") return;
  console.error(`[Draftly] Document creation ${stage} failed`, {
    code: error.code,
    message: error.message,
  });
}

async function authenticatedClient() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Your session has expired. Sign in again.");
  return { supabase, user };
}

export async function createDocument(title = "Untitled document", content: unknown = EMPTY_DOCUMENT): Promise<{ error: string } | { id: string }> {
  const parsedTitle = titleSchema.safeParse(title);
  if (!parsedTitle.success) return { error: parsedTitle.error.issues[0]?.message ?? "Choose a valid document title." };
  let validContent: Json;
  try {
    validContent = validateDocumentContent(content);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Document content is invalid." };
  }
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    ({ supabase } = await authenticatedClient());
  } catch (error) {
    logDocumentCreationError("authentication", {
      message: error instanceof Error ? error.message : "Unknown authentication error",
    });
    return { error: "Your session has expired. Sign in again." };
  }
  const id = randomUUID();
  const { error: insertError } = await supabase
    .from("documents")
    .insert({ id, title: parsedTitle.data, content: validContent });
  if (insertError) {
    logDocumentCreationError("insert", insertError);
    return { error: "Your document couldn't be created. Please try again." };
  }

  const { data, error: selectError } = await supabase
    .from("documents")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (selectError) {
    logDocumentCreationError("select", selectError);
    return { error: "Your document was created, but couldn't be opened. Refresh your workspace or try again." };
  }
  if (!data) {
    logDocumentCreationError("select", { message: "The inserted document was not visible to the follow-up SELECT." });
    return { error: "Your document was created, but couldn't be opened. Refresh your workspace or try again." };
  }
  revalidatePath("/workspace");
  return { id: data.id };
}

export async function getWorkspaceDocuments(): Promise<{ owned: DocumentSummary[]; shared: DocumentSummary[]; name: string | null }> {
  const { supabase, user } = await authenticatedClient();
  const [{ data: ownData, error: ownError }, { data: shareData, error: shareError }, { data: profile, error: profileError }] = await Promise.all([
    supabase.from("documents").select("id,title,updated_at,owner_id").eq("owner_id", user.id).order("updated_at", { ascending: false }),
    supabase.from("document_shares").select("document_id,permission").eq("shared_with_user_id", user.id),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
  ]);
  if (ownError || shareError || profileError) throw new Error("Your documents couldn't be loaded. Refresh to try again.");
  const shares = shareData ?? [];
  const sharedDocuments = shares.length
    ? await supabase.from("documents").select("id,title,updated_at,owner_id").in("id", shares.map((share) => share.document_id)).order("updated_at", { ascending: false })
    : { data: [], error: null };
  if (sharedDocuments.error) throw new Error("Shared documents couldn't be loaded. Refresh to try again.");
  const sharedIds = (sharedDocuments.data ?? []).map((document) => document.id);
  const ownerNames = sharedIds.length
    ? await supabase.rpc("get_document_owner_names", { target_document_ids: sharedIds })
    : { data: [], error: null };
  if (ownerNames.error) throw new Error("Document owner details couldn't be loaded.");
  const parsedOwnerNames = documentOwnerNamesSchema.safeParse(ownerNames.data ?? []);
  if (!parsedOwnerNames.success) throw new Error("Document owner details couldn't be loaded.");
  const ownerNameById = new Map<string, string | null>(
    parsedOwnerNames.data.map((owner): [string, string | null] => [owner.document_id, owner.display_name]),
  );
  const permissionById = new Map(shares.map((share) => [share.document_id, share.permission]));
  const owned: DocumentSummary[] = (ownData ?? []).map((document) => ({
    ...document,
    updated_label: formatDocumentDate(document.updated_at),
    role: "owner",
    owner_name: profile?.display_name ?? null,
  }));
  const shared: DocumentSummary[] = (sharedDocuments.data ?? []).map((document) => ({
      ...document,
      updated_label: formatDocumentDate(document.updated_at),
      role: permissionById.get(document.id) === "editor" ? "editor" : "viewer",
      owner_name: ownerNameById.get(document.id) ?? null,
    }));
  return { owned, shared, name: profile?.display_name ?? user.user_metadata.display_name ?? user.email ?? null };
}

export async function getDocument(id: string): Promise<DocumentRecord | null> {
  const parsedId = documentIdSchema.safeParse(id);
  if (!parsedId.success) return null;
  const validId = parsedId.data;
  const { supabase, user } = await authenticatedClient();
  const { data, error } = await supabase
    .from("documents")
    .select("id,title,content,revision,updated_at,owner_id")
    .eq("id", validId)
    .maybeSingle();
  if (error) throw new Error("This document couldn't be loaded.");
  if (!data) return null;
  let permission: string | null = null;
  if (data.owner_id !== user.id) {
    const { data: share, error: shareError } = await supabase
      .from("document_shares")
      .select("permission")
      .eq("document_id", validId)
      .eq("shared_with_user_id", user.id)
      .maybeSingle();
    if (shareError) throw new Error("Document permissions couldn't be checked.");
    permission = share?.permission ?? null;
  }
  const role = resolveDocumentRole(data.owner_id, user.id, permission);
  if (!role) return null;
  return { ...data, content: parseTiptapDocument(data.content), role } as DocumentRecord;
}

export async function saveDocument(input: unknown): Promise<{ revision: number; updatedAt: string } | { error: string }> {
  const parsedInput = saveDocumentSchema.safeParse(input);
  if (!parsedInput.success) return { error: parsedInput.error.issues[0]?.message ?? "The save request is invalid." };
  const values = parsedInput.data;
  let content: Json;
  try {
    content = validateDocumentContent(values.content);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Document content is invalid." };
  }
  const id = values.id;
  const title = values.title;
  if (!Number.isSafeInteger(values.revision)) return { error: "This document has changed. Reload it before saving." };
  const { supabase } = await authenticatedClient();
  const { data, error } = await supabase
    .from("documents")
    .update({ title, content, revision: values.revision + 1 })
    .eq("id", id)
    .eq("revision", values.revision)
    .select("revision,updated_at")
    .maybeSingle();
  if (error) return { error: "Your changes couldn't be saved. Check your connection and retry." };
  if (!data) return { error: "This document changed elsewhere. Reload it before continuing." };
  revalidatePath(`/documents/${id}`);
  revalidatePath("/workspace");
  return { revision: data.revision, updatedAt: data.updated_at };
}

export async function deleteDocument(id: string) {
  const parsedId = documentIdSchema.safeParse(id);
  if (!parsedId.success) return { error: "This document link is invalid." };
  const validId = parsedId.data;
  const { supabase } = await authenticatedClient();
  const { data, error } = await supabase.from("documents").delete().eq("id", validId).select("id").maybeSingle();
  if (error) return { error: "This document couldn't be deleted." };
  if (!data) return { error: "This document no longer exists or you don't own it." };
  revalidatePath("/workspace");
  return { ok: true };
}

export async function listCollaborators(documentId: string): Promise<{ data?: Collaborator[]; error?: string }> {
  const parsedId = documentIdSchema.safeParse(documentId);
  if (!parsedId.success) return { error: "This document link is invalid." };
  const id = parsedId.data;
  const { supabase } = await authenticatedClient();
  const { data, error } = await supabase.rpc("list_document_collaborators", { target_document_id: id });
  if (error) return { error: "Collaborators couldn't be loaded." };
  return { data: (data ?? []) as Collaborator[] };
}

export async function addCollaborator(input: { documentId: string; email: string; permission: "viewer" | "editor" }) {
  const parsed = shareSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a valid email address." };
  const values = parsed.data;
  const { supabase } = await authenticatedClient();
  const { error } = await supabase.rpc("share_document_with_email", {
    target_document_id: values.documentId,
    recipient_email: values.email.toLowerCase(),
    granted_permission: values.permission,
  });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("recipient_not_found")) return { error: "No account exists for that email yet. Ask them to sign up first." };
    if (message.includes("already_shared")) return { error: "This person already has access to the document." };
    if (message.includes("cannot_share_with_self")) return { error: "You already own this document." };
    return { error: "Sharing couldn't be updated. Check that you own this document and try again." };
  }
  revalidatePath(`/documents/${values.documentId}`);
  revalidatePath("/workspace");
  return { ok: true };
}

export async function updateCollaborator(input: { documentId: string; userId: string; permission: "viewer" | "editor" }) {
  const parsed = shareUpdateSchema.safeParse(input);
  if (!parsed.success) return { error: "The requested permission update is invalid." };
  const values = parsed.data;
  const { supabase } = await authenticatedClient();
  const { data, error } = await supabase
    .from("document_shares")
    .update({ permission: values.permission })
    .eq("document_id", values.documentId)
    .eq("shared_with_user_id", values.userId)
    .select("id")
    .maybeSingle();
  if (error) return { error: "That permission couldn't be changed." };
  if (!data) return { error: "That collaborator no longer has access, or you don't own this document." };
  revalidatePath(`/documents/${values.documentId}`);
  return { ok: true };
}

export async function removeCollaborator(documentId: string, userId: string) {
  const parsedId = documentIdSchema.safeParse(documentId);
  const parsedCollaboratorId = documentIdSchema.safeParse(userId);
  if (!parsedId.success || !parsedCollaboratorId.success) return { error: "The collaborator details are invalid." };
  const id = parsedId.data;
  const collaboratorId = parsedCollaboratorId.data;
  const { supabase } = await authenticatedClient();
  const { data, error } = await supabase
    .from("document_shares")
    .delete()
    .eq("document_id", id)
    .eq("shared_with_user_id", collaboratorId)
    .select("id")
    .maybeSingle();
  if (error) return { error: "This person's access couldn't be removed." };
  if (!data) return { error: "That collaborator no longer has access, or you don't own this document." };
  revalidatePath(`/documents/${id}`);
  return { ok: true };
}
