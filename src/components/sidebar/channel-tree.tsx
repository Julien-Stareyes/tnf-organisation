import { ChevronDown } from "lucide-react";
import { CreateCategoryDialog, CreateChannelDialog } from "@/components/dialogs/channel-dialogs";
import { ChannelLink } from "./nav-links";
import type { Channel, ChannelTree as ChannelTreeData } from "@/lib/types";

type Scope = { serverId: string; projectId: string | null };

export function ChannelTree({
  tree,
  basePath,
  manage,
}: {
  tree: ChannelTreeData;
  basePath: string;
  /** Présent si l'utilisateur peut gérer les salons de ce périmètre */
  manage?: Scope;
}) {
  const categories = tree.categories.map(({ id, name, position }) => ({ id, name, position }));

  return (
    <div className="space-y-4">
      {tree.uncategorized.length > 0 && <ChannelList channels={tree.uncategorized} basePath={basePath} />}

      {tree.categories.map((category) => (
        <div key={category.id} className="relative">
          <details open className="group/cat">
            <summary className="flex cursor-pointer list-none items-center gap-0.5 px-1 pb-1 pr-7 text-xs font-semibold uppercase tracking-wide text-faint hover:text-muted [&::-webkit-details-marker]:hidden">
              <ChevronDown className="size-3 -rotate-90 transition-transform group-open/cat:rotate-0" />
              <span className="truncate">{category.name}</span>
            </summary>
            <ChannelList channels={category.channels} basePath={basePath} />
          </details>
          {manage && (
            <div className="absolute -top-1 right-0">
              <CreateChannelDialog scope={manage} categories={categories} defaultCategoryId={category.id} />
            </div>
          )}
        </div>
      ))}

      {manage && (
        <div className="space-y-0.5 border-t border-line pt-2">
          <CreateChannelDialog scope={manage} categories={categories} variant="link" />
          <CreateCategoryDialog scope={manage} />
        </div>
      )}
    </div>
  );
}

function ChannelList({ channels, basePath }: { channels: Channel[]; basePath: string }) {
  return (
    <ul className="space-y-0.5">
      {channels.map((channel) => (
        <li key={channel.id}>
          <ChannelLink id={channel.id} href={`${basePath}/c/${channel.id}`} name={channel.name} type={channel.type} />
        </li>
      ))}
    </ul>
  );
}
