"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Workspace request failed", error.digest ?? error.name);
  }, [error]);

  return <main className="setup-page">
    <section className="setup-card">
      <p className="eyebrow">SOMETHING WENT WRONG</p>
      <h1>We couldn&apos;t open that page.</h1>
      <p>Your documents haven&apos;t been changed. Check your connection and try again.</p>
      <div className="error-actions"><button className="button button-primary" onClick={reset}>Try again</button><Link className="button button-secondary" href="/workspace">Back to workspace</Link></div>
    </section>
  </main>;
}
