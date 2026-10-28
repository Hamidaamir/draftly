import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@/components/editor";
import { deleteDocument, saveDocument } from "@/app/actions/documents";

const mocks = vi.hoisted(() => ({
  editor: null as unknown,
  editorOptions: null as unknown,
  content: null as unknown,
  push: vi.fn(),
  selectTextPosition: vi.fn(),
  saveDocument: vi.fn(),
  deleteDocument: vi.fn(),
}));

vi.mock("@tiptap/react", () => ({
  EditorContent: () => null,
  useEditor: (options: unknown) => {
    mocks.editorOptions = options;
    return mocks.editor;
  },
}));
vi.mock("@/app/actions/documents", () => ({
  saveDocument: mocks.saveDocument,
  deleteDocument: mocks.deleteDocument,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

type TestContent = { type: string; attrs?: Record<string, number>; text?: string; content?: TestContent[] };
type TestEditor = { getJSON: () => TestContent };
type EditorOptions = {
  onCreate: (event: { editor: TestEditor }) => void;
  onUpdate: (event: { editor: TestEditor }) => void;
};

const initialContent = { type: "doc" as const, content: [{ type: "paragraph" }] };

describe("Editor autosave", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mocks.saveDocument.mockResolvedValue({ revision: 5 });
    mocks.content = initialContent;
    const chain = {
      focus: () => chain,
      setTextSelection: (position: number) => { mocks.selectTextPosition(position); return chain; },
      setLink: () => chain,
      toggleBold: () => chain,
      toggleItalic: () => chain,
      toggleUnderline: () => chain,
      toggleHeading: () => chain,
      setParagraph: () => chain,
      toggleBulletList: () => chain,
      toggleOrderedList: () => chain,
      toggleBlockquote: () => chain,
      undo: () => chain,
      redo: () => chain,
      run: () => true,
    };
    mocks.editor = {
      getJSON: () => mocks.content as TestContent,
      chain: () => chain,
      can: () => ({ undo: () => true, redo: () => true }),
      isActive: () => false,
      view: { nodeDOM: () => null },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves updated Tiptap JSON after the debounce with the current revision", async () => {
    render(<Editor document={{
      id: "c6884a5f-3a4b-4c9f-b18e-d543c60cdb83",
      title: "Notes",
      content: initialContent,
      revision: 4,
      updated_at: "2026-10-28T00:00:00Z",
      owner_id: "c3c4dbf8-b978-4aa3-8ea4-bd80a22235be",
      role: "owner",
    }} />);

    const titleInput = screen.getByRole("textbox", { name: "Document title" });
    fireEvent.change(titleInput, { target: { value: "Updated notes" } });
    await act(async () => vi.advanceTimersByTimeAsync(799));
    expect(saveDocument).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(saveDocument).toHaveBeenCalledWith({
      id: "c6884a5f-3a4b-4c9f-b18e-d543c60cdb83",
      title: "Updated notes",
      content: initialContent,
      revision: 4,
    });
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("feeds updated editor JSON into the existing autosave flow", async () => {
    const updatedContent = { type: "doc" as const, content: [{ type: "heading" }] };
    const fakeEditor = mocks.editor as TestEditor;
    mocks.content = updatedContent;
    render(<Editor document={{
      id: "c6884a5f-3a4b-4c9f-b18e-d543c60cdb83",
      title: "Notes",
      content: initialContent,
      revision: 4,
      updated_at: "2026-10-28T00:00:00Z",
      owner_id: "c3c4dbf8-b978-4aa3-8ea4-bd80a22235be",
      role: "owner",
    }} />);

    const editorOptions = mocks.editorOptions as EditorOptions;
    await act(async () => editorOptions.onUpdate({ editor: fakeEditor }));
    await act(async () => vi.advanceTimersByTimeAsync(800));

    expect(saveDocument).toHaveBeenCalledWith(expect.objectContaining({ content: updatedContent, revision: 4 }));
  });

  it("navigates to a selected heading from the live outline", async () => {
    const headingContent = {
      type: "doc",
      content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Overview" }] }],
    };
    mocks.content = headingContent;
    render(<Editor document={{
      id: "c6884a5f-3a4b-4c9f-b18e-d543c60cdb83",
      title: "Notes",
      content: initialContent,
      revision: 4,
      updated_at: "2026-10-28T00:00:00Z",
      owner_id: "c3c4dbf8-b978-4aa3-8ea4-bd80a22235be",
      role: "owner",
    }} />);

    await act(async () => (mocks.editorOptions as EditorOptions).onCreate({ editor: mocks.editor as TestEditor }));
    fireEvent.click(screen.getByRole("button", { name: "Overview" }));

    expect(mocks.selectTextPosition).toHaveBeenCalledWith(1);
  });

  it("shows a confirmed delete action only to the owner and returns to workspace on success", async () => {
    mocks.deleteDocument.mockResolvedValue({ ok: true });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const ownerDocument = {
      id: "c6884a5f-3a4b-4c9f-b18e-d543c60cdb83",
      title: "Notes",
      content: initialContent,
      revision: 4,
      updated_at: "2026-10-28T00:00:00Z",
      owner_id: "c3c4dbf8-b978-4aa3-8ea4-bd80a22235be",
      role: "owner" as const,
    };
    const view = render(<Editor document={ownerDocument} />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Delete document" })));
    expect(confirm).toHaveBeenCalledOnce();
    expect(deleteDocument).toHaveBeenCalledWith(ownerDocument.id);
    expect(mocks.push).toHaveBeenCalledWith("/workspace");

    view.rerender(<Editor document={{ ...ownerDocument, role: "editor" }} />);
    expect(screen.queryByRole("button", { name: "Delete document" })).not.toBeInTheDocument();
    view.rerender(<Editor document={{ ...ownerDocument, role: "viewer" }} />);
    expect(screen.queryByRole("button", { name: "Delete document" })).not.toBeInTheDocument();
    confirm.mockRestore();
  });
});
