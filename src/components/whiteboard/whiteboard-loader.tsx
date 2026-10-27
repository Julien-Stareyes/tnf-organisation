"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// Excalidraw a besoin du navigateur (canvas, window) : pas de rendu serveur
export const WhiteboardLoader = dynamic(() => import("./whiteboard"), {
  ssr: false,
  loading: () => (
    <div className="grid flex-1 place-items-center text-faint">
      <Loader2 className="size-6 animate-spin" />
    </div>
  ),
});
