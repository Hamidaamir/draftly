import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "@/components/theme-toggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.dataset.theme = "light";
  });

  it("persists the selected theme and updates the document palette", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("draftly-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Toggle theme" })).toBeInTheDocument();
  });

  it("restores a saved dark theme", async () => {
    window.localStorage.setItem("draftly-theme", "dark");
    render(<ThemeToggle />);

    expect(await screen.findByRole("button", { name: "Toggle theme" })).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
