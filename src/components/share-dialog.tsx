"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Copy, Link2, Mail, Trash2, UserRound, X } from "lucide-react";
import { addCollaborator, listCollaborators, removeCollaborator, updateCollaborator } from "@/app/actions/documents";
import type { Collaborator } from "@/lib/types";

export function ShareDialog({ documentId, onClose }: { documentId: string; onClose: () => void }) {
  const [people, setPeople] = useState<Collaborator[]>([]);
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<"viewer" | "editor">("viewer");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("error");
  const [copied, setCopied] = useState(false);
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [pending, startTransition] = useTransition();
  const actionInProgress = useRef(false);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>("input, button, select")?.focus();
    let active = true;
    listCollaborators(documentId)
      .then((result) => {
        if (!active) return;
        if (result.error) setMessage(result.error);
        else setPeople(result.data ?? []);
      })
      .catch(() => {
        if (active) setMessage("Your session may have expired. Reload the page and try again.");
      })
      .finally(() => {
        if (active) setLoadingPeople(false);
      });
    return () => {
      active = false;
      previousFocus.current?.focus();
    };
  }, [documentId]);

  function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (actionInProgress.current) return;
    actionInProgress.current = true;
    setMessage("");
    startTransition(async () => {
      try {
        const result = await addCollaborator({ documentId, email, permission });
        if (result.error) {
          setMessageType("error");
          setMessage(result.error);
          return;
        }
        setEmail("");
        const refreshed = await listCollaborators(documentId);
        if (refreshed.data) {
          setPeople(refreshed.data);
          setMessageType("success");
          setMessage("Access granted.");
        } else {
          setMessageType("error");
          setMessage(refreshed.error ?? "Collaborators couldn't be refreshed.");
        }
      } catch {
        setMessageType("error");
        setMessage("Sharing couldn't be updated. Check your connection and try again.");
      } finally {
        actionInProgress.current = false;
      }
    });
  }

  function changePermission(person: Collaborator, nextPermission: "viewer" | "editor") {
    if (actionInProgress.current) return;
    actionInProgress.current = true;
    startTransition(async () => {
      try {
        const result = await updateCollaborator({ documentId, userId: person.user_id, permission: nextPermission });
        if (result.error) {
          setMessageType("error");
          setMessage(result.error);
        } else {
          setPeople((current) => current.map((item) => item.user_id === person.user_id ? { ...item, permission: nextPermission } : item));
          setMessageType("success");
          setMessage("Permission updated.");
        }
      } catch {
        setMessageType("error");
        setMessage("That permission couldn't be changed. Check your connection and try again.");
      } finally {
        actionInProgress.current = false;
      }
    });
  }

  function remove(person: Collaborator) {
    if (!window.confirm(`Remove ${person.display_name || person.email} from this document?`)) return;
    if (actionInProgress.current) return;
    actionInProgress.current = true;
    startTransition(async () => {
      try {
        const result = await removeCollaborator(documentId, person.user_id);
        if (result.error) {
          setMessageType("error");
          setMessage(result.error);
        } else {
          setPeople((current) => current.filter((item) => item.user_id !== person.user_id));
          setMessageType("success");
          setMessage("Access removed.");
        }
      } catch {
        setMessageType("error");
        setMessage("This person's access couldn't be removed. Check your connection and try again.");
      } finally {
        actionInProgress.current = false;
      }
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setMessageType("error");
      setMessage("Couldn't copy the link. Copy it from your browser's address bar.");
    }
  }

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
    ));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-heading" onKeyDown={handleDialogKeyDown}>
      <header className="dialog-header"><div><p className="eyebrow">COLLABORATE</p><h2 id="share-heading">Share document</h2></div><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={19} /></button></header>
      <form className="share-form" onSubmit={add}>
        <label className="email-field"><Mail size={17} /><input type="email" placeholder="Add people by email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} aria-label="Email address" disabled={pending} /></label>
        <select value={permission} onChange={(event) => setPermission(event.target.value as "viewer" | "editor")} aria-label="Permission" disabled={pending}>
          <option value="viewer">Can view</option><option value="editor">Can edit</option>
        </select>
        <button className="button button-primary" disabled={pending}>{pending ? "Adding…" : "Share"}</button>
      </form>
      <p className="share-hint">Only existing Draftly accounts can be added.</p>
      {message && <p className={`form-message ${messageType === "success" ? "form-success" : ""}`} role={messageType === "error" ? "alert" : "status"}>{message}</p>}
      <div className="people-list"><h3>People with access</h3>
        <div className="person-row">
          <span className="avatar person-avatar"><UserRound size={15} /></span><span className="person-info"><strong>You</strong><small>Document owner</small></span><span className="owner-badge">Owner</span>
        </div>
        {loadingPeople && <p className="muted-copy" role="status">Loading collaborators…</p>}
        {!loadingPeople && people.map((person) => <div className="person-row" key={person.user_id}>
          <span className="avatar person-avatar"><UserRound size={15} /></span><span className="person-info"><strong>{person.display_name || person.email}</strong>{person.display_name && <small>{person.email}</small>}</span>
          <select aria-label={`Permission for ${person.email}`} value={person.permission} onChange={(event) => changePermission(person, event.target.value as "viewer" | "editor")} disabled={pending}>
            <option value="viewer">Viewer</option><option value="editor">Editor</option>
          </select>
          <button className="icon-button remove-person" aria-label={`Remove ${person.email}`} onClick={() => remove(person)} disabled={pending}><Trash2 size={16} /></button>
        </div>)}
        {!loadingPeople && !people.length && <p className="muted-copy">No collaborators yet. Share with a registered account to get started.</p>}
      </div>
      <button className="copy-link" type="button" onClick={copyLink}><span className="copy-link-icon"><Link2 size={17} /></span><span><strong>Anyone with access can open</strong><small>{copied ? "Link copied" : "Copy this document’s private link"}</small></span>{copied ? <Check size={17} /> : <Copy size={17} />}</button>
    </section>
  </div>;
}
