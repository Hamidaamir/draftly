"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { FilePlus2, FileText, Search, Upload, Users, Clock3, Menu, X } from "lucide-react";
import { createDocument } from "@/app/actions/documents";
import { filenameTitle, parseImportFile, validateImportFile } from "@/lib/import";
import type { DocumentSummary, Json } from "@/lib/types";
import { signOut } from "@/app/actions/auth";
import { ThemeToggle } from "@/components/theme-toggle";

export function Workspace({ owned, shared, name }: { owned: DocumentSummary[]; shared: DocumentSummary[]; name: string | null }) {
  const [active, setActive] = useState<"all" | "mine" | "shared">("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const creating = useRef(false);
  const documents = useMemo(() => {
    const list = active === "mine" ? owned : active === "shared" ? shared : [...owned, ...shared];
    return [...list]
      .filter((document) => document.title.toLowerCase().includes(query.toLowerCase()))
      .sort((first, second) => Date.parse(second.updated_at) - Date.parse(first.updated_at));
  }, [active, owned, query, shared]);

  function create() {
    if (creating.current) return;
    creating.current = true;
    setError("");
    startTransition(async () => {
      try {
        const result = await createDocument();
        if ("error" in result) setError(result.error);
        else router.push(`/documents/${result.id}`);
      } catch {
        setError("Your document couldn't be created. Check your connection and try again.");
      } finally {
        creating.current = false;
      }
    });
  }

  function importFile(file?: File) {
    if (!file || creating.current) return;
    setImportFileName(file.name);
    setImportStatus("");
    setError("");
    const validationError = validateImportFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    creating.current = true;
    setImportStatus("Reading file…");
    startTransition(async () => {
      let content: Json;
      try {
        content = await parseImportFile(file);
      } catch (parseError) {
        setError(parseError instanceof Error ? parseError.message : "This file couldn't be parsed.");
        setImportStatus("");
        creating.current = false;
        return;
      }
      try {
        setImportStatus("Creating document…");
        const result = await createDocument(filenameTitle(file.name), content);
        if ("error" in result) {
          setError(result.error);
          setImportStatus("");
        } else {
          setImportStatus("Import complete. Opening document…");
          router.push(`/documents/${result.id}`);
        }
      } catch {
        setError("Your imported document couldn't be created. Check your connection and try again.");
        setImportStatus("");
      } finally {
        creating.current = false;
      }
    });
  }

  return (
    <div className="workspace-shell">
      <aside id="workspace-sidebar" className={`sidebar ${menuOpen ? "sidebar-open" : ""}`} aria-label="Workspace navigation">
        <Link className="brand" href="/workspace"><span className="brand-mark">d</span> draftly</Link>
        <button className="button button-primary new-document" onClick={create} disabled={pending}><FilePlus2 size={17} /> New document</button>
        <button className="nav-item" onClick={() => fileInput.current?.click()} disabled={pending}><Upload size={17} /> Import a file</button>
        <input ref={fileInput} hidden type="file" accept=".txt,.md,text/plain,text/markdown" aria-label="Import text or Markdown file" onChange={(event) => { importFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
        <p className="nav-label">WORKSPACE</p>
        <button className={`nav-item ${active === "all" ? "nav-active" : ""}`} onClick={() => { setActive("all"); setMenuOpen(false); }}><FileText size={17} /> All documents <span>{owned.length + shared.length}</span></button>
        <button className={`nav-item ${active === "mine" ? "nav-active" : ""}`} onClick={() => { setActive("mine"); setMenuOpen(false); }}><Clock3 size={17} /> My documents <span>{owned.length}</span></button>
        <button className={`nav-item ${active === "shared" ? "nav-active" : ""}`} onClick={() => { setActive("shared"); setMenuOpen(false); }}><Users size={17} /> Shared with me <span>{shared.length}</span></button>
        <div className="sidebar-bottom">
          <div className="user-chip"><span className="avatar">{(name?.[0] ?? "D").toUpperCase()}</span><span className="user-name">{name ?? "Your workspace"}</span></div>
          <ThemeToggle />
          <form onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              try {
                const result = await signOut();
                if (result?.error) setError(result.error);
              } catch {
                setError("We couldn't sign you out. Check your connection and try again.");
              }
            });
          }}><button className="quiet-button signout" type="submit">Sign out</button></form>
        </div>
      </aside>
      <main className="workspace-main">
        <header className="workspace-header">
          <button className="icon-button mobile-menu" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-controls="workspace-sidebar" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
          <div><p className="eyebrow">YOUR SPACE</p><h1>{active === "shared" ? "Shared with me" : active === "mine" ? "My documents" : "All documents"}</h1></div>
          <button className="button button-primary header-new" onClick={create} disabled={pending}><FilePlus2 size={17} /> New document</button>
        </header>
        <div className="document-tools">
          <label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documents" aria-label="Search documents" /></label>
          <button className="button button-secondary import-button" onClick={() => fileInput.current?.click()} disabled={pending}><Upload size={16} /> Import</button>
        </div>
        {importFileName && <p className="import-feedback" aria-live="polite"><strong>{importFileName}</strong>{importStatus && <span>{importStatus}</span>}</p>}
        {error && <p className="inline-error" role="alert">{error}</p>}
        <div className="list-heading"><span>DOCUMENT</span><span>LAST EDITED</span></div>
        {documents.length ? <section className="document-list" aria-label="Documents">
          {documents.map((document) => <Link className="document-row" key={document.id} href={`/documents/${document.id}`}>
            <span className="document-icon"><FileText size={19} /></span>
            <span className="document-info"><strong>{document.title}</strong><small>{document.role === "owner" ? "Created by you" : `Shared by ${document.owner_name ?? "a collaborator"} · ${document.role}`}</small></span>
            <time dateTime={document.updated_at}>{document.updated_label}</time>
          </Link>)}
        </section> : <section className="empty-state">
          <span className="empty-icon"><FileText size={24} /></span>
          <h2>{query ? "No matching documents" : active === "shared" ? "Nothing shared yet" : "A little space for your ideas"}</h2>
          <p>{query ? "Try another title or clear your search." : active === "shared" ? "Documents shared with you will show up here." : "Create a document or bring in a Markdown or text file."}</p>
          {!query && active !== "shared" && <button className="button button-primary" onClick={create}><FilePlus2 size={17} /> Create a document</button>}
        </section>}
      </main>
      {menuOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    </div>
  );
}
