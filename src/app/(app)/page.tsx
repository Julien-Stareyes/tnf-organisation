import { redirect } from "next/navigation";
import { Server } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Sidebar } from "@/components/sidebar/sidebar";
import { getMe, getMyServers } from "@/lib/data";

export default async function HomePage() {
  const servers = await getMyServers();
  if (servers.length > 0) redirect(`/s/${servers[0].id}`);

  const { orgRole } = await getMe();
  const isAdmin = orgRole === "owner" || orgRole === "admin";

  return (
    <>
      <Sidebar header={<p className="px-4 py-3 font-semibold">Organisation TNF</p>}>{null}</Sidebar>
      <main className="flex min-w-0 flex-1 flex-col">
        <EmptyState icon={<Server className="size-6" />} title="Aucun serveur pour l'instant">
          {isAdmin
            ? "Lance supabase/seed.sql dans le SQL Editor de Supabase pour créer les serveurs et projets de démo."
            : "Un admin doit t'ajouter à un serveur ou à un projet."}
        </EmptyState>
      </main>
    </>
  );
}
