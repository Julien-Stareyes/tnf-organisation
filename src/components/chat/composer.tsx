"use client";

import { useEffect, useRef, useState } from "react";
import { FileIcon, Paperclip, SendHorizontal, X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { encodeMentions, formatSize, MAX_ATTACHMENT_SIZE } from "@/lib/chat";
import { cn } from "@/lib/utils";

const MAX_LENGTH = 4000;
const MAX_FILES = 10;
const MENTION_QUERY_RE = /(^|\s)@([\p{L}\p{N}_.\- ]{0,30})$/u;

export type Mentionable = { id: string; name: string; avatar_url: string | null };

const EVERYONE: Mentionable = { id: "everyone", name: "everyone", avatar_url: null };

export function Composer({
  placeholder,
  mentionables,
  canMentionEveryone,
  canAttach,
  droppedFiles,
  onDroppedFilesTaken,
  onSend,
  onTyping,
  onError,
}: {
  placeholder: string;
  mentionables: Mentionable[];
  canMentionEveryone: boolean;
  canAttach: boolean;
  droppedFiles: File[];
  onDroppedFilesTaken: () => void;
  onSend: (content: string, files: File[]) => Promise<boolean>;
  onTyping: () => void;
  onError: (message: string) => void;
}) {
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [highlight, setHighlight] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addFiles(incoming: File[]) {
    const tooBig = incoming.filter((f) => f.size > MAX_ATTACHMENT_SIZE);
    if (tooBig.length) onError(`Fichier trop lourd (50 Mo max) : ${tooBig.map((f) => f.name).join(", ")}`);
    setFiles((current) => [...current, ...incoming.filter((f) => f.size <= MAX_ATTACHMENT_SIZE)].slice(0, MAX_FILES));
  }

  // Fichiers déposés sur la zone de chat
  useEffect(() => {
    if (!droppedFiles.length) return;
    addFiles(droppedFiles);
    onDroppedFilesTaken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [droppedFiles]);

  const suggestions = mention
    ? [...(canMentionEveryone ? [EVERYONE] : []), ...mentionables]
        .filter((m) => m.name.toLowerCase().includes(mention.query.trim().toLowerCase()))
        .slice(0, 8)
    : [];

  function resize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }

  function detectMention(text: string, caret: number) {
    const match = text.slice(0, caret).match(MENTION_QUERY_RE);
    if (!match) return setMention(null);
    setMention({ query: match[2], start: caret - match[2].length - 1 });
    setHighlight(0);
  }

  function pickMention(person: Mentionable) {
    if (!mention) return;
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? value.length;
    const insert = `@${person.name} `;
    const next = value.slice(0, mention.start) + insert + value.slice(caret);
    setValue(next);
    setMention(null);
    requestAnimationFrame(() => {
      const position = mention.start + insert.length;
      el?.focus();
      el?.setSelectionRange(position, position);
      resize();
    });
  }

  async function submit() {
    const content = encodeMentions(value.trim(), mentionables);
    if ((!content && !files.length) || sending) return;
    setSending(true);
    const ok = await onSend(content, files);
    setSending(false);
    if (ok) {
      setValue("");
      setFiles([]);
      requestAnimationFrame(resize);
    }
    textareaRef.current?.focus();
  }

  return (
    <div className="relative">
      {suggestions.length > 0 && (
        <ul className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-lg border border-line bg-sidebar py-1 shadow-2xl">
          <li className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">Membres</li>
          {suggestions.map((person, index) => (
            <li key={person.id}>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  pickMention(person);
                }}
                onMouseEnter={() => setHighlight(index)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
                  index === highlight ? "bg-hover text-fg" : "text-muted",
                )}
              >
                {person.id === "everyone" ? (
                  <span className="grid size-6 place-items-center rounded-full bg-accent/20 text-xs text-accent">@</span>
                ) : (
                  <Avatar name={person.name} url={person.avatar_url} className="size-6" />
                )}
                {person.id === "everyone" ? "@everyone — prévenir tout le salon" : person.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg bg-elevated">
        {files.length > 0 && (
          <ul className="flex flex-wrap gap-2 border-b border-line p-3">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-md bg-rail px-2.5 py-1.5 text-xs">
                <FileIcon className="size-4 text-faint" />
                <span className="max-w-48 truncate">{file.name}</span>
                <span className="text-faint">{formatSize(file.size)}</span>
                <button
                  type="button"
                  title="Retirer"
                  onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                  className="text-faint hover:text-danger"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-end gap-2 px-4 py-2.5">
          {canAttach && (
            <>
              <button
                type="button"
                title="Joindre des fichiers"
                onClick={() => fileInputRef.current?.click()}
                className="grid size-6 place-items-center text-muted hover:text-fg"
              >
                <Paperclip className="size-5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(event) => {
                  addFiles(Array.from(event.target.files ?? []));
                  event.target.value = "";
                }}
              />
            </>
          )}
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            maxLength={MAX_LENGTH}
            placeholder={placeholder}
            aria-label={placeholder}
            autoFocus
            onChange={(event) => {
              setValue(event.target.value);
              resize();
              detectMention(event.target.value, event.target.selectionStart);
              if (event.target.value) onTyping();
            }}
            onPaste={(event) => {
              if (!canAttach) return;
              const pasted = Array.from(event.clipboardData.files);
              if (pasted.length) {
                event.preventDefault();
                addFiles(pasted);
              }
            }}
            onKeyDown={(event) => {
              if (suggestions.length) {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  const step = event.key === "ArrowDown" ? 1 : -1;
                  setHighlight((h) => (h + step + suggestions.length) % suggestions.length);
                  return;
                }
                if (event.key === "Enter" || event.key === "Tab") {
                  event.preventDefault();
                  pickMention(suggestions[highlight]);
                  return;
                }
                if (event.key === "Escape") {
                  setMention(null);
                  return;
                }
              }
              // Entrée envoie, Maj+Entrée va à la ligne
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
            onBlur={() => setMention(null)}
            className="max-h-60 min-h-6 flex-1 resize-none bg-transparent text-[15px] leading-6 text-fg outline-none placeholder:text-faint"
          />
          <button
            type="button"
            onClick={submit}
            disabled={(!value.trim() && !files.length) || sending}
            title="Envoyer"
            className="grid size-6 place-items-center text-muted transition hover:text-accent disabled:opacity-30"
          >
            <SendHorizontal className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
