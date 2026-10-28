import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createDocument } from "@/app/actions/documents";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const userId = "c3c4dbf8-b978-4aa3-8ea4-bd80a22235be";
let selectedId = "";
const mockMaybeSingle = vi.fn(async (): Promise<{
  data: { id: string } | null;
  error: { code?: string; message: string } | null;
}> => ({ data: { id: selectedId }, error: null }));
const mockEq = vi.fn((_column: string, value: string) => {
  selectedId = value;
  return { maybeSingle: mockMaybeSingle };
});
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockInsert = vi.fn();
const mockFrom = vi.fn((_table?: string) => ({ insert: mockInsert, select: mockSelect }));
const mockGetUser = vi.fn();
const mockConsoleError = vi.spyOn(console, "error").mockImplementation(() => {});
const callOrder: string[] = [];

function configureClient() {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: () => {
        callOrder.push("getUser");
        return mockGetUser();
      },
    },
    from: (table: string) => {
      callOrder.push(`from:${table}`);
      return mockFrom(table);
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

describe("createDocument server action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callOrder.length = 0;
    selectedId = "";
    mockGetUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
    mockInsert.mockResolvedValue({ error: null });
    mockMaybeSingle.mockImplementation(() => Promise.resolve({ data: { id: selectedId }, error: null }));
    configureClient();
  });

  it("inserts with a generated ID without RETURNING, then fetches the row separately", async () => {
    const result = await createDocument();

    expect(mockGetUser).toHaveBeenCalledOnce();
    expect(callOrder).toEqual(["getUser", "from:documents", "from:documents"]);
    expect(mockFrom).toHaveBeenCalledTimes(2);
    expect(mockInsert).toHaveBeenCalledOnce();
    const inserted = mockInsert.mock.calls[0]?.[0];
    expect(result).toEqual({ id: inserted.id });
    expect(inserted).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      title: "Untitled document",
      content: { type: "doc", content: [{ type: "paragraph" }] },
    });
    expect(inserted).not.toHaveProperty("owner_id");
    expect(mockSelect).toHaveBeenCalledWith("id");
    expect(mockEq).toHaveBeenCalledWith("id", inserted.id);

    const migrationPath = path.join(process.cwd(), "supabase", "migrations", "20261028000001_documents_owner_default.sql");
    const migration = await readFile(migrationPath, "utf8");
    expect(migration).toMatch(/alter column owner_id set default auth\.uid\(\)/i);
  });

  it("preserves imported title and Tiptap content", async () => {
    const content = { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Imported" }] }] };

    await createDocument("Meeting notes", content);

    expect(mockInsert).toHaveBeenCalledWith({
      id: expect.any(String),
      title: "Meeting notes",
      content,
    });
  });

  it("does not insert or fetch when there is no authenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(createDocument()).resolves.toEqual({ error: "Your session has expired. Sign in again." });
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns a friendly error and safe diagnostics when INSERT fails", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mockInsert.mockResolvedValue({
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

    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockConsoleError).toHaveBeenCalledWith("[Draftly] Document creation insert failed", {
      code: "42501",
      message: 'new row violates row-level security policy for table "documents"',
    });
    expect(mockConsoleError).not.toHaveBeenCalledWith(expect.stringContaining("do-not-log"), expect.anything());
  });

  it("returns an explicit error and logs safely when the follow-up SELECT fails", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mockMaybeSingle.mockResolvedValue({ data: null, error: { code: "42501", message: "select policy denied" } });

    await expect(createDocument()).resolves.toEqual({
      error: "Your document was created, but couldn't be opened. Refresh your workspace or try again.",
    });
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockConsoleError).toHaveBeenCalledWith("[Draftly] Document creation select failed", {
      code: "42501",
      message: "select policy denied",
    });
  });

  it("does not report success when the inserted row is not visible to SELECT", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(createDocument()).resolves.toEqual({
      error: "Your document was created, but couldn't be opened. Refresh your workspace or try again.",
    });
    expect(mockConsoleError).toHaveBeenCalledWith("[Draftly] Document creation select failed", {
      message: "The inserted document was not visible to the follow-up SELECT.",
    });
  });

  it("rejects invalid titles before authentication or database access", async () => {
    await expect(createDocument("   ")).resolves.toEqual({ error: "Give your document a title." });
    expect(createClient).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
