import Link from "next/link";
import { notFound } from "next/navigation";
import { Clapperboard, Film, ImageIcon, MessageSquare } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { UploadReviewDialog } from "@/components/reviews/upload-dialog";
import { getMe, getMyProjectRole, getProject, getReviewAssets, getServer } from "@/lib/data";
import { formatTimecode, isVideo, STATUS_CLASS, STATUS_LABEL } from "@/lib/reviews";
import { cn } from "@/lib/utils";

export const metadata = { title: "Revues · Organisation TNF" };

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

export default async function ProjectReviewsPage({
  params,
}: {
  params: Promise<{ serverId: string; projectId: string }>;
}) {
  const { serverId, projectId } = await params;
  const [server, project] = await Promise.all([getServer(serverId), getProject(projectId)]);
  if (!server || !project || project.server_id !== server.id) notFound();

  const [items, role, { profile }] = await Promise.all([getReviewAssets(project.id), getMyProjectRole(project.id), getMe()]);
  const isClient = role === "client";
  const basePath = `/s/${server.id}/p/${project.id}/reviews`;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <PageHeader
        icon={<Clapperboard className="size-4 text-faint" />}
        title="Revues"
        subtitle="Rendus à commenter image par image"
        actions={
          !isClient && <UploadReviewDialog projectId={project.id} meId={profile?.id ?? ""} basePath={basePath} trigger="primary" />
        }
      />

      {items.length === 0 ? (
        <EmptyState icon={<Film className="size-6" />} title="Aucun rendu à revoir">
          {isClient
            ? "L'équipe n'a encore partagé aucun rendu."
            : "Envoie une vidéo ou une image : tout le projet pourra la commenter image par image."}
        </EmptyState>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
            {items.map(({ asset, version, versionCount, thumbnailUrl, openComments }) => (
              <li key={asset.id}>
                <Link
                  href={`${basePath}/${asset.id}`}
                  className="group block overflow-hidden rounded-xl border border-line bg-sidebar transition hover:border-faint"
                >
                  <div className="relative aspect-video bg-rail">
                    {thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbnailUrl} alt="" className="size-full object-cover transition group-hover:scale-[1.02]" />
                    ) : (
                      <div className="grid size-full place-items-center text-faint">
                        {version && !isVideo(version.mime) ? <ImageIcon className="size-8" /> : <Film className="size-8" />}
                      </div>
                    )}
                    {version?.duration && (
                      <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white">
                        {formatTimecode(version.duration, Number(version.fps))}
                      </span>
                    )}
                    <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                      v{version?.version ?? 0}
                      {versionCount > 1 && <span className="font-normal text-white/60"> / {versionCount}</span>}
                    </span>
                  </div>
                  <div className="space-y-2 p-3">
                    <p className="truncate font-medium">{asset.title}</p>
                    <div className="flex items-center gap-2 text-xs">
                      <span className={cn("rounded px-1.5 py-0.5 font-medium", STATUS_CLASS[asset.status])}>
                        {STATUS_LABEL[asset.status]}
                      </span>
                      {openComments > 0 && (
                        <span className="flex items-center gap-1 text-faint">
                          <MessageSquare className="size-3.5" />
                          {openComments}
                        </span>
                      )}
                      <span suppressHydrationWarning className="ml-auto text-faint">
                        {dateFormat.format(new Date(asset.updated_at))}
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
