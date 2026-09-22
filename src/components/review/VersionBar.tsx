"use client";

import { History, Save, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Transcription } from "@/types";

const TIMESTAMP_FORMAT = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

interface VersionBarProps {
  versions: Transcription[];
  selectedVersion: number | null;
  isDirty: boolean;
  isSaving: boolean;
  isApproving: boolean;
  canEdit: boolean;
  canApprove: boolean;
  onSelectVersion: (version: number) => void;
  onRestoreAsNew: () => void;
  onSave: () => void;
  onApprove: () => void;
}

export function VersionBar({
  versions,
  selectedVersion,
  isDirty,
  isSaving,
  isApproving,
  canEdit,
  canApprove,
  onSelectVersion,
  onRestoreAsNew,
  onSave,
  onApprove,
}: VersionBarProps) {
  const latestVersion = versions[0]?.version ?? null;
  const isViewingOld = selectedVersion !== null && selectedVersion !== latestVersion;

  return (
    <div className="flex flex-col gap-2 border-t border-border/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <History aria-hidden className="size-4 text-muted-foreground" />
        <Select
          value={selectedVersion !== null ? String(selectedVersion) : undefined}
          onValueChange={(value) => onSelectVersion(Number(value))}
        >
          <SelectTrigger size="sm" aria-label="Versão">
            <SelectValue placeholder="Selecionar versão" />
          </SelectTrigger>
          <SelectContent>
            {versions.map((version) => (
              <SelectItem key={version.version} value={String(version.version)}>
                v{version.version} — {TIMESTAMP_FORMAT.format(new Date(version.createdAt))} —{" "}
                {version.createdBy}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isDirty ? <span className="text-xs text-warning-foreground">Alterações não salvas</span> : null}

        {isViewingOld ? (
          <Button type="button" variant="outline" size="sm" onClick={onRestoreAsNew} className="ml-auto">
            Restaurar como nova versão
          </Button>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!canEdit || isViewingOld || isSaving}
          onClick={onSave}
        >
          <Save aria-hidden />
          {isSaving ? "Salvando..." : "Salvar versão"}
        </Button>
        <Button type="button" disabled={!canApprove || isViewingOld || isApproving} onClick={onApprove}>
          <ShieldCheck aria-hidden />
          {isApproving ? "Aprovando..." : "Aprovar"}
        </Button>
      </div>
    </div>
  );
}
