"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PROCESSING_STATUS_LABELS_PT_BR, type Document, type ProcessingStatus } from "@/types";

const REVIEWABLE_STATUSES = new Set<ProcessingStatus>(["readyForReview", "inReview", "approved"]);

interface DocumentListProps {
  refreshKey?: number;
}

export function DocumentList({ refreshKey = 0 }: DocumentListProps) {
  const [items, setItems] = useState<Document[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const load = useCallback(async (cursor?: string, append = false) => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      const response = await fetch(`/api/documents?${params.toString()}`);
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error?.message ?? "Não foi possível carregar os documentos.");
        return;
      }
      const nextItems = (body.items ?? []) as Document[];
      setItems((prev) => (append ? [...prev, ...nextItems] : nextItems));
      setNextCursor(body.nextCursor);
    } catch {
      setError("Não foi possível carregar os documentos.");
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <section className="glass-panel flex flex-col gap-4 rounded-2xl p-6">
      <div className="flex items-center gap-2">
        <FileText aria-hidden className="size-5 text-primary" />
        <h2 className="text-lg font-semibold tracking-tight">Documentos</h2>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {!isLoading && !error && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum documento enviado ainda.</p>
      ) : null}

      {items.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {items.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2"
            >
              <div className="min-w-0 flex flex-col gap-0.5">
                <span className="truncate font-medium">{doc.title}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {doc.originalFileName}
                </span>
              </div>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs">
                {PROCESSING_STATUS_LABELS_PT_BR[doc.status]}
              </span>
              {REVIEWABLE_STATUSES.has(doc.status) ? (
                <Link
                  href={`/documents/${doc.id}/review`}
                  className="shrink-0 text-xs font-medium text-primary hover:underline"
                >
                  Revisar
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {nextCursor ? (
        <Button
          type="button"
          variant="outline"
          disabled={isLoadingMore}
          onClick={() => void load(nextCursor, true)}
        >
          {isLoadingMore ? "Carregando..." : "Carregar mais"}
        </Button>
      ) : null}
    </section>
  );
}
