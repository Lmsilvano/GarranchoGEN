"use client";

import { useState, type FormEvent } from "react";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { compressImage } from "@/lib/client/compressImage";
import type { Document } from "@/types";

const ACCEPT = "image/jpeg,image/png,image/webp,image/tiff,.tif,.tiff,.jpg,.jpeg,.png,.webp";

interface UploadPanelProps {
  onUploaded?: (document: Document) => void;
}

export function UploadPanel({ onUploaded }: UploadPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!file) {
      setError("Selecione uma imagem para enviar.");
      return;
    }

    setIsSubmitting(true);
    try {
      const compressed = await compressImage(file);
      const formData = new FormData();
      formData.append("file", compressed);
      if (title.trim()) {
        formData.append("title", title.trim());
      }

      const response = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error?.message ?? "Não foi possível enviar o documento.");
        return;
      }

      setFile(null);
      setTitle("");
      onUploaded?.(body.document as Document);
    } catch {
      setError("Não foi possível enviar o documento. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="glass-panel flex flex-col gap-4 rounded-2xl p-6"
      noValidate
    >
      <div className="flex items-center gap-2">
        <Upload aria-hidden className="size-5 text-primary" />
        <h2 className="text-lg font-semibold tracking-tight">Enviar documento</h2>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="document-file">Imagem</Label>
        <Input
          id="document-file"
          type="file"
          accept={ACCEPT}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setError(null);
          }}
        />
        <p className="text-xs text-muted-foreground">
          JPEG, PNG, WebP ou TIFF. Imagens grandes são redimensionadas antes do envio.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="document-title">Título (opcional)</Label>
        <Input
          id="document-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Ex.: Livro de batismos 1850"
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={isSubmitting || !file}>
        {isSubmitting ? "Enviando..." : "Enviar"}
      </Button>
    </form>
  );
}
