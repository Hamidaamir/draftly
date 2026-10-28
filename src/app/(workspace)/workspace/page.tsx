import Link from "next/link";
import { redirect } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { getWorkspaceDocuments } from "@/app/actions/documents";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export default async function WorkspacePage() {
  if (!hasSupabaseConfig()) {
    return <main className="setup-page">
      <Link className="brand" href="/"><span className="brand-mark">d</span> draftly</Link>
      <section className="setup-card"><p className="eyebrow">ONE LAST SETUP STEP</p><h1>Connect your workspace.</h1>
        <p>Draftly stores accounts, documents, and sharing permissions in your Supabase project. Add your project URL and publishable key to <code>.env.local</code>, then restart the app.</p>
        <pre>NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co{"\n"}NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key</pre>
        <p>Then apply the migrations in <code>supabase/migrations</code>. See the README for setup steps.</p>
        <Link className="button button-primary" href="/login">Go to sign in</Link>
      </section>
    </main>;
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const documents = await getWorkspaceDocuments();
  return <Workspace {...documents} />;
}
