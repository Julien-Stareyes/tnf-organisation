import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Client "service_role" : contourne la RLS. Réservé aux opérations que la RLS ne peut pas couvrir
 * (création de compte invité, retrait d'accès) et toujours après une vérification explicite des droits.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante dans .env.local");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function hasAdminKey() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}
