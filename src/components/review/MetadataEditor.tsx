"use client";

import { Plus, Trash2 } from "lucide-react";

import { UncertaintyBadge } from "@/components/review/UncertaintyHighlight";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MetadataEntity, MetadataEntityType } from "@/types";

const METADATA_TYPE_LABELS_PT_BR: Record<MetadataEntityType, string> = {
  person: "Pessoa",
  date: "Data",
  place: "Local",
  event: "Evento",
  kinship: "Parentesco",
  other: "Outro",
};

const METADATA_TYPES = Object.keys(METADATA_TYPE_LABELS_PT_BR) as MetadataEntityType[];

interface MetadataEditorProps {
  entities: MetadataEntity[];
  onChange: (entities: MetadataEntity[]) => void;
  readOnly?: boolean;
}

export function MetadataEditor({ entities, onChange, readOnly = false }: MetadataEditorProps) {
  function updateEntity(id: string, patch: Partial<MetadataEntity>) {
    onChange(entities.map((entity) => (entity.id === id ? { ...entity, ...patch } : entity)));
  }

  function removeEntity(id: string) {
    onChange(entities.filter((entity) => entity.id !== id));
  }

  function addEntity() {
    onChange([
      ...entities,
      { id: crypto.randomUUID(), type: "other", label: "", value: "", normalizedValue: null, uncertain: false },
    ]);
  }

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-1">
      {entities.length === 0 ? (
        <p className="px-2 text-sm text-muted-foreground">Nenhum item de metadado extraído.</p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {entities.map((entity) => (
          <li key={entity.id} className="glass-panel flex flex-col gap-2 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <Select
                value={entity.type}
                disabled={readOnly}
                onValueChange={(value) => updateEntity(entity.id, { type: value as MetadataEntityType })}
              >
                <SelectTrigger size="sm" aria-label="Tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METADATA_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {METADATA_TYPE_LABELS_PT_BR[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {entity.uncertain ? <UncertaintyBadge /> : null}

              <div className="ml-auto flex items-center gap-1">
                {!readOnly ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-pressed={Boolean(entity.uncertain)}
                    onClick={() => updateEntity(entity.id, { uncertain: !entity.uncertain })}
                  >
                    {entity.uncertain ? "Remover incerteza" : "Marcar como incerto"}
                  </Button>
                ) : null}
                {!readOnly ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remover item"
                    onClick={() => removeEntity(entity.id)}
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Rótulo
                <Input
                  value={entity.label}
                  readOnly={readOnly}
                  onChange={(event) => updateEntity(entity.id, { label: event.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Valor
                <Input
                  value={entity.value}
                  readOnly={readOnly}
                  onChange={(event) => updateEntity(entity.id, { value: event.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
                Valor normalizado (opcional)
                <Input
                  value={entity.normalizedValue ?? ""}
                  readOnly={readOnly}
                  onChange={(event) =>
                    updateEntity(entity.id, { normalizedValue: event.target.value || null })
                  }
                />
              </label>
            </div>
          </li>
        ))}
      </ul>

      {!readOnly ? (
        <Button type="button" variant="outline" size="sm" onClick={addEntity} className="self-start">
          <Plus aria-hidden />
          Adicionar item
        </Button>
      ) : null}
    </div>
  );
}
