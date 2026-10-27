"use client";

import { useState, useTransition } from "react";
import { Check, Lock, Minus, X } from "lucide-react";
import { setChannelOverwrite, setClientVisible } from "@/app/actions/permissions";
import { Dialog, IconButton, Select } from "@/components/ui/dialog";
import { CHANNEL_PERMISSIONS, Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { Channel, ChannelOverwrite, Member, RoleDetail } from "@/lib/types";

type Target = { type: "role" | "member"; id: string };
type Row = ChannelOverwrite;

const key = (type: string, id: string) => `${type}:${id}`;

function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg bg-rail/60 p-3">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-faint">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-60",
          checked ? "bg-accent" : "bg-hover",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-fg transition-all",
            checked ? "left-[18px] bg-accent-fg" : "left-0.5",
          )}
        />
      </button>
    </label>
  );
}

export function ChannelPermissionsDialog({
  channel,
  overwrites,
  roles,
  members,
}: {
  channel: Channel;
  overwrites: ChannelOverwrite[];
  roles: RoleDetail[];
  members: Member[];
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>(overwrites);
  const [extraTargets, setExtraTargets] = useState<Target[]>([]);
  const [clientVisible, setClientVisibleState] = useState(channel.client_visible);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const everyone = roles.find((r) => r.is_everyone);
  const isProject = Boolean(channel.project_id);
  const rowFor = (type: Row["target_type"], id: string) =>
    rows.find((r) => r.target_type === type && r.target_id === id) ?? { target_type: type, target_id: id, allow: 0, deny: 0 };
  const isPrivate = everyone ? (rowFor("role", everyone.id).deny & Permission.VIEW_CHANNEL) !== 0 : false;

  function save(type: Row["target_type"], id: string, allow: number, deny: number) {
    const previous = rows;
    setRows((current) => [
      ...current.filter((r) => !(r.target_type === type && r.target_id === id)),
      ...(allow || deny ? [{ target_type: type, target_id: id, allow, deny }] : []),
    ]);
    startTransition(async () => {
      const result = await setChannelOverwrite(channel.id, type, id, allow, deny);
      if (result.error) {
        setRows(previous);
        setError(result.error);
      } else {
        setError(null);
      }
    });
  }

  /** hériter → autoriser → refuser → hériter */
  function cycle(type: Row["target_type"], id: string, bit: number) {
    const row = rowFor(type, id);
    if (row.allow & bit) save(type, id, row.allow & ~bit, row.deny | bit);
    else if (row.deny & bit) save(type, id, row.allow, row.deny & ~bit);
    else save(type, id, row.allow | bit, row.deny);
  }

  function togglePrivate(value: boolean) {
    if (!everyone) return;
    const row = rowFor("role", everyone.id);
    const deny = value ? row.deny | Permission.VIEW_CHANNEL : row.deny & ~Permission.VIEW_CHANNEL;
    save("role", everyone.id, row.allow & ~Permission.VIEW_CHANNEL, deny);
  }

  function toggleClientVisible(value: boolean) {
    setClientVisibleState(value);
    startTransition(async () => {
      const result = await setClientVisible(channel.id, value);
      if (result.error) {
        setClientVisibleState(!value);
        setError(result.error);
      }
    });
  }

  const roleById = new Map(roles.map((r) => [r.id, r]));
  const memberById = new Map(members.map((m) => [m.user_id, m]));
  const shownKeys = new Set([
    ...rows.map((r) => key(r.target_type, r.target_id)),
    ...extraTargets.map((t) => key(t.type, t.id)),
  ]);
  const shown: Target[] = [...shownKeys].map((k) => {
    const [type, id] = k.split(":") as [Target["type"], string];
    return { type, id };
  });
  // @everyone en premier, puis les rôles par position, puis les membres
  shown.sort((a, b) => {
    const rank = (t: Target) =>
      t.type === "role" ? (roleById.get(t.id)?.is_everyone ? 1e6 : (roleById.get(t.id)?.position ?? 0)) : -1;
    return rank(b) - rank(a);
  });

  const addable = [
    ...roles.filter((r) => !shownKeys.has(key("role", r.id))).map((r) => ({ type: "role" as const, id: r.id, label: r.name })),
    ...members
      .filter((m) => !shownKeys.has(key("member", m.user_id)))
      .map((m) => ({ type: "member" as const, id: m.user_id, label: m.display_name })),
  ];

  return (
    <>
      <IconButton title="Permissions du salon" onClick={() => setOpen(true)} className="size-8">
        <Lock className="size-4" />
      </IconButton>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Permissions de #${channel.name}`}
        description="Les exceptions s'appliquent par-dessus les rôles : refuser l'emporte sur le rôle, et une exception sur un membre l'emporte sur tout."
      >
        <div className="space-y-4">
          {error && <p className="text-sm text-danger">{error}</p>}
          <Toggle
            label="Salon privé"
            hint="Invisible par défaut : seuls les rôles ou membres autorisés ci-dessous le voient."
            checked={isPrivate}
            onChange={togglePrivate}
            disabled={pending || !everyone}
          />
          {isProject && (
            <Toggle
              label="Visible par les clients"
              hint="Les personnes avec le rôle Client dans le projet voient ce salon."
              checked={clientVisible}
              onChange={toggleClientVisible}
              disabled={pending}
            />
          )}

          <div className="overflow-hidden rounded-lg border border-line">
            <div className="grid grid-cols-[1fr_repeat(4,52px)] items-center gap-1 border-b border-line bg-rail/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
              <span>Exceptions</span>
              {CHANNEL_PERMISSIONS.map((p) => (
                <span key={p.bit} className="text-center">
                  {p.label}
                </span>
              ))}
            </div>
            <ul className="max-h-64 divide-y divide-line overflow-y-auto">
              {shown.map((target) => {
                const role = target.type === "role" ? roleById.get(target.id) : undefined;
                const member = target.type === "member" ? memberById.get(target.id) : undefined;
                const row = rowFor(target.type, target.id);
                return (
                  <li key={key(target.type, target.id)} className="grid grid-cols-[1fr_repeat(4,52px)] items-center gap-1 px-3 py-2">
                    <span
                      className="truncate text-sm"
                      style={role?.color ? { color: role.color } : undefined}
                    >
                      {role ? role.name : `@${member?.display_name ?? "membre"}`}
                    </span>
                    {CHANNEL_PERMISSIONS.map((p) => {
                      const state = row.allow & p.bit ? "allow" : row.deny & p.bit ? "deny" : "inherit";
                      return (
                        <button
                          key={p.bit}
                          type="button"
                          disabled={pending}
                          onClick={() => cycle(target.type, target.id, p.bit)}
                          title={state === "allow" ? "Autorisé" : state === "deny" ? "Refusé" : "Hérité du rôle"}
                          className={cn(
                            "mx-auto grid size-7 place-items-center rounded-md border transition",
                            state === "allow" && "border-online/50 bg-online/15 text-online",
                            state === "deny" && "border-danger/50 bg-danger/15 text-danger",
                            state === "inherit" && "border-line text-faint hover:text-fg",
                          )}
                        >
                          {state === "allow" ? <Check className="size-4" /> : state === "deny" ? <X className="size-4" /> : <Minus className="size-3.5" />}
                        </button>
                      );
                    })}
                  </li>
                );
              })}
              {shown.length === 0 && <li className="px-3 py-3 text-sm text-faint">Aucune exception : le salon suit les rôles.</li>}
            </ul>
          </div>

          {addable.length > 0 && (
            <Select
              value=""
              onChange={(event) => {
                const [type, id] = event.target.value.split(":") as [Target["type"], string];
                if (id) setExtraTargets((current) => [...current, { type, id }]);
              }}
            >
              <option value="">+ Ajouter un rôle ou un membre…</option>
              <optgroup label="Rôles">
                {addable.filter((a) => a.type === "role").map((a) => (
                  <option key={a.id} value={key(a.type, a.id)}>
                    {a.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Membres">
                {addable.filter((a) => a.type === "member").map((a) => (
                  <option key={a.id} value={key(a.type, a.id)}>
                    {a.label}
                  </option>
                ))}
              </optgroup>
            </Select>
          )}
          <p className="text-xs text-faint">Clique sur une case : hérité → autorisé → refusé.</p>
        </div>
      </Dialog>
    </>
  );
}
