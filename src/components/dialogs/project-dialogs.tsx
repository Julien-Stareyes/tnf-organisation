"use client";

import { Plus, Settings } from "lucide-react";
import { createProject, updateProject } from "@/app/actions/structure";
import { Dialog, Field, FormActions, FormError, IconButton, Select, TextInput, useDialogAction } from "@/components/ui/dialog";
import type { Project } from "@/lib/types";

const DEFAULT_COLORS = ["#00B8FC", "#FF5FA2", "#B08D57", "#D4FF3A", "#9B7BFF", "#FF7A3D"];

function ColorField({ defaultValue }: { defaultValue?: string | null }) {
  return (
    <Field label="Couleur">
      <TextInput
        type="color"
        name="color"
        defaultValue={defaultValue ?? DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)]}
        className="h-10 cursor-pointer p-1"
      />
    </Field>
  );
}

export function CreateProjectDialog({ serverId }: { serverId: string }) {
  const { open, setOpen, state, formAction } = useDialogAction(createProject);

  return (
    <>
      <IconButton title="Créer un projet" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
      </IconButton>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Créer un projet"
        description="Tu en deviens lead. Les salons sont créés selon le pôle du serveur."
      >
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="server_id" value={serverId} />
          <Field label="Nom du projet">
            <TextInput name="name" required maxLength={100} placeholder="Ex. Logitech G Pro" autoFocus />
          </Field>
          <Field label="Client">
            <TextInput name="client_name" maxLength={100} placeholder="Ex. Logitech" />
          </Field>
          <ColorField />
          <FormError state={state} />
          <FormActions onCancel={() => setOpen(false)} submitLabel="Créer le projet" />
        </form>
      </Dialog>
    </>
  );
}

export function ProjectSettingsDialog({ project }: { project: Project }) {
  const { open, setOpen, state, formAction } = useDialogAction(updateProject);

  return (
    <>
      <IconButton title="Paramètres du projet" onClick={() => setOpen(true)}>
        <Settings className="size-4" />
      </IconButton>
      <Dialog open={open} onClose={() => setOpen(false)} title="Paramètres du projet">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={project.id} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nom">
              <TextInput name="name" required maxLength={100} defaultValue={project.name} />
            </Field>
            <Field label="Client">
              <TextInput name="client_name" maxLength={100} defaultValue={project.client_name ?? ""} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ColorField defaultValue={project.color} />
            <Field label="Statut">
              <Select name="status" defaultValue={project.status}>
                <option value="active">En cours</option>
                <option value="delivered">Livré</option>
                <option value="archived">Archivé</option>
              </Select>
            </Field>
          </div>
          <FormError state={state} />
          <FormActions onCancel={() => setOpen(false)} submitLabel="Enregistrer" />
        </form>
      </Dialog>
    </>
  );
}
