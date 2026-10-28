import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function SignupPage() {
  return <main className="auth-page">
    <Link className="brand auth-brand" href="/"><span className="brand-mark">d</span> draftly</Link>
    <section className="auth-card">
      <p className="eyebrow">MAKE A LITTLE SPACE</p><h1>Start with a blank page.</h1><p className="auth-intro">Create your account and keep your ideas together.</p>
      <AuthForm mode="signup" />
    </section>
    <p className="auth-footnote">Your words are yours.</p>
  </main>;
}
