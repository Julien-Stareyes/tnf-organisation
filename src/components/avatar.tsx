import { cn, initials } from "@/lib/utils";
import type { PresenceStatus } from "@/lib/types";

const STATUS_CLASS: Record<PresenceStatus, string> = {
  online: "bg-online",
  idle: "bg-idle",
  dnd: "bg-danger",
  offline: "bg-faint",
};

export function Avatar({
  name,
  url,
  status,
  className,
}: {
  name: string;
  url: string | null;
  status?: PresenceStatus;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-grid size-8 shrink-0 place-items-center", className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full rounded-full object-cover" />
      ) : (
        <span className="grid size-full place-items-center rounded-full bg-hover text-xs font-semibold text-fg">
          {initials(name)}
        </span>
      )}
      {status && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-[3px] border-sidebar",
            STATUS_CLASS[status],
          )}
        />
      )}
    </span>
  );
}
