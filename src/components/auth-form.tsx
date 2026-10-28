"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { signIn, signUp } from "@/app/actions/auth";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const signup = mode === "signup";
  if (!hasSupabaseConfig()) {
    return <p className="notice">Add your Supabase URL and publishable key to <code>.env.local</code>, then restart the app to enable accounts.</p>;
  }
  function submit(formData: FormData) {
    setMessage("");
    startTransition(async () => {
      const result = signup ? await signUp(formData) : await signIn(formData);
      setMessage(result?.error ?? (result?.confirmationRequired ? "Check your inbox and follow the confirmation link to finish creating your account." : ""));
    });
  }
  return (
    <form className="auth-form" onSubmit={(event) => {
      event.preventDefault();
      submit(new FormData(event.currentTarget));
    }}>
      {signup && <label>Display name<input name="displayName" autoComplete="name" maxLength={80} /></label>}
      <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
      <label>Password<input name="password" type="password" autoComplete={signup ? "new-password" : "current-password"} minLength={8} required /></label>
      {message && <p className="form-message" role="status">{message}</p>}
      <button className="button button-primary button-wide" type="submit" disabled={pending}>{pending ? "Please wait…" : signup ? "Create account" : "Sign in"}</button>
      <p className="auth-switch">{signup ? "Already have an account?" : "New to Draftly?"} <Link href={signup ? "/login" : "/signup"}>{signup ? "Sign in" : "Create an account"}</Link></p>
    </form>
  );
}
