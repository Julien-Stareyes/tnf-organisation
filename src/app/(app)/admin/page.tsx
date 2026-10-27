import { notFound } from "next/navigation";
import { MailPlus, ShieldCheck, Users } from "lucide-react";
import { Sidebar } from "@/components/sidebar/sidebar";
import { getMe, getOrgMembers, getPendingInvitations, getServersWithProjects, withEmails } from "@/lib/data";
import { hasAdminKey } from "@/lib/supabase/admin";
import { InvitationList, InviteForm } from "./invite-form";
import { OrgMemberList } from "./org-member-list";

export const metadata = { title: "Administration · Organisation TNF" };

export default async function AdminPage() {
  const { orgRole, profile } = await getMe();
  if (orgRole !== "owner" && orgRole !== "admin") notFound();

  const [members, invitations, servers] = await Promise.all([
    getOrgMembers().then(withEmails),
    getPendingInvitations(),
    getServersWithProjects(),
  ]);

  return (
    <>
      <Sidebar
        header={
          <div className="flex items-center gap-2 px-4 py-3">
            <ShieldCheck className="size-4 text-accent" />
            <h1 className="font-semibold">Administration</h1>
          </div>
        }
      >
        <nav className="space-y-0.5 text-[15px]">
          <a href="#membres" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted hover:bg-hover/60 hover:text-fg">
            <Users className="size-4" /> Membres
          </a>
          <a href="#inviter" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted hover:bg-hover/60 hover:text-fg">
            <MailPlus className="size-4" /> Inviter
          </a>
        </nav>
      </Sidebar>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-12 px-6 py-10">
          {!hasAdminKey() && (
            <p className="rounded-lg border border-idle/40 bg-idle/10 px-4 py-3 text-sm text-idle">
              SUPABASE_SERVICE_ROLE_KEY n&apos;est pas configurée : les personnes invitées ne pourront pas créer leur
              compte, et les e-mails des membres ne s&apos;affichent pas.
            </p>
          )}

          <section id="membres" className="scroll-mt-6">
            <h2 className="mb-1 text-xl font-semibold">Membres de l&apos;organisation</h2>
            <p className="mb-4 text-sm text-muted">
              Admin : accès à tout. Membre : ses serveurs et projets. Invité : uniquement ses projets (clients).
            </p>
            <OrgMemberList members={members} myId={profile?.id ?? ""} />
          </section>

          <section id="inviter" className="scroll-mt-6">
            <h2 className="mb-1 text-xl font-semibold">Inviter quelqu&apos;un</h2>
            <p className="mb-4 text-sm text-muted">
              La personne reçoit un lien valable 7 jours et arrive directement dans les serveurs et projets choisis.
            </p>
            <InviteForm servers={servers} />
          </section>

          {invitations.length > 0 && (
            <section>
              <h2 className="mb-4 text-xl font-semibold">Invitations en attente</h2>
              <InvitationList invitations={invitations} />
            </section>
          )}
        </div>
      </main>
    </>
  );
}
