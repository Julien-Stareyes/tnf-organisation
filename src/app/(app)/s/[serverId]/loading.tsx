import { ContentSkeleton, ContextColumnSkeleton } from "@/components/skeletons";

// Changement de pôle ou de projet : la colonne et le contenu se rechargent ensemble
export default function Loading() {
  return (
    <>
      <ContextColumnSkeleton />
      <ContentSkeleton />
    </>
  );
}
