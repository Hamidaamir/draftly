"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ArrowLeft, Bold, Check, ChevronDown, Heading1, Heading2, Italic, List, ListOrdered, Link2, LoaderCircle, PanelLeftClose, PanelLeftOpen, Quote, Redo2, Share2, Trash2, Underline as UnderlineIcon, Undo2, X } from "lucide-react";
import { deleteDocument, saveDocument } from "@/app/actions/documents";
import { ShareDialog } from "@/components/share-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { getDocumentOutline, type DocumentOutlineEntry } from "@/lib/document-outline";
import type { DocumentRecord, Json } from "@/lib/types";

type SaveStatus = "saved" | "saving" | "failed" | "dirty";

export function Editor({ document }: { document: DocumentRecord }) {
  const [title, setTitle] = useState(document.title);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [showShare, setShowShare] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [outline, setOutline] = useState<DocumentOutlineEntry[]>([]);
  const [activeHeading, setActiveHeading] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [leaving, setLeaving] = useState(false);
  const editable = document.role !== "viewer";
  const router = useRouter();
  const latest = useRef({ title: document.title, content: document.content });
  const revision = useRef(document.revision);
  const changed = useRef(false);
  const inFlight = useRef(false);
  const saveFailure = useRef(false);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveLatestRef = useRef<() => Promise<void>>(async () => {});

  const editor = useEditor({
    extensions: [StarterKit],
    content: document.content,
    editable,
    immediatelyRender: false,
    editorProps: { attributes: { class: "tiptap-content", "aria-label": "Document content" } },
    onCreate({ editor: createdEditor }) {
      setOutline(getDocumentOutline(createdEditor.getJSON()));
    },
    onUpdate({ editor: updatedEditor }) {
      latest.current.content = updatedEditor.getJSON();
      setOutline(getDocumentOutline(updatedEditor.getJSON()));
      changed.current = true;
      setStatus("dirty");
      scheduleSave();
    },
    onSelectionUpdate({ editor: selectedEditor }) {
      const position = selectedEditor.state.selection.from;
      const currentOutline = getDocumentOutline(selectedEditor.getJSON());
      const active = [...currentOutline].reverse().find((entry) => entry.position <= position);
      setActiveHeading(active?.position ?? null);
    },
  });

  const saveLatest = useCallback(async () => {
    if (!changed.current || inFlight.current) return;
    inFlight.current = true;
    changed.current = false;
    saveFailure.current = false;
    setStatus("saving");
    setSaveError("");
    const snapshot = { ...latest.current, revision: revision.current };
    try {
      const result = await saveDocument({ id: document.id, ...snapshot });
      if ("error" in result) {
        changed.current = true;
        saveFailure.current = true;
        if (mounted.current) {
          setStatus("failed");
          setSaveError(result.error);
        }
      } else {
        revision.current = result.revision;
        if (mounted.current && changed.current) {
          setStatus("dirty");
          timer.current = setTimeout(() => void saveLatestRef.current(), 100);
        } else if (mounted.current) {
          setStatus("saved");
        }
      }
    } catch {
      changed.current = true;
      saveFailure.current = true;
      if (mounted.current) {
        setStatus("failed");
        setSaveError("Your changes couldn't be saved. Check your connection and retry.");
      }
    } finally {
      inFlight.current = false;
    }
  }, [document.id]);

  const scheduleSave = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveLatest(), 800);
  }, [saveLatest]);

  useEffect(() => {
    saveLatestRef.current = saveLatest;
  }, [saveLatest]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      if (!changed.current && !inFlight.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, []);

  function editTitle(value: string) {
    setTitle(value);
    latest.current.title = value;
    changed.current = true;
    setStatus("dirty");
    scheduleSave();
  }

  async function leaveEditor(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    const destination = event.currentTarget.href;
    if (!changed.current && !inFlight.current) {
      router.push(destination);
      return;
    }

    setLeaving(true);
    saveFailure.current = false;
    if (timer.current) clearTimeout(timer.current);
    try {
      while (changed.current || inFlight.current) {
        if (saveFailure.current) return;
        if (changed.current && !inFlight.current) {
          await saveLatest();
        } else {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
        }
      }
      router.push(destination);
    } finally {
      setLeaving(false);
    }
  }

  function tool(label: string, icon: React.ReactNode, onClick: () => void, active = false, disabled = !editable) {
    return <button type="button" className={`toolbar-button ${active ? "toolbar-active" : ""}`} aria-label={label} title={label} aria-pressed={active} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={onClick}>{icon}</button>;
  }

  function navigateToHeading(entry: DocumentOutlineEntry) {
    if (!editor) return;
    editor.chain().focus().setTextSelection(entry.position + 1).run();
    const heading = editor.view.nodeDOM(entry.position);
    if (heading instanceof HTMLElement) heading.scrollIntoView({ behavior: "smooth", block: "center" });
    setActiveHeading(entry.position);
  }

  function addLink() {
    if (!editor) return;
    const href = window.prompt("Enter a link URL");
    if (!href) return;
    let url: URL;
    try {
      url = new URL(href, window.location.origin);
    } catch {
      setSaveError("Enter a valid http, https, or mailto link.");
      return;
    }
    if (!["http:", "https:", "mailto:"].includes(url.protocol)) {
      setSaveError("Only http, https, and mailto links are supported.");
      return;
    }
    editor.chain().focus().setLink({ href: url.href }).run();
  }

  async function handleDeleteDocument() {
    if (deleting || !window.confirm("Delete this document permanently? This cannot be undone.")) return;
    setDeleting(true);
    setSaveError("");
    try {
      const result = await deleteDocument(document.id);
      if ("error" in result) {
        setSaveError(result.error ?? "This document couldn't be deleted.");
        setDeleting(false);
        return;
      }
      router.push("/workspace");
    } catch {
      setSaveError("This document couldn't be deleted. Check your connection and try again.");
      setDeleting(false);
    }
  }

  if (!editor) return <div className="editor-loading"><LoaderCircle className="spin" size={20} /> Opening document…</div>;
  return <div className="editor-shell">
    <header className="editor-header">
      <div className="editor-nav-actions">
        <button className="icon-button outline-toggle" type="button" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-label={sidebarCollapsed ? "Show document outline" : "Hide document outline"} title={sidebarCollapsed ? "Show outline" : "Hide outline"}>
          {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        <Link href="/workspace" className={`back-link ${leaving ? "back-link-pending" : ""}`} onClick={leaveEditor} aria-disabled={leaving}><ArrowLeft size={17} /><span>{leaving ? "Saving…" : "Workspace"}</span></Link>
      </div>
      <div className="editor-title-wrap"><input className="title-input" value={title} onChange={(event) => editTitle(event.target.value)} aria-label="Document title" maxLength={120} readOnly={!editable} /><span className={`save-status save-${status}`} aria-live="polite">{status === "saving" ? <><LoaderCircle size={13} className="spin" /> Saving…</> : status === "saved" ? <><Check size={13} /> Saved</> : status === "failed" ? <><X size={13} /> Save failed</> : "Unsaved changes"}</span></div>
      <div className="editor-actions">
        <ThemeToggle />
        {document.role === "owner" && <button className="button button-secondary share-button" onClick={() => setShowShare(true)}><Share2 size={16} /> Share</button>}
        {document.role === "owner" && <button className="button button-danger delete-document-button" type="button" onClick={() => void handleDeleteDocument()} disabled={deleting} aria-label="Delete document">
          {deleting ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}
          <span>{deleting ? "Deleting…" : "Delete"}</span>
        </button>}
        {editable && status === "failed" && <div className="actions-menu-wrap"><button className="icon-button" aria-label="Document actions" onClick={() => setShowMenu(!showMenu)}><ChevronDown size={18} /></button>{showMenu && <div className="actions-menu">
          {status === "failed" && <button onClick={() => { changed.current = true; void saveLatest(); setShowMenu(false); }}>Retry saving</button>}
        </div>}</div>}
      </div>
    </header>
    {saveError && <div className="save-error" role="alert">{saveError}<button onClick={() => { changed.current = true; void saveLatest(); }}>Retry</button></div>}
    <div className="format-toolbar" role="toolbar" aria-label="Text formatting">
      {tool("Bold", <Bold size={17} />, () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"))}
      {tool("Italic", <Italic size={17} />, () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"))}
      {tool("Underline", <UnderlineIcon size={17} />, () => editor.chain().focus().toggleUnderline().run(), editor.isActive("underline"))}
      <span className="toolbar-divider" />
      {tool("Paragraph", <span className="paragraph-icon">¶</span>, () => editor.chain().focus().setParagraph().run(), editor.isActive("paragraph"))}
      {tool("Heading 1", <Heading1 size={18} />, () => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive("heading", { level: 1 }))}
      {tool("Heading 2", <Heading2 size={18} />, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive("heading", { level: 2 }))}
      <span className="toolbar-divider" />
      {tool("Bullet list", <List size={18} />, () => editor.chain().focus().toggleBulletList().run(), editor.isActive("bulletList"))}
      {tool("Numbered list", <ListOrdered size={18} />, () => editor.chain().focus().toggleOrderedList().run(), editor.isActive("orderedList"))}
      <span className="toolbar-divider" />
      {tool("Blockquote", <Quote size={17} />, () => editor.chain().focus().toggleBlockquote().run(), editor.isActive("blockquote"))}
      {tool("Add or edit link", <Link2 size={17} />, addLink, editor.isActive("link"))}
      <span className="toolbar-divider" />
      {tool("Undo", <Undo2 size={17} />, () => editor.chain().focus().undo().run(), false, !editable || !editor.can().undo())}
      {tool("Redo", <Redo2 size={17} />, () => editor.chain().focus().redo().run(), false, !editable || !editor.can().redo())}
    </div>
    {!editable && <p className="viewer-note">You have view-only access to this document.</p>}
    <div className={`editor-layout ${sidebarCollapsed ? "editor-layout-collapsed" : ""}`}>
      <aside className={`editor-sidebar ${sidebarCollapsed ? "editor-sidebar-collapsed" : ""}`} aria-label="Document outline">
        {!sidebarCollapsed && <>
          <h2>On this page</h2>
          {outline.length ? <nav className="outline-list" aria-label="Headings">
            {outline.map((entry) => <button
              className={`outline-item outline-level-${entry.level} ${activeHeading === entry.position ? "outline-active" : ""}`}
              key={entry.position}
              type="button"
              onClick={() => navigateToHeading(entry)}
            >{entry.text}</button>)}
          </nav> : <p className="outline-empty">Add headings to build an outline.</p>}
        </>}
      </aside>
      <main className="page-scroll"><article className="paper"><EditorContent editor={editor} /></article></main>
    </div>
    {showShare && <ShareDialog documentId={document.id} onClose={() => setShowShare(false)} />}
  </div>;
}
