"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  byPosition,
  CARD_COLUMNS,
  positionBetween,
  type BoardCard,
  type BoardColumn,
  type BoardLabel,
} from "@/lib/board";
import type { Member } from "@/lib/types";
import { BoardCardView } from "./board-card";
import { BoardColumnView } from "./board-column";
import { CardDialog } from "./card-dialog";

type Items = Record<string, string[]>;

function upsertById<T extends { id: string }>(list: T[], item: T) {
  const index = list.findIndex((x) => x.id === item.id);
  if (index < 0) return [...list, item];
  const next = [...list];
  next[index] = item;
  return next;
}

export function KanbanBoard({
  projectId,
  initialColumns,
  initialCards,
  initialLabels,
  members,
  meId,
  canManageColumns,
  initialOpenCardId,
}: {
  /** Carte à ouvrir directement (lien depuis une notification) */
  initialOpenCardId?: string;
  projectId: string;
  initialColumns: BoardColumn[];
  initialCards: BoardCard[];
  initialLabels: BoardLabel[];
  members: Member[];
  meId: string;
  canManageColumns: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [columns, setColumns] = useState(initialColumns);
  const [cards, setCards] = useState(initialCards);
  const [labels, setLabels] = useState(initialLabels);
  const [dragItems, setDragItems] = useState<Items | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(initialOpenCardId ?? null);
  const [error, setError] = useState<string | null>(null);

  const sortedColumns = useMemo(() => [...columns].sort(byPosition), [columns]);
  const derivedItems = useMemo(() => {
    const items: Items = Object.fromEntries(sortedColumns.map((c) => [c.id, [] as string[]]));
    [...cards].sort(byPosition).forEach((card) => items[card.column_id]?.push(card.id));
    return items;
  }, [sortedColumns, cards]);
  const items = dragItems ?? derivedItems;
  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  // ─── Temps réel ───────────────────────────────────────────────────────────
  useEffect(() => {
    const filter = `project_id=eq.${projectId}`;
    const channel = supabase
      .channel(`board:${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "board_cards", filter }, ({ eventType, new: row }) => {
        if (eventType !== "DELETE") setCards((current) => upsertById(current, row as BoardCard));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "board_columns", filter }, ({ eventType, new: row }) => {
        if (eventType !== "DELETE") setColumns((current) => upsertById(current, row as BoardColumn));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "board_labels", filter }, ({ eventType, new: row }) => {
        if (eventType !== "DELETE") setLabels((current) => upsertById(current, row as BoardLabel));
      })
      // Les suppressions ne sont pas filtrables : on ne reçoit que l'id
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "board_cards" }, ({ old }) => {
        setCards((current) => current.filter((c) => c.id !== (old as { id: string }).id));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "board_columns" }, ({ old }) => {
        const id = (old as { id: string }).id;
        setColumns((current) => current.filter((c) => c.id !== id));
        setCards((current) => current.filter((c) => c.column_id !== id));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "board_labels" }, ({ old }) => {
        setLabels((current) => current.filter((l) => l.id !== (old as { id: string }).id));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, projectId]);

  const fail = useCallback((message: string) => setError(message), []);

  // ─── Cartes ───────────────────────────────────────────────────────────────
  const addCard = useCallback(
    async (columnId: string, title: string) => {
      const last = cards.filter((c) => c.column_id === columnId).sort(byPosition).at(-1);
      const { data, error: insertError } = await supabase
        .from("board_cards")
        .insert({ project_id: projectId, column_id: columnId, title, position: positionBetween(last?.position), created_by: meId })
        .select(CARD_COLUMNS)
        .single();
      if (insertError) return fail("La carte n'a pas pu être créée.");
      setCards((current) => upsertById(current, data as BoardCard));
    },
    [supabase, projectId, meId, cards, fail],
  );

  const updateCard = useCallback(
    async (id: string, values: Partial<BoardCard>) => {
      const previous = cards;
      setCards((current) => current.map((c) => (c.id === id ? { ...c, ...values } : c)));
      const { error: updateError } = await supabase.from("board_cards").update(values).eq("id", id);
      if (updateError) {
        setCards(previous);
        fail("La modification n'a pas pu être enregistrée.");
      }
    },
    [supabase, cards, fail],
  );

  const deleteCard = useCallback(
    async (id: string) => {
      setCards((current) => current.filter((c) => c.id !== id));
      const { error: deleteError } = await supabase.from("board_cards").delete().eq("id", id);
      if (deleteError) fail("La carte n'a pas pu être supprimée.");
    },
    [supabase, fail],
  );

  // ─── Colonnes ─────────────────────────────────────────────────────────────
  const addColumn = useCallback(async () => {
    const name = window.prompt("Nom de la colonne");
    if (!name?.trim()) return;
    const { data, error: insertError } = await supabase
      .from("board_columns")
      .insert({ project_id: projectId, name: name.trim().slice(0, 60), position: positionBetween(sortedColumns.at(-1)?.position) })
      .select("id, project_id, name, color, position")
      .single();
    if (insertError) return fail("La colonne n'a pas pu être créée.");
    setColumns((current) => upsertById(current, data as BoardColumn));
  }, [supabase, projectId, sortedColumns, fail]);

  const updateColumn = useCallback(
    async (id: string, values: Partial<BoardColumn>) => {
      setColumns((current) => current.map((c) => (c.id === id ? { ...c, ...values } : c)));
      const { error: updateError } = await supabase.from("board_columns").update(values).eq("id", id);
      if (updateError) fail("La colonne n'a pas pu être modifiée.");
    },
    [supabase, fail],
  );

  const moveColumn = useCallback(
    (id: string, direction: -1 | 1) => {
      const index = sortedColumns.findIndex((c) => c.id === id);
      const target = index + direction;
      if (target < 0 || target >= sortedColumns.length) return;
      const others = sortedColumns.filter((c) => c.id !== id);
      const before = others[target - 1]?.position;
      const after = others[target]?.position;
      updateColumn(id, { position: positionBetween(before, after) });
    },
    [sortedColumns, updateColumn],
  );

  const deleteColumn = useCallback(
    async (id: string) => {
      const column = columns.find((c) => c.id === id);
      const count = cards.filter((c) => c.column_id === id).length;
      if (!window.confirm(`Supprimer la colonne « ${column?.name} »${count ? ` et ses ${count} cartes` : ""} ?`)) return;
      setColumns((current) => current.filter((c) => c.id !== id));
      setCards((current) => current.filter((c) => c.column_id !== id));
      const { error: deleteError } = await supabase.from("board_columns").delete().eq("id", id);
      if (deleteError) fail("La colonne n'a pas pu être supprimée.");
    },
    [supabase, columns, cards, fail],
  );

  // ─── Étiquettes ───────────────────────────────────────────────────────────
  const createLabel = useCallback(
    async (name: string, color: string) => {
      const { data, error: insertError } = await supabase
        .from("board_labels")
        .insert({ project_id: projectId, name, color })
        .select("id, project_id, name, color")
        .single();
      if (insertError) {
        fail("L'étiquette n'a pas pu être créée.");
        return null;
      }
      setLabels((current) => upsertById(current, data as BoardLabel));
      return data as BoardLabel;
    },
    [supabase, projectId, fail],
  );

  // ─── Glisser-déposer ──────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findContainer = (id: string, source: Items) =>
    id in source ? id : Object.keys(source).find((key) => source[key].includes(id));

  function onDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
    setDragItems(derivedItems);
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over || !dragItems) return;
    const activeKey = String(active.id);
    const overKey = String(over.id);
    const from = findContainer(activeKey, dragItems);
    const to = findContainer(overKey, dragItems);
    if (!from || !to || from === to) return;

    setDragItems((prev) => {
      if (!prev) return prev;
      const target = prev[to];
      const overIndex = target.indexOf(overKey);
      const index = overKey in prev || overIndex < 0 ? target.length : overIndex;
      return {
        ...prev,
        [from]: prev[from].filter((id) => id !== activeKey),
        [to]: [...target.slice(0, index), activeKey, ...target.slice(index)],
      };
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const current = dragItems;
    setActiveId(null);
    setDragItems(null);
    if (!over || !current) return;

    const activeKey = String(active.id);
    const overKey = String(over.id);
    const columnId = findContainer(activeKey, current);
    if (!columnId) return;

    let list = current[columnId];
    if (findContainer(overKey, current) === columnId && !(overKey in current)) {
      list = arrayMove(list, list.indexOf(activeKey), list.indexOf(overKey));
    }
    const index = list.indexOf(activeKey);
    const before = cardById.get(list[index - 1])?.position;
    const after = cardById.get(list[index + 1])?.position;
    const card = cardById.get(activeKey);
    if (!card) return;

    const position = positionBetween(before, after);
    if (card.column_id === columnId && card.position === position) return;
    updateCard(activeKey, { column_id: columnId, position });
  }

  const activeCard = activeId ? cardById.get(activeId) : null;
  const openCard = openCardId ? cardById.get(openCardId) : null;
  const memberById = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);
  const labelById = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error && (
        <button type="button" onClick={() => setError(null)} className="mx-4 mt-3 text-left text-sm text-danger">
          {error} (fermer)
        </button>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setDragItems(null);
        }}
      >
        <div className="flex min-h-0 flex-1 items-start gap-3 overflow-x-auto p-4">
          {sortedColumns.map((column, index) => (
            <BoardColumnView
              key={column.id}
              column={column}
              cardIds={items[column.id] ?? []}
              cardById={cardById}
              labelById={labelById}
              memberById={memberById}
              canManage={canManageColumns}
              isFirst={index === 0}
              isLast={index === sortedColumns.length - 1}
              onOpenCard={setOpenCardId}
              onAddCard={addCard}
              onRename={(name) => updateColumn(column.id, { name })}
              onMove={(direction) => moveColumn(column.id, direction)}
              onDelete={() => deleteColumn(column.id)}
            />
          ))}
          {canManageColumns && (
            <button
              type="button"
              onClick={addColumn}
              className="flex w-72 shrink-0 items-center gap-2 rounded-xl border border-dashed border-line px-3 py-3 text-sm text-faint hover:border-faint hover:text-fg"
            >
              <Plus className="size-4" />
              Ajouter une colonne
            </button>
          )}
        </div>
        <DragOverlay>
          {activeCard && (
            <BoardCardView card={activeCard} labelById={labelById} memberById={memberById} overlay />
          )}
        </DragOverlay>
      </DndContext>

      {openCard && (
        <CardDialog
          key={openCard.id}
          card={openCard}
          columns={sortedColumns}
          labels={labels}
          members={members}
          onClose={() => setOpenCardId(null)}
          onSave={(values) => updateCard(openCard.id, values)}
          onDelete={() => {
            setOpenCardId(null);
            deleteCard(openCard.id);
          }}
          onCreateLabel={createLabel}
        />
      )}
    </div>
  );
}
