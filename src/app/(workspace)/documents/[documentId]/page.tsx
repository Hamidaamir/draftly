import { notFound, redirect } from "next/navigation";
import { Editor } from "@/components/editor";
import { getDocument } from "@/app/actions/documents";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export default async function DocumentPage({ params }: { params: Promise<{ documentId: string }> }) {
  if (!hasSupabaseConfig()) redirect("/workspace");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { documentId } = await params;
  const document = await getDocument(documentId);
  if (!document) notFound();
  return <Editor document={document} />;
}
