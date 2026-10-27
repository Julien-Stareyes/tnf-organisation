"use client";

import { createClient } from "@/lib/supabase/client";
import { storageSafeName } from "@/lib/chat";
import { isImage, REVIEWS_BUCKET } from "@/lib/reviews";

// Limite par fichier : 50 Mo sur le plan gratuit de Supabase (relevable en plan Pro, voir le README)
export const MAX_REVIEW_UPLOAD_MB = Number(process.env.NEXT_PUBLIC_MAX_REVIEW_UPLOAD_MB ?? 50);

type MediaInfo = { duration: number | null; width: number | null; height: number | null; thumbnail: Blob | null };

const THUMB_WIDTH = 640;
const MEDIA_INFO_TIMEOUT = 10_000;

/** Certains navigateurs ou codecs ne déclenchent jamais les événements vidéo : on n'attend pas indéfiniment */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T) {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

const NO_INFO: MediaInfo = { duration: null, width: null, height: null, thumbnail: null };

function canvasToJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
}

function drawThumb(source: CanvasImageSource, width: number, height: number) {
  const scale = Math.min(1, THUMB_WIDTH / width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvasToJpeg(canvas);
}

/** Durée, résolution et miniature, lues dans le navigateur (10 s max, sinon on s'en passe) */
export function readMediaInfo(file: File): Promise<MediaInfo> {
  return withTimeout(readMediaInfoUnbounded(file), MEDIA_INFO_TIMEOUT, NO_INFO);
}

async function readMediaInfoUnbounded(file: File): Promise<MediaInfo> {
  if (isImage(file.type)) {
    try {
      const bitmap = await createImageBitmap(file);
      return { duration: null, width: bitmap.width, height: bitmap.height, thumbnail: await drawThumb(bitmap, bitmap.width, bitmap.height) };
    } catch {
      return NO_INFO;
    }
  }

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    // Écouteurs posés avant de charger la source, pour ne rater aucun événement
    const metadata = new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("format_video"));
    });
    video.src = url;
    video.load();
    await metadata;

    const { duration, videoWidth, videoHeight } = video;
    const info = { duration: Number.isFinite(duration) ? duration : null, width: videoWidth || null, height: videoHeight || null };

    // Miniature prise à 10 % de la durée (max 2 s) pour éviter un premier plan noir ; sinon première image
    const target = Math.min(2, (info.duration ?? 0) * 0.1);
    if (target > 0) {
      const seeked = new Promise<void>((resolve) => (video.onseeked = () => resolve()));
      video.currentTime = target;
      await withTimeout(seeked, 3000, undefined);
    }
    const thumbnail = videoWidth && videoHeight ? await drawThumb(video, videoWidth, videoHeight) : null;
    return { ...info, thumbnail };
  } catch {
    return NO_INFO;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** Envoi direct au stockage Supabase avec suivi de progression (le SDK n'en fournit pas) */
async function uploadWithProgress(path: string, file: File, onProgress: (ratio: number) => void) {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("session");

  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${REVIEWS_BUCKET}/${encodedPath}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(event.loaded / event.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(xhr.responseText || `HTTP ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("réseau"));
    xhr.send(file);
  });
}

/**
 * Envoie le fichier d'abord, puis crée le rendu (si nouveau) et la version en base :
 * un envoi interrompu ne laisse jamais de rendu vide dans la liste.
 */
export async function uploadReviewVersion({
  projectId,
  assetId,
  title,
  file,
  meId,
  onProgress,
}: {
  projectId: string;
  assetId: string | null;
  title: string;
  file: File;
  meId: string;
  onProgress: (ratio: number) => void;
}) {
  const supabase = createClient();
  const targetAssetId = assetId ?? crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const base = `${projectId}/${targetAssetId}/${versionId}`;
  const storagePath = `${base}/${storageSafeName(file.name)}`;

  // Envoi et lecture des métadonnées en parallèle
  const [info] = await Promise.all([
    readMediaInfo(file),
    uploadWithProgress(storagePath, file, onProgress).catch(() => {
      throw new Error("L'envoi du fichier a échoué. Vérifie ta connexion et réessaie.");
    }),
  ]);

  let thumbnailPath: string | null = null;
  if (info.thumbnail) {
    const { error } = await supabase.storage
      .from(REVIEWS_BUCKET)
      .upload(`${base}/thumb.jpg`, info.thumbnail, { contentType: "image/jpeg" });
    if (!error) thumbnailPath = `${base}/thumb.jpg`;
  }

  if (!assetId) {
    const { error } = await supabase
      .from("review_assets")
      .insert({ id: targetAssetId, project_id: projectId, title: title.slice(0, 200), created_by: meId });
    if (error) {
      await supabase.storage.from(REVIEWS_BUCKET).remove([storagePath, `${base}/thumb.jpg`]);
      throw new Error("Le rendu n'a pas pu être créé.");
    }
  }

  const { error } = await supabase.from("review_versions").insert({
    id: versionId,
    asset_id: targetAssetId,
    project_id: projectId,
    storage_path: storagePath,
    thumbnail_path: thumbnailPath,
    file_name: file.name.slice(0, 255) || "rendu",
    mime: file.type || "application/octet-stream",
    size: file.size,
    duration: info.duration,
    width: info.width,
    height: info.height,
    uploaded_by: meId,
  });
  if (error) {
    if (!assetId) await supabase.from("review_assets").delete().eq("id", targetAssetId);
    await supabase.storage.from(REVIEWS_BUCKET).remove([storagePath, `${base}/thumb.jpg`]);
    throw new Error("La version n'a pas pu être enregistrée.");
  }
  return { assetId: targetAssetId, versionId };
}
