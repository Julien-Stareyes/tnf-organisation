// Kanban : types partagés entre le serveur et le navigateur

export type BoardColumn = {
  id: string;
  project_id: string;
  name: string;
  color: string | null;
  position: number;
};

export type BoardLabel = {
  id: string;
  project_id: string;
  name: string;
  color: string;
};

export type BoardCard = {
  id: string;
  project_id: string;
  column_id: string;
  title: string;
  description: string | null;
  position: number;
  due_date: string | null;
  label_ids: string[];
  assignee_ids: string[];
  created_at: string;
};

export const CARD_COLUMNS =
  "id, project_id, column_id, title, description, position, due_date, label_ids, assignee_ids, created_at";

export const LABEL_COLORS = ["#f87168", "#fea362", "#f5cd47", "#4bce97", "#6cc3e0", "#579dff", "#9f8fef", "#e774bb", "#8590a2"];

const STEP = 1024;

/** Position entre deux voisins (ou en tête / en fin de liste). */
export function positionBetween(before?: number, after?: number) {
  if (before === undefined && after === undefined) return STEP;
  if (before === undefined) return after! - STEP;
  if (after === undefined) return before + STEP;
  return (before + after) / 2;
}

export function byPosition<T extends { position: number }>(a: T, b: T) {
  return a.position - b.position;
}

/** Échéance au format "12 nov." (date seule, sans fuseau) */
export function formatDue(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(year, month - 1, day));
}

export function isOverdue(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const due = new Date(year, month - 1, day, 23, 59, 59);
  return due.getTime() < Date.now();
}
