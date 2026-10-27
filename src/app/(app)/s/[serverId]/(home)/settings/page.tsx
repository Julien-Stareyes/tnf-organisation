import { notFound } from "next/navigation";
import { ChannelHeader } from "@/components/channel-header";
import { getAuditLog, getMyPermissions, getRoleDetails, getServer } from "@/lib/data";
import { hasPermission, Permission } from "@/lib/permissions";
import type { AuditEntry } from "@/lib/types";
import { RoleEditor } from "./role-editor";

export const metadata = { title: "Réglages du serveur · Organisation TNF" };

export default async function ServerSettingsPage({ params }: { params: Promise<{ serverId: string }> }) {
  const { serverId } = await params;
  const server = await getServer(serverId);
  if (!server) notFound();

  const permissions = await getMyPermissions({ serverId: server.id });
  const canManageRoles = hasPermission(permissions, Permission.MANAGE_ROLES);
  const canViewAudit = hasPermission(permissions, Permission.VIEW_AUDIT_LOG);
  if (!canManageRoles && !canViewAudit) notFound();

  const [roles, audit] = await Promise.all([
    canManageRoles ? getRoleDetails(server.id) : Promise.resolve([]),
    canViewAudit ? getAuditLog(server.id) : Promise.resolve([]),
  ]);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <ChannelHeader crumbs={[{ label: server.name, href: `/s/${server.id}` }, { label: "Réglages" }]} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-12 px-6 py-10">
          {canManageRoles && (
            <section>
              <h2 className="mb-1 text-xl font-semibold">Rôles</h2>
              <p className="mb-4 text-sm text-muted">
                Un rôle placé plus haut l&apos;emporte. Tu ne peux modifier que les rôles sous ton rôle le plus haut, et
                ne donner que des droits que tu as toi-même.
              </p>
              <RoleEditor serverId={server.id} roles={roles} />
            </section>
          )}

          {canViewAudit && (
            <section>
              <h2 className="mb-4 text-xl font-semibold">Journal d&apos;audit</h2>
              {audit.length === 0 ? (
                <p className="text-sm text-faint">Aucune action enregistrée.</p>
              ) : (
                <ul className="divide-y divide-line rounded-xl border border-line bg-sidebar">
                  {audit.map((entry) => (
                    <li key={entry.id} className="flex items-baseline gap-3 px-4 py-2.5 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-fg">{entry.actor_name ?? "Système"}</span>{" "}
                        <span className="text-muted">{describe(entry)}</span>
                      </span>
                      <time suppressHydrationWarning className="shrink-0 text-xs text-faint">
                        {dateFormat.format(new Date(entry.created_at))}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const TARGETS: Record<string, [string, string, string]> = {
  // [création, modification, suppression]
  servers: ["a créé le serveur", "a modifié le serveur", "a supprimé le serveur"],
  projects: ["a créé le projet", "a modifié le projet", "a supprimé le projet"],
  channels: ["a créé le salon", "a modifié le salon", "a supprimé le salon"],
  categories: ["a créé la catégorie", "a modifié la catégorie", "a supprimé la catégorie"],
  roles: ["a créé le rôle", "a modifié le rôle", "a supprimé le rôle"],
  member_roles: ["a attribué un rôle", "a modifié un rôle attribué", "a retiré un rôle"],
  server_members: ["a ajouté un membre au serveur", "a modifié un membre", "a retiré un membre du serveur"],
  project_members: ["a ajouté un membre à un projet", "a changé le rôle d'un membre de projet", "a retiré un membre d'un projet"],
  channel_overwrites: ["a ajouté une exception de permissions", "a modifié une exception de permissions", "a supprimé une exception de permissions"],
  project_overwrites: ["a ajouté une exception de projet", "a modifié une exception de projet", "a supprimé une exception de projet"],
};

function describe(entry: AuditEntry) {
  const verbs = TARGETS[entry.target_type] ?? ["a créé", "a modifié", "a supprimé"];
  const verb = verbs[entry.action === "insert" ? 0 : entry.action === "update" ? 1 : 2];
  const changes = entry.changes ?? {};
  const row = (entry.action === "update" ? (changes.new as Record<string, unknown>) : changes) ?? {};
  const name = typeof row.name === "string" ? row.name : null;
  if (!name) return verb;
  return entry.target_type === "channels" ? `${verb} #${name}` : `${verb} « ${name} »`;
}
