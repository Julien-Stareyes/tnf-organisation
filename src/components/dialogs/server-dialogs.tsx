"use client";

import { useState, useTransition } from "react";
import { Plus, Settings } from "lucide-react";
import { createServer, deleteServer, updateServer } from "@/app/actions/structure";
import {
  Dialog,
  Field,
  FormActions,
  FormError,
  IconButton,
  Select,
  TextInput,
  useDialogAction,
  type Controlled,
} from "@/components/ui/dialog";
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
      <IconButton title="Créer un pôle" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
      </IconButton>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Créer un pôle"
        description="Un pôle regroupe une équipe, avec ses salons généraux et ses projets."
      >
        <form action={formAction} className="space-y-4">
          <Field label="Nom du pôle">
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

export function ServerSettingsDialog({
  server,
  canDelete,
  ...controlled
}: { server: ServerSummary; canDelete: boolean } & Controlled) {
  const { open, setOpen, state, formAction } = useDialogAction(updateServer, controlled);
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
      {controlled.open === undefined && (
        <IconButton title="Paramètres du pôle" onClick={() => setOpen(true)}>
          <Settings className="size-4" />
        </IconButton>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="Paramètres du pôle">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={server.id} />
          <Field label="Nom du pôle">
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
              Supprimer le pôle
            </button>
          </div>
        )}
      </Dialog>
    </>
  );
}
