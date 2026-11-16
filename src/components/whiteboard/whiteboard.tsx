"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@excalidraw/excalidraw/index.css";
import { CaptureUpdateAction, Excalidraw, reconcileElements, restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, BinaryFileData, BinaryFiles, Collaborator, SocketId } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "@/components/theme-toggle";

// Collaboration : les éléments modifiés partent en "broadcast" Supabase et sont fusionnés chez les autres
// avec reconcileElements (même algorithme qu'excalidraw.com). La scène est sauvegardée en base toutes les 2 s.

type Me = { id: string; name: string };

const SAVE_DELAY = 2000;
const BROADCAST_DELAY = 60;
const POINTER_DELAY = 40;
const COLLABORATOR_TIMEOUT = 30_000;
const MAX_FILE_CHARS = 7_000_000;

const COLORS = ["#d4ff3a", "#4fb3ff", "#ff5fa2", "#f5b83d", "#9b7bff", "#3ddc84", "#ff7a3d"];
function colorFor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const color = COLORS[Math.abs(hash) % COLORS.length];
  return { background: color, stroke: color };
}

export default function Whiteboard({
  projectId,
  initialElements,
  me,
}: {
  projectId: string;
  initialElements: unknown[];
  me: Me;
}) {
  const supabase = useMemo(() => createClient(), []);
  const theme = useTheme();
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const channelRef = useRef<RealtimeChannel | null>(null);
  const sentVersions = useRef(new Map<string, number>());
  const knownFiles = useRef(new Set<string>());
  const pendingBroadcast = useRef<OrderedExcalidrawElement[]>([]);
  const timers = useRef<{ save?: number; broadcast?: number; pointer?: number }>({});
  const lastPointerSent = useRef(0);
  const collaborators = useRef(new Map<SocketId, Collaborator & { seenAt: number }>());

  const initialData = useMemo(() => {
    const elements = restoreElements(initialElements as never, null);
    elements.forEach((element) => sentVersions.current.set(element.id, element.version));
    // Fond transparent : la couleur suit le thème de l'application
    return { elements, appState: { viewBackgroundColor: "transparent" }, scrollToContent: true };
  }, [initialElements]);

  // ─── Images ───────────────────────────────────────────────────────────────
  const loadFiles = useCallback(
    async (ids?: string[]) => {
      if (!api) return;
      let query = supabase.from("whiteboard_files").select("id, mime_type, data_url, created_at").eq("project_id", projectId);
      if (ids) query = query.in("id", ids);
      const { data } = await query;
      if (!data?.length) return;
      data.forEach((file) => knownFiles.current.add(file.id));
      api.addFiles(
        data.map((file) => ({
          id: file.id,
          mimeType: file.mime_type,
          dataURL: file.data_url,
          created: new Date(file.created_at).getTime(),
        })) as BinaryFileData[],
      );
    },
    [api, supabase, projectId],
  );

  const uploadNewFiles = useCallback(
    async (files: BinaryFiles) => {
      const fresh = Object.values(files).filter((file) => !knownFiles.current.has(file.id));
      if (!fresh.length) return;
      fresh.forEach((file) => knownFiles.current.add(file.id));
      const rows = fresh
        .filter((file) => file.dataURL.length <= MAX_FILE_CHARS)
        .map((file) => ({ project_id: projectId, id: file.id, mime_type: file.mimeType, data_url: file.dataURL }));
      if (rows.length < fresh.length) window.alert("Image trop lourde (5 Mo max) : elle ne sera pas partagée.");
      if (!rows.length) return;
      const { error } = await supabase.from("whiteboard_files").upsert(rows, { onConflict: "project_id,id" });
      if (!error) {
        channelRef.current?.send({ type: "broadcast", event: "files", payload: { ids: rows.map((r) => r.id) } });
      }
    },
    [supabase, projectId],
  );

  // ─── Sauvegarde ───────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (!api) return;
    setStatus("saving");
    const { error } = await supabase.from("whiteboards").upsert({
      project_id: projectId,
      elements: api.getSceneElementsIncludingDeleted(),
      updated_by: me.id,
      updated_at: new Date().toISOString(),
    });
    setStatus(error ? "error" : "saved");
  }, [api, supabase, projectId, me.id]);

  const scheduleSave = useCallback(() => {
    window.clearTimeout(timers.current.save);
    timers.current.save = window.setTimeout(save, SAVE_DELAY);
  }, [save]);

  // ─── Temps réel ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!api) return;
    loadFiles();

    const channel = supabase
      .channel(`whiteboard:${projectId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "elements" }, ({ payload }) => {
        const remote = (payload as { elements: RemoteExcalidrawElement[] }).elements;
        const merged = reconcileElements(api.getSceneElementsIncludingDeleted(), remote, api.getAppState());
        // Ce qu'on vient de recevoir n'a pas à être renvoyé
        merged.forEach((element) => sentVersions.current.set(element.id, element.version));
        api.updateScene({ elements: merged, captureUpdate: CaptureUpdateAction.NEVER });

        const missing = merged
          .filter((el) => el.type === "image" && "fileId" in el && el.fileId && !api.getFiles()[el.fileId])
          .map((el) => (el as { fileId: string }).fileId);
        if (missing.length) loadFiles(missing);
      })
      .on("broadcast", { event: "files" }, ({ payload }) => {
        loadFiles((payload as { ids: string[] }).ids);
      })
      .on("broadcast", { event: "pointer" }, ({ payload }) => {
        const { id, name, pointer, button } = payload as {
          id: string;
          name: string;
          pointer: Collaborator["pointer"];
          button: Collaborator["button"];
        };
        collaborators.current.set(id as SocketId, {
          id,
          username: name,
          pointer,
          button,
          color: colorFor(id),
          seenAt: Date.now(),
        });
        api.updateScene({ collaborators: new Map(collaborators.current) });
      })
      .subscribe();
    channelRef.current = channel;

    // Retire les curseurs des personnes inactives
    const cleanup = window.setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [id, collaborator] of collaborators.current) {
        if (now - collaborator.seenAt > COLLABORATOR_TIMEOUT) {
          collaborators.current.delete(id);
          changed = true;
        }
      }
      if (changed) api.updateScene({ collaborators: new Map(collaborators.current) });
    }, 5000);

    const currentTimers = timers.current;
    return () => {
      window.clearInterval(cleanup);
      window.clearTimeout(currentTimers.broadcast);
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [api, supabase, projectId, loadFiles]);

  // Sauvegarde immédiate si on quitte la page avec des changements en attente
  useEffect(() => {
    const currentTimers = timers.current;
    return () => {
      if (currentTimers.save) {
        window.clearTimeout(currentTimers.save);
        save();
      }
    };
  }, [save]);

  const onChange = useCallback(
    (elements: readonly OrderedExcalidrawElement[], _appState: unknown, files: BinaryFiles) => {
      const changed = elements.filter((element) => sentVersions.current.get(element.id) !== element.version);
      if (Object.keys(files).length) uploadNewFiles(files);
      if (!changed.length) return;

      changed.forEach((element) => sentVersions.current.set(element.id, element.version));
      pendingBroadcast.current.push(...changed);
      scheduleSave();

      if (timers.current.broadcast) return;
      timers.current.broadcast = window.setTimeout(() => {
        timers.current.broadcast = undefined;
        // Dernière version de chaque élément seulement
        const latest = new Map(pendingBroadcast.current.map((element) => [element.id, element]));
        pendingBroadcast.current = [];
        channelRef.current?.send({ type: "broadcast", event: "elements", payload: { elements: [...latest.values()] } });
      }, BROADCAST_DELAY);
    },
    [scheduleSave, uploadNewFiles],
  );

  const onPointerUpdate = useCallback(
    ({ pointer, button }: { pointer: Collaborator["pointer"]; button: Collaborator["button"] }) => {
      const now = Date.now();
      if (now - lastPointerSent.current < POINTER_DELAY) return;
      lastPointerSent.current = now;
      channelRef.current?.send({
        type: "broadcast",
        event: "pointer",
        payload: { id: me.id, name: me.name, pointer, button },
      });
    },
    [me.id, me.name],
  );

  return (
    <div className="relative min-h-0 flex-1">
      <Excalidraw
        excalidrawAPI={setApi}
        initialData={initialData}
        onChange={onChange}
        onPointerUpdate={onPointerUpdate}
        isCollaborating
        theme={theme}
        langCode="fr-FR"
        UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false } }}
      />
      <span className="pointer-events-none absolute bottom-3 right-16 z-10 rounded-md bg-sidebar/80 px-2 py-1 text-xs text-faint">
        {status === "saving" ? "Enregistrement…" : status === "error" ? "Erreur d'enregistrement" : "Enregistré"}
      </span>
    </div>
  );
}
