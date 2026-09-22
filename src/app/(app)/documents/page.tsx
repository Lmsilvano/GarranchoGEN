"use client";

import { useState } from "react";
import { ScrollText } from "lucide-react";

import { DocumentList } from "@/components/documents/DocumentList";
import { UploadPanel } from "@/components/documents/UploadPanel";

export default function DocumentsPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-8">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <ScrollText aria-hidden className="size-6 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">Documentos</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Envie imagens de documentos históricos para processamento.
        </p>
      </header>

      <UploadPanel onUploaded={() => setRefreshKey((n) => n + 1)} />
      <DocumentList refreshKey={refreshKey} />
    </main>
  );
}
