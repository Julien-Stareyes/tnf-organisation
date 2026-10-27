"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/utils";

export type LoginState = { error?: string; info?: string };

const passwordSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

export async function signInWithPassword(_: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Renseigne ton e-mail et ton mot de passe." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { error: "E-mail ou mot de passe incorrect." };

  redirect(safeNext(parsed.data.next));
}

const magicLinkSchema = z.object({
  email: z.email(),
  next: z.string().optional(),
});

export async function sendMagicLink(_: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = magicLinkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Adresse e-mail invalide." };

  const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const next = encodeURIComponent(safeNext(parsed.data.next));
  const supabase = await createClient();
  await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      // Pas d'inscription libre : on n'entre que sur invitation
      shouldCreateUser: false,
      emailRedirectTo: `${origin}/auth/callback?next=${next}`,
    },
  });

  // Même message que le compte existe ou non, pour ne rien révéler
  return { info: "Si un compte existe pour cette adresse, un lien de connexion vient de t'être envoyé." };
}
