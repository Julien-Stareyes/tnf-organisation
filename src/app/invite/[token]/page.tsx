import { createAdminClient, hasAdminKey } from "@/lib/supabase/admin";
import { hashInviteToken } from "@/lib/invitations";
import { AcceptForm } from "./accept-form";

export const metadata = { title: "Invitation · Organisation TNF" };

async function findInvitation(token: string) {
  if (!hasAdminKey() || token.length < 20) return null;
  const { data } = await createAdminClient()
    .from("invitations")
    .select("email")
    .eq("token_hash", hashInviteToken(token))
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return data;
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await findInvitation(token);

  return (
    <main className="grid min-h-dvh place-items-center bg-rail px-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-sidebar p-8 shadow-2xl">
        <div className="mb-8 space-y-3 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand text-sm font-black text-brand-fg">
            TNF
          </div>
          <h1 className="text-xl font-semibold">Rejoindre Organisation TNF</h1>
          {invitation ? (
            <p className="text-sm text-muted">
              Crée ton compte pour <span className="text-fg">{invitation.email}</span>.
            </p>
          ) : (
            <p className="text-sm text-muted">
              Cette invitation est invalide, a expiré ou a déjà été utilisée. Demande un nouveau lien à un admin.
            </p>
          )}
        </div>
        {invitation && <AcceptForm token={token} />}
      </div>
    </main>
  );
}
