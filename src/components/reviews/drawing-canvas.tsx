"use client";

import { useEffect, useRef } from "react";
import type { Stroke } from "@/lib/reviews";

// Annotations dessinées par-dessus le rendu. Les points sont stockés en coordonnées 0..1
// pour rester alignés quelle que soit la taille d'affichage.

export function DrawingCanvas({
  width,
  height,
  strokes,
  editable,
  color,
  onChange,
}: {
  width: number;
  height: number;
  strokes: Stroke[];
  editable: boolean;
  color: string;
  onChange?: (strokes: Stroke[]) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const current = useRef<Stroke | null>(null);

  function paint(all: Stroke[]) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of all) {
      if (stroke.points.length === 0) continue;
      ctx.strokeStyle = stroke.color;
      // Épaisseur relative à la largeur affichée
      ctx.lineWidth = Math.max(1.5, stroke.width * width);
      ctx.beginPath();
      stroke.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * width, y * height) : ctx.lineTo(x * width, y * height)));
      if (stroke.points.length === 1) ctx.lineTo(stroke.points[0][0] * width + 0.1, stroke.points[0][1] * height);
      ctx.stroke();
    }
  }

  useEffect(() => {
    paint(strokes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, width, height]);

  function point(event: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const rect = event.currentTarget.getBoundingClientRect();
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    return [clamp((event.clientX - rect.left) / rect.width), clamp((event.clientY - rect.top) / rect.height)];
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className={editable ? "absolute inset-0 cursor-crosshair touch-none" : "pointer-events-none absolute inset-0"}
      onPointerDown={(event) => {
        if (!editable) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        current.current = { color, width: 0.004, points: [point(event)] };
        paint([...strokes, current.current]);
      }}
      onPointerMove={(event) => {
        if (!editable || !current.current) return;
        current.current.points.push(point(event));
        paint([...strokes, current.current]);
      }}
      onPointerUp={() => {
        if (!editable || !current.current) return;
        // Points arrondis : annotations plus légères en base
        const stroke = {
          ...current.current,
          points: current.current.points.map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4] as [number, number]),
        };
        current.current = null;
        onChange?.([...strokes, stroke]);
      }}
    />
  );
}
