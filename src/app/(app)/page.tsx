import Link from "next/link";
import { AtSign, CheckCircle2, Clapperboard, Clock, FolderKanban, KanbanSquare } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { formatDue, isOverdue } from "@/lib/board";
import { formatTimestamp } from "@/lib/chat";
import { getHomeData, getMe, getServersWithProjects } from "@/lib/data";
import { cn } from "@/lib/utils";

export const metadata = { title: "Accueil · Organisation TNF" };

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("fr-FR", { hour: "numeric", timeZone: "Europe/Paris" }).format(new Date()));
  return hour < 18 ? "Bonjour" : "Bonsoir";
}

function Section({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-main">
      <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-semibold">
        {icon}
        {title}
        {count !== undefined && count > 0 && <span className="text-faint">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-center text-sm text-faint">{children}</p>;
}

export default async function HomePage() {
  const [{ profile, orgRole }, servers] = await Promise.all([getMe(), getServersWithProjects()]);
  const home = await getHomeData(profile?.id ?? "");
  const isAdmin = orgRole === "owner" || orgRole === "admin";

  // Index des projets pour retrouver pôle, nom et couleur
  const projects = servers.flatMap((server) =>
    server.projects.map((project) => ({ ...project, serverId: server.id, serverName: server.name })),
  );
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const activeProjects = projects.filter((p) => p.status === "active");
  const firstName = profile?.display_name.split(" ")[0] ?? "";

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-sidebar">
      <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
        <div>
          <h1 suppressHydrationWarning className="text-2xl font-semibold">
            {greeting()} {firstName}
          </h1>
          <p className="mt-1 text-muted">Voici ce qui t&apos;attend aujourd&apos;hui.</p>
        </div>

        {servers.length === 0 && (
          <div className="rounded-xl border border-dashed border-line bg-main px-6 py-10 text-center">
            <p className="font-medium">Aucun pôle pour l&apos;instant</p>
            <p className="mt-1 text-sm text-muted">
              {isAdmin
                ? "Crée un pôle avec le bouton + à côté de « Pôles », à gauche."
                : "Un admin doit t'ajouter à un pôle ou à un projet."}
            </p>
          </div>
        )}

        {activeProjects.length > 0 && (
          <Section title="Tes projets" icon={<FolderKanban className="size-4 text-faint" />} count={activeProjects.length}>
            <ul className="grid gap-px overflow-hidden rounded-b-xl bg-line sm:grid-cols-2 lg:grid-cols-3">
              {activeProjects.map((project) => (
                <li key={project.id} className="bg-main">
                  <Link href={`/s/${project.serverId}/p/${project.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-elevated">
                    <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: project.color ?? "var(--faint)" }} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{project.name}</span>
                      <span className="block truncate text-xs text-faint">{project.serverName}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Tes tâches" icon={<KanbanSquare className="size-4 text-faint" />} count={home.tasks.length}>
            {home.tasks.length === 0 ? (
              <Empty>Aucune tâche ne t&apos;est assignée. Profites-en.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {home.tasks.map((task) => {
                  const project = projectById.get(task.project_id);
                  return (
                    <li key={task.id}>
                      <Link
                        href={project ? `/s/${project.serverId}/p/${project.id}/board?card=${task.id}` : "/"}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-elevated"
                      >
                        <CheckCircle2 className="size-4 shrink-0 text-faint" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{task.title}</span>
                          <span className="block truncate text-xs text-faint">{project?.name}</span>
                        </span>
                        {task.due_date && (
                          <span
                            suppressHydrationWarning
                            className={cn(
                              "flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs",
                              isOverdue(task.due_date) ? "bg-danger/10 text-danger" : "text-faint",
                            )}
                          >
                            <Clock className="size-3" />
                            {formatDue(task.due_date)}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section title="Rendus à valider" icon={<Clapperboard className="size-4 text-faint" />} count={home.reviews.length}>
            {home.reviews.length === 0 ? (
              <Empty>Aucun rendu en attente de validation.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {home.reviews.map((review) => {
                  const project = projectById.get(review.project_id);
                  return (
                    <li key={review.id}>
                      <Link
                        href={project ? `/s/${project.serverId}/p/${project.id}/reviews/${review.id}` : "/"}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-elevated"
                      >
                        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: project?.color ?? "var(--faint)" }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{review.title}</span>
                          <span className="block truncate text-xs text-faint">{project?.name}</span>
                        </span>
                        <span className="shrink-0 rounded bg-idle/15 px-1.5 py-0.5 text-xs text-idle">En revue</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>

        <Section title="Mentions non lues" icon={<AtSign className="size-4 text-faint" />} count={home.mentions.length}>
          {home.mentions.length === 0 ? (
            <Empty>Personne ne t&apos;a mentionné récemment.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {home.mentions.map((mention) => {
                const base = mention.project_id ? `/s/${mention.server_id}/p/${mention.project_id}` : `/s/${mention.server_id}`;
                return (
                  <li key={mention.id}>
                    <Link
                      href={mention.channel_id ? `${base}/c/${mention.channel_id}?m=${mention.message_id}` : base}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-elevated"
                    >
                      <Avatar name={mention.actor?.display_name ?? "?"} url={mention.actor?.avatar_url ?? null} className="size-8" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2 text-sm">
                          <span className="font-medium">{mention.actor?.display_name ?? "Quelqu'un"}</span>
                          <span suppressHydrationWarning className="text-xs text-faint">
                            {formatTimestamp(mention.created_at)}
                          </span>
                        </span>
                        <span className="line-clamp-2 block text-sm text-muted">{mention.excerpt}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </main>
  );
}
