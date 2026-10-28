import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const emailTypeSchema = z.enum(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const code = search.get("code");
  const tokenHash = search.get("token_hash");
  const emailType = emailTypeSchema.safeParse(search.get("type"));
  const supabase = await createClient();

  const result = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && emailType.success
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: emailType.data })
      : { error: new Error("Missing confirmation parameters.") };

  const destination = request.nextUrl.clone();
  destination.pathname = result.error ? "/login" : "/workspace";
  destination.search = result.error ? "?confirmation=failed" : "";
  return NextResponse.redirect(destination);
}
