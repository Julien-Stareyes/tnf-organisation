"use client";

import { useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Dialog, Field, Select, TextArea, TextInput } from "@/components/ui/dialog";
import { LABEL_COLORS, type BoardCard, type BoardColumn, type BoardLabel } from "@/lib/board";
import { cn } from "@/lib/utils";
import type { Member } from "@/lib/types";

export function CardDialog({
  card,
  columns,
  labels,
  members,
  onClose,
  onSave,
  onDelete,
  onCreateLabel,
}: {
  card: BoardCard;
  columns: BoardColumn[];
  labels: BoardLabel[];
  members: Member[];
  onClose: () => void;
  onSave: (values: Partial<BoardCard>) => void;
  onDelete: () => void;
  onCreateLabel: (name: string, color: string) => Promise<BoardLabel | null>;
}) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? "");
  const [dueDate, setDueDate] = useState(card.due_date ?? "");
  const [columnId, setColumnId] = useState(card.column_id);
  const [labelIds, setLabelIds] = useState(card.label_ids);
  const [assigneeIds, setAssigneeIds] = useState(card.assignee_ids);
  const [newLabel, setNewLabel] = useState({ name: "", color: LABEL_COLORS[0] });

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  function save() {
    const trimmed = title.trim();
    if (!trimmed) return;
    const values: Partial<BoardCard> = {
      title: trimmed.slice(0, 300),
      description: description.trim() || null,
      due_date: dueDate || null,
      label_ids: labelIds,
      assignee_ids: assigneeIds,
    };
    // Changement de colonne : la carte passe en bas de la nouvelle colonne
    if (columnId !== card.column_id) {
      values.column_id = columnId;
      values.position = Date.now();
    }
    onSave(values);
    onClose();
  }

  async function addLabel() {
    const name = newLabel.name.trim();
    if (!name) return;
    const label = await onCreateLabel(name.slice(0, 40), newLabel.color);
    if (label) {
      setLabelIds((current) => [...current, label.id]);
      setNewLabel({ name: "", color: newLabel.color });
    }
  }

  return (
    <Dialog open onClose={onClose} title="Carte">
      <div className="space-y-4">
        <Field label="Titre">
          <TextInput value={title} maxLength={300} onChange={(event) => setTitle(event.target.value)} autoFocus />
        </Field>
        <Field label="Description">
          <TextArea
            rows={5}
            value={description}
            maxLength={10000}
            placeholder="Détails, liens, retours…"
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Colonne">
            <Select value={columnId} onChange={(event) => setColumnId(event.target.value)}>
              {columns.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Échéance">
            <TextInput type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </Field>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Étiquettes</p>
          <div className="flex flex-wrap gap-1.5">
            {labels.map((label) => {
              const active = labelIds.includes(label.id);
              return (
                <button
                  key={label.id}
                  type="button"
                  onClick={() => setLabelIds(toggle(labelIds, label.id))}
                  className={cn(
                    "flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-black/80 transition",
                    !active && "opacity-40 hover:opacity-70",
                  )}
                  style={{ backgroundColor: label.color }}
                >
                  {active && <Check className="size-3" />}
                  {label.name}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <TextInput
              value={newLabel.name}
              maxLength={40}
              placeholder="Nouvelle étiquette"
              onChange={(event) => setNewLabel({ ...newLabel, name: event.target.value })}
              onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), addLabel())}
              className="py-1 text-xs"
            />
            <div className="flex shrink-0 gap-1">
              {LABEL_COLORS.slice(0, 6).map((color) => (
                <button
                  key={color}
                  type="button"
                  title={color}
                  onClick={() => setNewLabel({ ...newLabel, color })}
                  className={cn("size-5 rounded", newLabel.color === color && "ring-2 ring-fg ring-offset-1 ring-offset-sidebar")}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <button type="button" onClick={addLabel} title="Créer l'étiquette" className="text-faint hover:text-fg">
              <Plus className="size-4" />
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Assigné à</p>
          <div className="flex flex-wrap gap-1.5">
            {members.map((member) => {
              const active = assigneeIds.includes(member.user_id);
              return (
                <button
                  key={member.user_id}
                  type="button"
                  onClick={() => setAssigneeIds(toggle(assigneeIds, member.user_id))}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs transition",
                    active ? "border-accent text-fg" : "border-line text-faint hover:text-fg",
                  )}
                >
                  <Avatar name={member.display_name} url={member.avatar_url} className="size-5" />
                  {member.display_name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-line pt-4">
          <button
            type="button"
            onClick={() => window.confirm("Supprimer cette carte ?") && onDelete()}
            className="flex items-center gap-1.5 text-sm text-danger hover:underline"
          >
            <Trash2 className="size-4" />
            Supprimer
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-muted hover:text-fg">
              Annuler
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!title.trim()}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:brightness-110 disabled:opacity-60"
            >
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
