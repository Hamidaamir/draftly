import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "@/components/workspace";

const mocks = vi.hoisted(() => ({
  createDocument: vi.fn(),
  signOut: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/app/actions/documents", () => ({ createDocument: mocks.createDocument }));
vi.mock("@/app/actions/auth", () => ({ signOut: mocks.signOut }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

describe("Workspace file import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not submit rejected file extensions", async () => {
    render(<Workspace owned={[]} shared={[]} name="A Writer" />);
    const input = screen.getAllByLabelText("Import text or Markdown file")[0];
    const file = new File(["<h1>unsafe</h1>"], "notes.html", { type: "text/html" });

    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByRole("alert")).toHaveTextContent(".txt or .md");
    expect(mocks.createDocument).not.toHaveBeenCalled();
  });

  it("blocks overlapping imports while the first document is being created", async () => {
    let finishCreate!: (result: { id: string }) => void;
    mocks.createDocument.mockReturnValueOnce(new Promise((resolve) => { finishCreate = resolve; }));
    render(<Workspace owned={[]} shared={[]} name="A Writer" />);
    const input = screen.getAllByLabelText("Import text or Markdown file")[0];

    fireEvent.change(input, {
      target: { files: [new File(["First draft"], "first.txt", { type: "text/plain" })] },
    });
    await waitFor(() => expect(mocks.createDocument).toHaveBeenCalledOnce());
    fireEvent.change(input, {
      target: { files: [new File(["Second draft"], "second.txt", { type: "text/plain" })] },
    });

    expect(mocks.createDocument).toHaveBeenCalledOnce();
    await act(async () => finishCreate({ id: "c6884a5f-3a4b-4c9f-b18e-d543c60cdb83" }));
    expect(mocks.push).toHaveBeenCalledWith("/documents/c6884a5f-3a4b-4c9f-b18e-d543c60cdb83");
  });
});
