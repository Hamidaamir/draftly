import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default async function LoginPage({ searchParams }: { searchParams?: Promise<{ confirmation?: string }> }) {
  const query = await searchParams;
  return <main className="auth-page">
    <Link className="brand auth-brand" href="/"><span className="brand-mark">d</span> draftly</Link>
    <section className="auth-card">
      <p className="eyebrow">WELCOME BACK</p><h1>Good to see you again.</h1><p className="auth-intro">Sign in to pick up where your thoughts left off.</p>
      {query?.confirmation === "failed" && <p className="form-message" role="alert">That confirmation link is invalid or expired. Request a new sign-up email and try again.</p>}
      <AuthForm mode="login" />
    </section>
    <p className="auth-footnote">A little more room for your ideas.</p>
  </main>;
}
