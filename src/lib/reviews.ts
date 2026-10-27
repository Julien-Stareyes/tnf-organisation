// Revue des rendus : types et calculs de timecode partagés serveur / navigateur

export const REVIEWS_BUCKET = "reviews";

export type ReviewStatus = "in_review" | "changes_requested" | "approved";

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  in_review: "En revue",
  changes_requested: "Corrections demandées",
  approved: "Approuvé",
};

export const STATUS_CLASS: Record<ReviewStatus, string> = {
  in_review: "bg-idle/15 text-idle",
  changes_requested: "bg-danger/15 text-danger",
  approved: "bg-online/15 text-online",
};

export type ReviewAsset = {
  id: string;
  project_id: string;
  title: string;
  status: ReviewStatus;
  created_by: string | null;
  updated_at: string;
};

export type ReviewVersion = {
  id: string;
  asset_id: string;
  project_id: string;
  version: number;
  storage_path: string;
  thumbnail_path: string | null;
  file_name: string;
  mime: string;
  size: number;
  duration: number | null;
  width: number | null;
  height: number | null;
  fps: number;
  created_at: string;
};

export type Stroke = { color: string; width: number; points: [number, number][] };

export type ReviewComment = {
  id: string;
  version_id: string;
  asset_id: string;
  project_id: string;
  parent_id: string | null;
  author_id: string;
  body: string;
  timecode: number | null;
  drawing: Stroke[] | null;
  resolved_at: string | null;
  created_at: string;
  edited_at: string | null;
};

export const VERSION_COLUMNS =
  "id, asset_id, project_id, version, storage_path, thumbnail_path, file_name, mime, size, duration, width, height, fps, created_at";
export const COMMENT_COLUMNS =
  "id, version_id, asset_id, project_id, parent_id, author_id, body, timecode, drawing, resolved_at, created_at, edited_at";

export const DRAW_COLORS = ["#ff4d4d", "#d4ff3a", "#4fb3ff", "#ffffff"];
export const FPS_PRESETS = [23.976, 24, 25, 29.97, 30, 50, 60];

export const isVideo = (mime: string) => mime.startsWith("video/");
export const isImage = (mime: string) => mime.startsWith("image/");

/** Image (0-indexée) affichée au temps t. Le petit epsilon évite les erreurs d'arrondi flottant. */
export function frameAt(time: number, fps: number) {
  return Math.floor(time * fps + 1e-6);
}

/** Temps à viser pour afficher exactement l'image n (milieu de l'image, robuste aux arrondis des navigateurs) */
export function timeOfFrame(frame: number, fps: number) {
  return (frame + 0.5) / fps;
}

/** 00:01:23:12 (heures:minutes:secondes:images) */
export function formatTimecode(time: number, fps: number) {
  const totalFrames = frameAt(time, fps);
  const roundFps = Math.round(fps);
  const frames = totalFrames % roundFps;
  const totalSeconds = Math.floor(totalFrames / roundFps);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(totalSeconds / 3600))}:${pad(Math.floor(totalSeconds / 60) % 60)}:${pad(totalSeconds % 60)}:${pad(frames)}`;
}
