"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { ATTACHMENT_COLUMNS, ATTACHMENTS_BUCKET, storageSafeName, type ChatAttachment } from "@/lib/chat";

/** URLs signées (1 h) des fichiers du bucket privé, demandées par lots */
export function useSignedUrls(paths: string[]) {
  const supabase = useMemo(() => createClient(), []);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const requested = useRef(new Set<string>());
  const key = paths.join("|");

  useEffect(() => {
    const missing = key.split("|").filter((path) => path && !requested.current.has(path));
    if (!missing.length) return;
    missing.forEach((path) => requested.current.add(path));
    supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .createSignedUrls(missing, 3600)
      .then(({ data }) => {
        if (!data) return;
        setUrls((current) => ({
          ...current,
          ...Object.fromEntries(data.flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : []))),
        }));
      });
  }, [supabase, key]);

  return urls;
}

async function imageSize(file: File) {
  if (!file.type.startsWith("image/")) return { width: null, height: null };
  try {
    const bitmap = await createImageBitmap(file);
    return { width: bitmap.width, height: bitmap.height };
  } catch {
    return { width: null, height: null };
  }
}

/** Envoie les fichiers d'un message puis enregistre les pièces jointes ; null pour chaque échec */
export function uploadMessageFiles(supabase: SupabaseClient, channelId: string, messageId: string, files: File[]) {
  return Promise.all(
    files.map(async (file) => {
      const path = `${channelId}/${messageId}/${crypto.randomUUID().slice(0, 8)}-${storageSafeName(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (uploadError) return null;
      const { width, height } = await imageSize(file);
      const { data } = await supabase
        .from("attachments")
        .insert({
          message_id: messageId,
          channel_id: channelId,
          storage_path: path,
          name: file.name.slice(0, 255) || "fichier",
          mime: file.type || "application/octet-stream",
          size: file.size,
          width,
          height,
        })
        .select(ATTACHMENT_COLUMNS)
        .single();
      return data as ChatAttachment | null;
    }),
  );
}

/** Supprime les fichiers d'un message (avant de supprimer le message lui-même) */
export async function removeMessageFiles(supabase: SupabaseClient, attachments: ChatAttachment[]) {
  if (attachments.length) {
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove(attachments.map((a) => a.storage_path));
  }
}
