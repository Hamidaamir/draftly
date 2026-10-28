"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(254),
  password: z.string().min(1, "Enter your password."),
});
const signUpSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(254),
  password: z.string().min(8, "Use a password with at least 8 characters.").max(128, "Password is too long."),
  displayName: z.string().trim().max(80, "Your name must be 80 characters or fewer."),
});

export async function signIn(formData: FormData) {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter your email and password." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "That email and password combination could not be verified." };
  redirect("/workspace");
}

export async function signUp(formData: FormData) {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: String(formData.get("displayName") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your account details and try again." };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: new URL("/auth/confirm", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").toString(),
    },
  });
  if (error) return { error: "We couldn't create your account. Check the email and try again." };
  if (!data.session) return { confirmationRequired: true };
  redirect("/workspace");
}

export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) return { error: "We couldn't sign you out. Please try again." };
  redirect("/login");
}
