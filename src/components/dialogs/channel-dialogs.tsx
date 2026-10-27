"use client";

import { useState, useTransition } from "react";
import { FolderPlus, Plus, Settings } from "lucide-react";
import { createCategory, createChannel, deleteChannel, updateChannel } from "@/app/actions/structure";
import {
  Dialog,
  Field,
  FormActions,
  FormError,
  IconButton,
  Select,
  TextArea,
  TextInput,
  useDialogAction,
} from "@/components/ui/dialog";
import type { Category, Channel } from "@/lib/types";

type Scope = { serverId: string; projectId: string | null };

function ScopeInputs({ serverId, projectId }: Scope) {
  return (
    <>
      <input type="hidden" name="server_id" value={serverId} />
      <input type="hidden" name="project_id" value={projectId ?? ""} />
    </>
  );
}

function CategorySelect({ categories, defaultValue }: { categories: Category[]; defaultValue?: string | null }) {
  return (
    <Field label="Catégorie">
      <Select name="category_id" defaultValue={defaultValue ?? ""}>
        <option value="">Sans catégorie</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function TypeSelect({ defaultValue }: { defaultValue?: Channel["type"] }) {
  return (
    <Field label="Type">
      <Select name="type" defaultValue={defaultValue ?? "text"}>
        <option value="text"># Texte</option>
        <option value="announcement">📣 Annonces</option>
      </Select>
    </Field>
  );
}

export function CreateChannelDialog({
  scope,
  categories,
  defaultCategoryId,
  variant = "icon",
}: {
  scope: Scope;
  categories: Category[];
  defaultCategoryId?: string | null;
  variant?: "icon" | "link";
}) {
  const { open, setOpen, state, formAction } = useDialogAction(createChannel);

  return (
    <>
      {variant === "icon" ? (
        <IconButton title="Créer un salon" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
        </IconButton>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-faint hover:bg-hover/60 hover:text-fg"
        >
          <Plus className="size-4" />
          Nouveau salon
        </button>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="Créer un salon">
        <form action={formAction} className="space-y-4">
          <ScopeInputs {...scope} />
          <Field label="Nom du salon" hint="Minuscules et tirets, comme sur Discord.">
            <TextInput name="name" required maxLength={100} placeholder="nouveau-salon" autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <TypeSelect />
            <CategorySelect categories={categories} defaultValue={defaultCategoryId} />
          </div>
          <Field label="Sujet">
            <TextArea name="topic" maxLength={1024} placeholder="À quoi sert ce salon ?" />
          </Field>
          <FormError state={state} />
          <FormActions onCancel={() => setOpen(false)} submitLabel="Créer le salon" />
        </form>
      </Dialog>
    </>
  );
}

export function CreateCategoryDialog({ scope }: { scope: Scope }) {
  const { open, setOpen, state, formAction } = useDialogAction(createCategory);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-faint hover:bg-hover/60 hover:text-fg"
      >
        <FolderPlus className="size-4" />
        Nouvelle catégorie
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Créer une catégorie">
        <form action={formAction} className="space-y-4">
          <ScopeInputs {...scope} />
          <Field label="Nom de la catégorie">
            <TextInput name="name" required maxLength={100} placeholder="Ex. Production" autoFocus />
          </Field>
          <FormError state={state} />
          <FormActions onCancel={() => setOpen(false)} submitLabel="Créer" />
        </form>
      </Dialog>
    </>
  );
}

export function ChannelSettingsDialog({
  channel,
  categories,
  afterDeleteHref,
}: {
  channel: Channel;
  categories: Category[];
  afterDeleteHref: string;
}) {
  const { open, setOpen, state, formAction } = useDialogAction(updateChannel);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();

  function confirmDelete() {
    if (!window.confirm(`Supprimer #${channel.name} et tous ses messages ?`)) return;
    startDelete(async () => {
      const result = await deleteChannel(channel.id, afterDeleteHref);
      if (result?.error) setDeleteError(result.error);
    });
  }

  return (
    <>
      <IconButton title="Paramètres du salon" onClick={() => setOpen(true)} className="size-8">
        <Settings className="size-4" />
      </IconButton>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Paramètres de #${channel.name}`}>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={channel.id} />
          <Field label="Nom du salon">
            <TextInput name="name" required maxLength={100} defaultValue={channel.name} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <TypeSelect defaultValue={channel.type} />
            <CategorySelect categories={categories} defaultValue={channel.category_id} />
          </div>
          <Field label="Sujet">
            <TextArea name="topic" maxLength={1024} defaultValue={channel.topic ?? ""} />
          </Field>
          <Field label="Mode lent" hint="Délai minimum entre deux messages d'une même personne.">
            <Select name="slowmode_seconds" defaultValue={String(channel.slowmode_seconds)}>
              <option value="0">Désactivé</option>
              <option value="5">5 secondes</option>
              <option value="30">30 secondes</option>
              <option value="60">1 minute</option>
              <option value="300">5 minutes</option>
              <option value="3600">1 heure</option>
            </Select>
          </Field>
          <FormError state={state} />
          <FormActions onCancel={() => setOpen(false)} submitLabel="Enregistrer" />
        </form>
        <div className="mt-6 border-t border-line pt-4">
          {deleteError && <p className="mb-2 text-sm text-danger">{deleteError}</p>}
          <button
            type="button"
            onClick={confirmDelete}
            disabled={deleting}
            className="text-sm font-medium text-danger hover:underline disabled:opacity-60"
          >
            Supprimer le salon
          </button>
        </div>
      </Dialog>
    </>
  );
}
