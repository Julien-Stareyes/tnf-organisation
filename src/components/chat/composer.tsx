"use client";

import { useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";

const MAX_LENGTH = 4000;

export function Composer({
  placeholder,
  onSend,
  onTyping,
}: {
  placeholder: string;
  onSend: (content: string) => Promise<boolean>;
  onTyping: () => void;
}) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function resize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }

  async function submit() {
    const content = value.trim();
    if (!content || sending) return;
    setSending(true);
    const ok = await onSend(content);
    setSending(false);
    if (ok) {
      setValue("");
      requestAnimationFrame(resize);
    }
    textareaRef.current?.focus();
  }

  return (
    <div className="flex items-end gap-2 rounded-lg bg-elevated px-4 py-2.5">
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
          if (event.target.value) onTyping();
        }}
        onKeyDown={(event) => {
          // Entrée envoie, Maj+Entrée va à la ligne
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
        className="max-h-60 min-h-6 flex-1 resize-none bg-transparent text-[15px] leading-6 text-fg outline-none placeholder:text-faint"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!value.trim() || sending}
        title="Envoyer"
        className="grid size-6 place-items-center text-muted transition hover:text-accent disabled:opacity-30"
      >
        <SendHorizontal className="size-5" />
      </button>
    </div>
  );
}
