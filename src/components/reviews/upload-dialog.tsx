"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Film, Upload } from "lucide-react";
import { Dialog, Field, TextInput } from "@/components/ui/dialog";
import { formatSize } from "@/lib/chat";
import { MAX_REVIEW_UPLOAD_MB, uploadReviewVersion } from "./upload";

/** Nouveau rendu (assetId absent) ou nouvelle version d'un rendu existant */
export function UploadReviewDialog({
  projectId,
  assetId,
  meId,
  basePath,
  trigger,
}: {
  projectId: string;
  assetId?: string;
  meId: string;
  basePath: string;
  trigger: "primary" | "version";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(selected: File | undefined) {
    if (!selected) return;
    if (!selected.type.startsWith("video/") && !selected.type.startsWith("image/")) {
      return setError("Formats acceptés : vidéo (MP4 H.264 conseillé) ou image.");
    }
    if (selected.size > MAX_REVIEW_UPLOAD_MB * 1024 * 1024) {
      return setError(`Fichier trop lourd : ${MAX_REVIEW_UPLOAD_MB} Mo maximum.`);
    }
    setError(null);
    setFile(selected);
    if (!title) setTitle(selected.name.replace(/\.[^.]+$/, ""));
  }

  async function submit() {
    if (!file || (!assetId && !title.trim())) return;
    setError(null);
    setProgress(0);
    try {
      const result = await uploadReviewVersion({
        projectId,
        assetId: assetId ?? null,
        title: title.trim(),
        file,
        meId,
        onProgress: setProgress,
      });
      setOpen(false);
      setFile(null);
      setTitle("");
      router.push(`${basePath}/${result.assetId}?v=${result.versionId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setProgress(null);
    }
  }

  return (
    <>
      {trigger === "primary" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg hover:brightness-110"
        >
          <Upload className="size-4" />
          Nouveau rendu
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-md bg-elevated px-2.5 py-1 text-xs text-muted hover:text-fg"
        >
          <Upload className="size-3.5" />
          Nouvelle version
        </button>
      )}

      <Dialog
        open={open}
        onClose={() => progress === null && setOpen(false)}
        title={assetId ? "Nouvelle version" : "Nouveau rendu"}
        description={`Vidéo ou image, ${MAX_REVIEW_UPLOAD_MB} Mo max. Pour la vidéo, le MP4 (H.264) est lu partout.`}
      >
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              pick(event.dataTransfer.files[0]);
            }}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line px-4 py-8 text-sm text-muted hover:border-faint hover:text-fg"
          >
            <Film className="size-8 text-faint" />
            {file ? (
              <span>
                <span className="font-medium text-fg">{file.name}</span> · {formatSize(file.size)}
              </span>
            ) : (
              "Glisse un fichier ici ou clique pour choisir"
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="video/*,image/*"
            hidden
            onChange={(event) => {
              pick(event.target.files?.[0]);
              event.target.value = "";
            }}
          />

          {!assetId && (
            <Field label="Titre du rendu">
              <TextInput value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} placeholder="Ex. Logitech — plan 03 lookdev" />
            </Field>
          )}

          {progress !== null && (
            <div className="space-y-1">
              <div className="h-2 overflow-hidden rounded-full bg-rail">
                <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p className="text-xs text-faint">Envoi… {Math.round(progress * 100)} %</p>
            </div>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={progress !== null}
              onClick={() => setOpen(false)}
              className="rounded-md px-4 py-2 text-sm text-muted hover:text-fg disabled:opacity-40"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!file || progress !== null || (!assetId && !title.trim())}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:brightness-110 disabled:opacity-60"
            >
              Envoyer
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
