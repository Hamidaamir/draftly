import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShareDialog } from "@/components/share-dialog";
import { addCollaborator, listCollaborators, removeCollaborator, updateCollaborator } from "@/app/actions/documents";

vi.mock("@/app/actions/documents", () => ({
  addCollaborator: vi.fn(),
  listCollaborators: vi.fn(),
  removeCollaborator: vi.fn(),
  updateCollaborator: vi.fn(),
}));

const mockedAdd = vi.mocked(addCollaborator);
const mockedList = vi.mocked(listCollaborators);
const mockedUpdate = vi.mocked(updateCollaborator);
const mockedRemove = vi.mocked(removeCollaborator);

describe("ShareDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedList.mockResolvedValue({ data: [] });
    mockedAdd.mockResolvedValue({ error: "No account exists for that email yet. Ask them to sign up first." });
    mockedUpdate.mockResolvedValue({ error: "That permission couldn't be changed." });
    mockedRemove.mockResolvedValue({ ok: true });
  });

  it("announces invite failures and lets the owner choose a permission", async () => {
    render(<ShareDialog documentId="3e20eb6b-d79a-4b9d-9f50-3c47d2d23e10" onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Email address" }), {
      target: { value: "missing@example.com" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Permission" }), {
      target: { value: "editor" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No account exists");
    expect(mockedAdd).toHaveBeenCalledWith({
      documentId: "3e20eb6b-d79a-4b9d-9f50-3c47d2d23e10",
      email: "missing@example.com",
      permission: "editor",
    });
  });

  it("keeps an existing permission unchanged when the update fails", async () => {
    mockedAdd.mockResolvedValue({ ok: true });
    mockedList.mockResolvedValue({
      data: [{
        user_id: "c3c4dbf8-b978-4aa3-8ea4-bd80a22235be",
        email: "writer@example.com",
        display_name: "Writer",
        permission: "viewer",
      }],
    });
    render(<ShareDialog documentId="3e20eb6b-d79a-4b9d-9f50-3c47d2d23e10" onClose={vi.fn()} />);

    const permission = await screen.findByRole("combobox", { name: "Permission for writer@example.com" });
    fireEvent.change(permission, { target: { value: "editor" } });

    expect(await screen.findByRole("alert")).toHaveTextContent("permission couldn't be changed");
    expect(permission).toHaveValue("viewer");
    expect(mockedUpdate).toHaveBeenCalledWith({
      documentId: "3e20eb6b-d79a-4b9d-9f50-3c47d2d23e10",
      userId: "c3c4dbf8-b978-4aa3-8ea4-bd80a22235be",
      permission: "editor",
    });
  });

  it("closes on Escape and returns keyboard interaction to the opener", async () => {
    const onClose = vi.fn();
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const view = render(<ShareDialog documentId="3e20eb6b-d79a-4b9d-9f50-3c47d2d23e10" onClose={onClose} />);

    fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape" });

    expect(onClose).toHaveBeenCalledOnce();
    view.unmount();
    await waitFor(() => expect(document.activeElement).toBe(opener));
    opener.remove();
  });

  it("asks for confirmation before revoking a collaborator", async () => {
    mockedList.mockResolvedValue({
      data: [{
        user_id: "c3c4dbf8-b978-4aa3-8ea4-bd80a22235be",
        email: "writer@example.com",
        display_name: "Writer",
        permission: "viewer",
      }],
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ShareDialog documentId="3e20eb6b-d79a-4b9d-9f50-3c47d2d23e10" onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove writer@example.com" }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(mockedRemove).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});
