import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createDocument } from "@/app/actions/documents";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const userId = "c3c4dbf8-b978-4aa3-8ea4-bd80a22235be";
const documentId = "c6884a5f-3a4b-4c9f-b18e-d543c60cdb83";
const mockSingle = vi.fn();
const mockSelect = vi.fn(() => ({ single: mockSingle }));
const mockMaybeSingle = vi.fn();
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockLookupSelect = vi.fn(() => ({ eq: mockEq }));
const mockInsert = vi.fn((_values: { id?: string; title: string; content: unknown }) => ({ select: mockSelect }));
const mockFrom = vi.fn((_table?: string) => ({ insert: mockInsert, select: mockLookupSelect }));
const mockGetUser = vi.fn();
const mockRpc = vi.fn();
const mockConsoleError = vi.spyOn(console, "error").mockImplementation(() => {});
const mockConsoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
const mockConsoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
const callOrder: string[] = [];

function configureClient() {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: () => {
      callOrder.push("getUser");
      return mockGetUser();
    } },
    rpc: (functionName: string) => {
      callOrder.push("rpc");
      return mockRpc(functionName);
    },
    from: (table: string) => {
      callOrder.push("from");
      return mockFrom(table);
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

describe("createDocument server action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callOrder.length = 0;
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DRAFTLY_DIAGNOSE_DOCUMENT_INSERT", "");
    mockGetUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
    mockRpc.mockResolvedValue({ data: [{ uid: userId, role: "authenticated" }], error: null });
    mockSingle.mockResolvedValue({ data: { id: documentId }, error: null });
    mockMaybeSingle.mockResolvedValue({ data: { id: documentId }, error: null });
    configureClient();
  });

  it("creates an owned document using the authenticated session and database owner default", async () => {
    const result = await createDocument();

    expect(result).toEqual({ id: "c6884a5f-3a4b-4c9f-b18e-d543c60cdb83" });
    expect(mockGetUser).toHaveBeenCalledOnce();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(callOrder).toEqual(["getUser", "from"]);
    expect(mockFrom).toHaveBeenCalledWith("documents");
    expect(mockInsert).toHaveBeenCalledWith({
      title: "Untitled document",
      content: { type: "doc", content: [{ type: "paragraph" }] },
    });

    const migrationPath = path.join(process.cwd(), "supabase", "migrations", "20261028000001_documents_owner_default.sql");
    const migration = await readFile(migrationPath, "utf8");
    expect(migration).toMatch(/alter column owner_id set default auth\.uid\(\)/i);
  });

  it("preserves imported title and Tiptap content in the insert", async () => {
    const content = { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Imported" }] }] };
    const result = await createDocument("Meeting notes", content);

    expect(result).toHaveProperty("id");
    expect(mockInsert).toHaveBeenCalledWith({ title: "Meeting notes", content });
  });

  it("does not attempt insertion when there is no authenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(createDocument()).resolves.toEqual({ error: "Your session has expired. Sign in again." });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns a friendly error and logs only safe database diagnostics on insert failure", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mockSingle.mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: 'new row violates row-level security policy for table "documents"',
        details: "access_token=do-not-log",
        hint: "service_role_key=do-not-log",
      },
    });

    await expect(createDocument()).resolves.toEqual({
      error: "Your document couldn't be created. Please try again.",
    });

    expect(mockConsoleError).toHaveBeenCalledWith("[Draftly] Document creation insert failed", {
      code: "42501",
      message: 'new row violates row-level security policy for table "documents"',
    });
    expect(mockConsoleError).not.toHaveBeenCalledWith(expect.stringContaining("do-not-log"), expect.anything());
  });

  it("logs only the returned auth uid and role in development before inserting", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DRAFTLY_DIAGNOSE_DOCUMENT_INSERT", "1");
    mockRpc.mockResolvedValue({ data: [{ uid: userId, role: "authenticated" }], error: null });

    await createDocument();

    expect(mockConsoleInfo).toHaveBeenCalledWith("[Draftly] Document creation auth context", {
      uid: userId,
      role: "authenticated",
    });
    expect(callOrder).toEqual(["getUser", "rpc", "from", "from"]);
  });

  it("reports a null database uid without blocking creation when session user exists", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DRAFTLY_DIAGNOSE_DOCUMENT_INSERT", "1");
    mockRpc.mockResolvedValue({ data: [{ uid: null, role: "authenticated" }], error: null });

    await createDocument();

    expect(mockConsoleInfo).toHaveBeenCalledWith("[Draftly] Document creation auth context", {
      uid: null,
      role: "authenticated",
    });
  });

  it("logs auth context RPC errors in development and still attempts the insert", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DRAFTLY_DIAGNOSE_DOCUMENT_INSERT", "1");
    mockRpc.mockResolvedValue({ data: null, error: { code: "42883", message: "function does not exist" } });

    const result = await createDocument();

    expect(result).toHaveProperty("id");
    expect(mockConsoleWarn).toHaveBeenCalledWith("[Draftly] Document creation auth context RPC failed", {
      code: "42883",
      message: "function does not exist",
    });
    expect(callOrder).toEqual(["getUser", "rpc", "from", "from"]);
  });

  it("diagnoses insert and SELECT separately when the development flag is enabled", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DRAFTLY_DIAGNOSE_DOCUMENT_INSERT", "1");

    await expect(createDocument()).resolves.toEqual({ id: documentId });

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      title: "Untitled document",
      content: { type: "doc", content: [{ type: "paragraph" }] },
    }));
    const insertedId = mockInsert.mock.calls[0]?.[0]?.id;
    expect(insertedId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockLookupSelect).toHaveBeenCalledWith("id");
    expect(mockEq).toHaveBeenCalledWith("id", insertedId);
  });

  it("reports an INSERT-stage RLS error without attempting the follow-up SELECT", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DRAFTLY_DIAGNOSE_DOCUMENT_INSERT", "1");
    const insertError = {
      code: "42501",
      message: 'new row violates row-level security policy for table "documents"',
    };
    mockFrom.mockImplementationOnce(() => ({
      insert: vi.fn().mockResolvedValue({ error: insertError }),
      select: mockLookupSelect,
    }));

    await expect(createDocument()).resolves.toEqual({
      error: "Your document couldn't be created. Please try again.",
    });

    expect(mockLookupSelect).not.toHaveBeenCalled();
    expect(mockConsoleError).toHaveBeenCalledWith("[Draftly] Document creation insert failed", insertError);
  });

  it("reports a missing row as a follow-up SELECT visibility failure", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DRAFTLY_DIAGNOSE_DOCUMENT_INSERT", "1");
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(createDocument()).resolves.toEqual({
      error: "Your document couldn't be created. Please try again.",
    });

    expect(mockConsoleError).toHaveBeenCalledWith("[Draftly] Document creation select failed", {
      message: "The inserted document was not visible to the follow-up SELECT.",
    });
  });

  it("does not enable the split diagnostic path outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DRAFTLY_DIAGNOSE_DOCUMENT_INSERT", "1");

    await createDocument();

    expect(mockSingle).toHaveBeenCalledOnce();
    expect(mockLookupSelect).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects invalid titles before authentication or database access", async () => {
    await expect(createDocument("   ")).resolves.toEqual({ error: "Give your document a title." });
    expect(createClient).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
