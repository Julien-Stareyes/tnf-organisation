import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ReviewViewer } from "@/components/reviews/review-viewer";
import {
  getMe,
  getMyProjectRole,
  getProfilesByIds,
  getProject,
  getProjectMembers,
  getReviewAsset,
  getReviewComments,
  getServer,
  signReviewPaths,
} from "@/lib/data";

export const metadata = { title: "Revue · Organisation TNF" };

export default async function ReviewAssetPage({
  params,
  searchParams,
}: {
  params: Promise<{ serverId: string; projectId: string; assetId: string }>;
  searchParams: Promise<{ v?: string; c?: string }>;
}) {
  const [{ serverId, projectId, assetId }, { v, c }] = await Promise.all([params, searchParams]);
  const [server, project, review] = await Promise.all([getServer(serverId), getProject(projectId), getReviewAsset(assetId)]);
  if (!server || !project || !review || project.server_id !== server.id || review.asset.project_id !== project.id) notFound();

  const version = review.versions.find((x) => x.id === v) ?? review.versions[0];
  if (!version) notFound();

  const [comments, signed, role, members, { profile, email }] = await Promise.all([
    getReviewComments(version.id),
    signReviewPaths([version.storage_path]),
    getMyProjectRole(project.id),
    getProjectMembers(project.id),
    getMe(),
  ]);
  const authors = await getProfilesByIds(comments.map((comment) => comment.author_id));

  const people = new Map<string, { name: string; avatar_url: string | null }>();
  members.forEach((m) => people.set(m.user_id, { name: m.display_name, avatar_url: m.avatar_url }));
  authors.forEach((a) => people.set(a.id, { name: a.display_name, avatar_url: a.avatar_url }));
  const meId = profile?.id ?? "";
  people.set(meId, { name: profile?.display_name ?? email, avatar_url: profile?.avatar_url ?? null });
  const isClient = role === "client";

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <PageHeader
        icon={
          <Link
            href={`/s/${server.id}/p/${project.id}/reviews`}
            title="Retour aux revues"
            className="grid size-7 place-items-center rounded-md text-muted hover:bg-hover hover:text-fg"
          >
            <ArrowLeft className="size-4" />
          </Link>
        }
        title={review.asset.title}
        subtitle={`Version ${version.version} sur ${review.versions.length}`}
      />
      <ReviewViewer
        key={version.id}
        asset={review.asset}
        versions={review.versions}
        version={version}
        mediaUrl={signed.get(version.storage_path) ?? null}
        initialComments={comments}
        people={Object.fromEntries(people)}
        meId={meId}
        isTeam={!isClient}
        focusCommentId={c ?? null}
        basePath={`/s/${server.id}/p/${project.id}/reviews`}
      />
    </div>
  );
}
