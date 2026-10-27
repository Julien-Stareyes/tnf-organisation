"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Maximize,
  Pause,
  Play,
  Repeat,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  COMMENT_COLUMNS,
  DRAW_COLORS,
  FPS_PRESETS,
  formatTimecode,
  frameAt,
  isVideo,
  REVIEWS_BUCKET,
  STATUS_CLASS,
  STATUS_LABEL,
  timeOfFrame,
  type ReviewAsset,
  type ReviewComment,
  type ReviewStatus,
  type ReviewVersion,
  type Stroke,
} from "@/lib/reviews";
import { cn } from "@/lib/utils";
import { CommentPanel } from "./comment-panel";
import { DrawingCanvas } from "./drawing-canvas";
import { UploadReviewDialog } from "./upload-dialog";

type Person = { name: string; avatar_url: string | null };
type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

const SPEEDS = [0.25, 0.5, 1, 2];

function upsertById<T extends { id: string }>(list: T[], item: T) {
  const index = list.findIndex((x) => x.id === item.id);
  if (index < 0) return [...list, item];
  const next = [...list];
  next[index] = item;
  return next;
}

export function ReviewViewer({
  asset,
  versions,
  version,
  mediaUrl,
  initialComments,
  people: initialPeople,
  meId,
  isTeam,
  focusCommentId,
  basePath,
}: {
  asset: ReviewAsset;
  versions: ReviewVersion[];
  version: ReviewVersion;
  mediaUrl: string | null;
  initialComments: ReviewComment[];
  people: Record<string, Person>;
  meId: string;
  isTeam: boolean;
  focusCommentId: string | null;
  basePath: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const videoRef = useRef<VideoWithFrameCallback>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const video = isVideo(version.mime);
  const [fps, setFps] = useState(Number(version.fps));
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(version.duration ?? 0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [status, setStatus] = useState<ReviewStatus>(asset.status);
  const [comments, setComments] = useState(initialComments);
  const [people, setPeople] = useState(initialPeople);
  const [selectedId, setSelectedId] = useState<string | null>(focusCommentId);
  const [drawing, setDrawing] = useState(false);
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[0]);
  const [draftStrokes, setDraftStrokes] = useState<Stroke[]>([]);
  const [error, setError] = useState<string | null>(null);

  const frame = frameAt(time, fps);
  const totalFrames = Math.max(1, frameAt(duration, fps));

  // ─── Taille d'affichage : le rendu tient dans la zone, ratio conservé ─────
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const mediaW = version.width ?? 16;
      const mediaH = version.height ?? 9;
      const scale = Math.min(width / mediaW, height / mediaH);
      setStage({ width: Math.floor(mediaW * scale), height: Math.floor(mediaH * scale) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [version.width, version.height]);

  // ─── Suivi précis de l'image affichée ─────────────────────────────────────
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !video) return;
    const onSeeked = () => setTime(el.currentTime);
    el.addEventListener("seeked", onSeeked);

    // requestVideoFrameCallback : l'heure exacte de l'image affichée (Chrome, Edge, Safari)
    if (el.requestVideoFrameCallback) {
      let handle = 0;
      const onFrame = (_: number, meta: { mediaTime: number }) => {
        setTime(meta.mediaTime);
        handle = el.requestVideoFrameCallback!(onFrame);
      };
      handle = el.requestVideoFrameCallback(onFrame);
      return () => {
        el.removeEventListener("seeked", onSeeked);
        el.cancelVideoFrameCallback?.(handle);
      };
    }
    const onTime = () => setTime(el.currentTime);
    el.addEventListener("timeupdate", onTime);
    return () => {
      el.removeEventListener("seeked", onSeeked);
      el.removeEventListener("timeupdate", onTime);
    };
  }, [video]);

  const seekToFrame = useCallback(
    (target: number) => {
      const el = videoRef.current;
      if (!el) return;
      const clamped = Math.max(0, Math.min(totalFrames - 1, target));
      el.currentTime = timeOfFrame(clamped, fps);
      setTime(clamped / fps);
    },
    [fps, totalFrames],
  );

  const pause = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      setDrawing(false);
      setSelectedId(null);
      // Une pause juste après play() annule la lecture (AbortError) : c'est voulu, on l'ignore
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, []);

  const step = useCallback(
    (delta: number) => {
      pause();
      seekToFrame(frameAt(videoRef.current?.currentTime ?? 0, fps) + delta);
    },
    [pause, seekToFrame, fps],
  );

  // ─── Raccourcis clavier ───────────────────────────────────────────────────
  useEffect(() => {
    if (!video) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      if (event.key === " " || event.key === "k") {
        event.preventDefault();
        togglePlay();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(event.shiftKey ? -Math.round(fps) : -1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        step(event.shiftKey ? Math.round(fps) : 1);
      } else if (event.key === "Home") {
        seekToFrame(0);
      } else if (event.key === "End") {
        seekToFrame(totalFrames - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [video, togglePlay, step, seekToFrame, fps, totalFrames]);

  // Arrivée depuis une notification : on se place sur le commentaire
  const focusedOnce = useRef(false);
  useEffect(() => {
    if (focusedOnce.current || !focusCommentId) return;
    const comment = initialComments.find((c) => c.id === focusCommentId);
    if (comment?.timecode != null && duration > 0) {
      focusedOnce.current = true;
      seekToFrame(frameAt(comment.timecode, fps));
    }
  }, [focusCommentId, initialComments, duration, fps, seekToFrame]);

  // ─── Temps réel ───────────────────────────────────────────────────────────
  const resolvePerson = useCallback(
    async (id: string) => {
      if (people[id]) return;
      const { data } = await supabase.from("profiles").select("display_name, avatar_url").eq("id", id).maybeSingle();
      if (data) setPeople((current) => ({ ...current, [id]: { name: data.display_name, avatar_url: data.avatar_url } }));
    },
    [supabase, people],
  );

  useEffect(() => {
    const channel = supabase
      .channel(`review:${version.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "review_comments", filter: `version_id=eq.${version.id}` },
        ({ eventType, new: row }) => {
          if (eventType === "DELETE") return;
          const comment = row as ReviewComment;
          setComments((current) => upsertById(current, comment));
          resolvePerson(comment.author_id);
        },
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "review_comments" }, ({ old }) => {
        const id = (old as { id: string }).id;
        setComments((current) => current.filter((c) => c.id !== id && c.parent_id !== id));
      })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "review_assets", filter: `id=eq.${asset.id}` },
        ({ new: row }) => setStatus((row as ReviewAsset).status),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, version.id, asset.id, resolvePerson]);

  // ─── Actions ──────────────────────────────────────────────────────────────
  async function sendComment(body: string, { withTimecode, parentId }: { withTimecode: boolean; parentId: string | null }) {
    setError(null);
    const { data, error: insertError } = await supabase
      .from("review_comments")
      .insert({
        version_id: version.id,
        asset_id: asset.id,
        project_id: asset.project_id,
        parent_id: parentId,
        author_id: meId,
        body,
        // On enregistre le début de l'image courante
        timecode: withTimecode ? frame / fps : null,
        drawing: !parentId && draftStrokes.length ? draftStrokes : null,
      })
      .select(COMMENT_COLUMNS)
      .single();
    if (insertError || !data) {
      setError("Le commentaire n'a pas pu être envoyé.");
      return false;
    }
    setComments((current) => upsertById(current, data as ReviewComment));
    if (!parentId) {
      setDraftStrokes([]);
      setDrawing(false);
      setSelectedId((data as ReviewComment).id);
    }
    return true;
  }

  async function toggleResolved(comment: ReviewComment) {
    const resolved_at = comment.resolved_at ? null : new Date().toISOString();
    setComments((current) => current.map((c) => (c.id === comment.id ? { ...c, resolved_at } : c)));
    const { error: updateError } = await supabase.from("review_comments").update({ resolved_at }).eq("id", comment.id);
    if (updateError) setError("Impossible de modifier ce commentaire.");
  }

  async function deleteComment(comment: ReviewComment) {
    setComments((current) => current.filter((c) => c.id !== comment.id && c.parent_id !== comment.id));
    const { error: deleteError } = await supabase.from("review_comments").delete().eq("id", comment.id);
    if (deleteError) setError("Le commentaire n'a pas pu être supprimé.");
  }

  async function changeStatus(next: ReviewStatus) {
    const previous = status;
    setStatus(next);
    const { error: updateError } = await supabase.from("review_assets").update({ status: next }).eq("id", asset.id);
    if (updateError) {
      setStatus(previous);
      setError("Le statut n'a pas pu être changé.");
    }
  }

  async function changeFps(next: number) {
    setFps(next);
    await supabase.from("review_versions").update({ fps: next }).eq("id", version.id);
  }

  async function deleteAsset() {
    if (!window.confirm(`Supprimer « ${asset.title} », toutes ses versions et commentaires ?`)) return;
    const paths = versions.flatMap((v) => [v.storage_path, v.thumbnail_path].filter(Boolean) as string[]);
    if (paths.length) await supabase.storage.from(REVIEWS_BUCKET).remove(paths);
    const { error: deleteError } = await supabase.from("review_assets").delete().eq("id", asset.id);
    if (deleteError) return setError("Le rendu n'a pas pu être supprimé.");
    router.push(basePath);
    router.refresh();
  }

  function selectComment(comment: ReviewComment) {
    setSelectedId(comment.id);
    setDrawing(false);
    if (video && comment.timecode !== null) {
      pause();
      seekToFrame(frameAt(comment.timecode, fps));
    }
  }

  // Annotation affichée : brouillon en cours, sinon celle du commentaire sélectionné (sur son image)
  const selected = comments.find((c) => c.id === selectedId) ?? null;
  const shownStrokes = drawing
    ? draftStrokes
    : selected?.drawing &&
        (!video || (selected.timecode !== null && frameAt(selected.timecode, fps) === frame && !playing))
      ? selected.drawing
      : [];

  const markers = comments.filter((c) => !c.parent_id && c.timecode !== null);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col bg-black/30">
        {/* Barre d'outils du rendu */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
          <select
            value={version.id}
            onChange={(event) => router.push(`${basePath}/${asset.id}?v=${event.target.value}`)}
            className="rounded-md border border-line bg-rail px-2 py-1 text-xs font-semibold"
            title="Version"
          >
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.version} — {new Date(v.created_at).toLocaleDateString("fr-FR")}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(event) => changeStatus(event.target.value as ReviewStatus)}
            className={cn("rounded-md border-0 px-2 py-1 text-xs font-semibold", STATUS_CLASS[status])}
            title="Statut"
          >
            {(Object.keys(STATUS_LABEL) as ReviewStatus[]).map((s) => (
              <option key={s} value={s} className="bg-sidebar text-fg">
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          {video && (
            <select
              value={String(fps)}
              onChange={(event) => changeFps(Number(event.target.value))}
              disabled={!isTeam}
              className="rounded-md border border-line bg-rail px-2 py-1 text-xs"
              title="Images par seconde"
            >
              {[...new Set([...FPS_PRESETS, fps])].sort((a, b) => a - b).map((value) => (
                <option key={value} value={value}>
                  {value} i/s
                </option>
              ))}
            </select>
          )}
          <span className="truncate text-xs text-faint">
            {version.file_name}
            {version.width && version.height ? ` · ${version.width}×${version.height}` : ""}
          </span>
          <span className="ml-auto flex items-center gap-2">
            {isTeam && (
              <>
                <UploadReviewDialog projectId={asset.project_id} assetId={asset.id} meId={meId} basePath={basePath} trigger="version" />
                <button type="button" onClick={deleteAsset} title="Supprimer le rendu" className="text-faint hover:text-danger">
                  <Trash2 className="size-4" />
                </button>
              </>
            )}
          </span>
        </div>
        {error && (
          <button type="button" onClick={() => setError(null)} className="px-4 pt-2 text-left text-sm text-danger">
            {error} (fermer)
          </button>
        )}

        {/* Zone d'affichage */}
        <div ref={stageRef} className="relative grid min-h-0 flex-1 place-items-center overflow-hidden p-4">
          {mediaUrl ? (
            <div className="relative" style={{ width: stage.width, height: stage.height }}>
              {video ? (
                <video
                  ref={videoRef}
                  src={mediaUrl}
                  className="size-full bg-black"
                  playsInline
                  preload="auto"
                  muted={muted}
                  loop={loop}
                  onClick={togglePlay}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onLoadedMetadata={(event) => {
                    setDuration(event.currentTarget.duration);
                    event.currentTarget.playbackRate = speed;
                  }}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl} alt={asset.title} className="size-full object-contain" />
              )}
              <DrawingCanvas
                width={stage.width}
                height={stage.height}
                strokes={shownStrokes}
                editable={drawing}
                color={drawColor}
                onChange={setDraftStrokes}
              />
            </div>
          ) : (
            <p className="text-sm text-faint">Fichier introuvable ou accès refusé.</p>
          )}
        </div>

        {/* Lecteur */}
        {video && (
          <div className="space-y-2 border-t border-line bg-sidebar px-4 pb-3 pt-2">
            <Timeline
              duration={duration}
              time={time}
              markers={markers}
              people={people}
              selectedId={selectedId}
              onSeek={(t) => seekToFrame(frameAt(t, fps))}
              onScrubStart={pause}
              onMarker={selectComment}
            />
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => step(-1)} title="Image précédente (←)" className="text-muted hover:text-fg">
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                onClick={togglePlay}
                title="Lecture / pause (espace)"
                className="grid size-9 place-items-center rounded-full bg-accent text-accent-fg"
              >
                {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
              </button>
              <button type="button" onClick={() => step(1)} title="Image suivante (→)" className="text-muted hover:text-fg">
                <ChevronRight className="size-5" />
              </button>
              <span className="font-mono text-sm tabular-nums text-fg">{formatTimecode(time, fps)}</span>
              <span className="font-mono text-xs tabular-nums text-faint">
                / {formatTimecode(duration, fps)} · image {frame + 1}/{totalFrames}
              </span>
              <span className="ml-auto flex items-center gap-3 text-muted">
                <select
                  value={speed}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setSpeed(next);
                    if (videoRef.current) videoRef.current.playbackRate = next;
                  }}
                  className="rounded border border-line bg-rail px-1.5 py-0.5 text-xs"
                  title="Vitesse"
                >
                  {SPEEDS.map((s) => (
                    <option key={s} value={s}>
                      ×{s}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setLoop(!loop)}
                  title="Boucle"
                  className={cn("hover:text-fg", loop && "text-accent")}
                >
                  <Repeat className="size-4" />
                </button>
                <button type="button" onClick={() => setMuted(!muted)} title="Son" className="hover:text-fg">
                  {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => stageRef.current?.requestFullscreen()}
                  title="Plein écran"
                  className="hover:text-fg"
                >
                  <Maximize className="size-4" />
                </button>
              </span>
            </div>
            <p className="text-[11px] text-faint">
              Espace : lecture · ← → : image par image · Maj + ← → : 1 seconde · Début / Fin
            </p>
          </div>
        )}
      </div>

      <CommentPanel
        comments={comments}
        people={people}
        meId={meId}
        isTeam={isTeam}
        fps={fps}
        isVideoAsset={video}
        currentTime={time}
        selectedId={selectedId}
        drawing={drawing}
        drawColor={drawColor}
        draftStrokes={draftStrokes}
        onSelect={selectComment}
        onSend={sendComment}
        onToggleResolved={toggleResolved}
        onDelete={deleteComment}
        onDrawingChange={(on) => {
          if (on) pause();
          setDrawing(on);
          setSelectedId(null);
        }}
        onDrawColorChange={setDrawColor}
        onClearDrawing={() => setDraftStrokes([])}
        onComposerFocus={pause}
      />
    </div>
  );
}

function Timeline({
  duration,
  time,
  markers,
  people,
  selectedId,
  onSeek,
  onScrubStart,
  onMarker,
}: {
  duration: number;
  time: number;
  markers: ReviewComment[];
  people: Record<string, Person>;
  selectedId: string | null;
  onSeek: (time: number) => void;
  onScrubStart: () => void;
  onMarker: (comment: ReviewComment) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const progress = duration ? Math.min(1, time / duration) : 0;

  function timeFromEvent(event: React.PointerEvent) {
    const rect = ref.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * duration;
  }

  return (
    <div className="relative pt-3">
      {/* Repères des commentaires */}
      {duration > 0 &&
        markers.map((comment) => (
          <button
            key={comment.id}
            type="button"
            title={`${people[comment.author_id]?.name ?? ""} : ${comment.body}`}
            onClick={() => onMarker(comment)}
            className={cn(
              "absolute top-0 z-10 size-2.5 -translate-x-1/2 rounded-full border border-sidebar transition hover:scale-150",
              comment.resolved_at ? "bg-faint" : "bg-accent",
              selectedId === comment.id && "scale-150 ring-2 ring-fg",
            )}
            style={{ left: `${(comment.timecode! / duration) * 100}%` }}
          />
        ))}
      <div
        ref={ref}
        className="group relative h-2 cursor-pointer rounded-full bg-rail"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          onScrubStart();
          onSeek(timeFromEvent(event));
        }}
        onPointerMove={(event) => {
          if (event.buttons === 1) onSeek(timeFromEvent(event));
        }}
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${progress * 100}%` }} />
        <div
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg shadow transition group-hover:scale-110"
          style={{ left: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}
