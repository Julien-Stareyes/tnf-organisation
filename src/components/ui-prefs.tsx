"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

// Préférences d'affichage mémorisées dans le navigateur (liste des membres visible ou non)

const MEMBERS_KEY = "tnf-show-members";

const UiPrefsContext = createContext<{ showMembers: boolean; toggleMembers: () => void }>({
  showMembers: false,
  toggleMembers: () => {},
});

export const useUiPrefs = () => useContext(UiPrefsContext);

export function UiPrefsProvider({ children }: { children: React.ReactNode }) {
  const [showMembers, setShowMembers] = useState(false);

  useEffect(() => {
    try {
      setShowMembers(localStorage.getItem(MEMBERS_KEY) === "1");
    } catch {}
  }, []);

  function toggleMembers() {
    setShowMembers((current) => {
      try {
        localStorage.setItem(MEMBERS_KEY, current ? "0" : "1");
      } catch {}
      return !current;
    });
  }

  return <UiPrefsContext.Provider value={{ showMembers, toggleMembers }}>{children}</UiPrefsContext.Provider>;
}

export function MembersToggle() {
  const { showMembers, toggleMembers } = useUiPrefs();
  return (
    <button
      type="button"
      onClick={toggleMembers}
      title={showMembers ? "Masquer les membres" : "Afficher les membres"}
      aria-label={showMembers ? "Masquer les membres" : "Afficher les membres"}
      aria-pressed={showMembers}
      className={cn(
        "grid size-8 place-items-center rounded-md hover:bg-hover hover:text-fg",
        showMembers ? "bg-hover text-fg" : "text-muted",
      )}
    >
      <Users className="size-4" />
    </button>
  );
}
