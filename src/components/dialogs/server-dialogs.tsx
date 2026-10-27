"use client";

import { useState, useTransition } from "react";
import { Plus, Settings } from "lucide-react";
import { createServer, deleteServer, updateServer } from "@/app/actions/structure";
import { Dialog, Field, FormActions, FormError, IconButton, Select, TextInput, useDialogAction } from "@/components/ui/dialog";
import type { ServerPole, ServerSummary } from "@/lib/types";

const POLES: { value: ServerPole; label: string }[] = [
  { value: "general", label: "Général" },
  { value: "cgi", label: "CGI / VFX" },
  { value: "ue5", label: "Unreal Engine / Pixel Streaming" },
  { value: "webgl", label: "WebGL" },
];

function PoleSelect({ defaultValue }: { defaultValue?: ServerPole }) {
  return (
    <Field label="Pôle" hint="Détermine les salons créés automatiquement dans chaque nouveau projet.">
      <Select name="pole" defaultValue={defaultValue ?? "general"}>
        {POLES.map((pole) => (
          <option key={pole.value} value={pole.value}>
            {pole.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function CreateServerDialog() {
  const { open, setOpen, state, formAction } = useDialogAction(createServer);

  return (
    <>
      <button
        type="button"
        title="Créer un serveur"
        onClick={() => setOpen(true)}
        className="grid size-12 place-items-center rounded-3xl bg-elevated text-online transition-all hover:rounded-2xl hover:bg-online hover:text-rail"
      >
        <Plus className="size-6" />
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Créer un serveur"
        description="Un serveur regroupe un pôle ou une équipe, avec ses salons et ses projets."
      >
        <form action={formAction} className="space-y-4">
          <Field label="Nom du serveur">
            <TextInput name="name" required maxLength={100} placeholder="Ex. CGI / VFX" autoFocus />
          </Field>
          <PoleSelect />
          <FormError state={state} />
          <FormActions onCancel={() => setOpen(false)} submitLabel="Créer" />
        </form>
      </Dialog>
    </>
  );
}

export function ServerSettingsDialog({ server, canDelete }: { server: ServerSummary; canDelete: boolean }) {
  const { open, setOpen, state, formAction } = useDialogAction(updateServer);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();

  function confirmDelete() {
    if (!window.confirm(`Supprimer définitivement « ${server.name} », ses projets, salons et messages ?`)) return;
    startDelete(async () => {
      const result = await deleteServer(server.id);
      if (result?.error) setDeleteError(result.error);
    });
  }

  return (
    <>
      <IconButton title="Paramètres du serveur" onClick={() => setOpen(true)}>
        <Settings className="size-4" />
      </IconButton>
      <Dialog open={open} onClose={() => setOpen(false)} title="Paramètres du serveur">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={server.id} />
          <Field label="Nom du serveur">
            <TextInput name="name" required maxLength={100} defaultValue={server.name} />
          </Field>
          <PoleSelect defaultValue={server.pole} />
          <FormError state={state} />
          <FormActions onCancel={() => setOpen(false)} submitLabel="Enregistrer" />
        </form>
        {canDelete && (
          <div className="mt-6 border-t border-line pt-4">
            {deleteError && <p className="mb-2 text-sm text-danger">{deleteError}</p>}
            <button
              type="button"
              onClick={confirmDelete}
              disabled={deleting}
              className="text-sm font-medium text-danger hover:underline disabled:opacity-60"
            >
              Supprimer le serveur
            </button>
          </div>
        )}
      </Dialog>
    </>
  );
}
