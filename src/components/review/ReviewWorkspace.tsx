"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard } from "lucide-react";
import type { Layout } from "react-resizable-panels";

import { ImageViewer, type ImageViewerHandle } from "@/components/review/ImageViewer";
import { MetadataEditor } from "@/components/review/MetadataEditor";
import { ReviewToast, type ReviewToastMessage } from "@/components/review/ReviewToast";
import { ShortcutsHelp } from "@/components/review/ShortcutsHelp";
import { StatusChip } from "@/components/review/StatusChip";
import { TranscriptionEditor } from "@/components/review/TranscriptionEditor";
import { VersionBar } from "@/components/review/VersionBar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { computeSpanProportion } from "@/lib/review/proportion-sync";
import { REVIEW_CONFLICT_MESSAGE } from "@/lib/review/errors";
import { matchReviewShortcut, shouldPreventDefault } from "@/lib/review/shortcuts";
import type {
  ApproveDocumentResponse,
  ClaimDocumentResponse,
  Document,
  MetadataEntity,
  ProcessingStatus,
  SaveTranscriptionResponse,
  Transcription,
  TranscriptionListResponse,
  UncertainSpan,
} from "@/types";

const PANEL_SPLIT_STORAGE_KEY = "review.panelSplit";
const DEFAULT_LAYOUT: Layout = { image: 55, editor: 45 };
const EDITABLE_STATUSES = new Set<ProcessingStatus>(["readyForReview", "inReview"]);
const VIEWABLE_STATUSES = new Set<ProcessingStatus>(["readyForReview", "inReview", "approved", "rejected"]);

type TabKey = "literal" | "modernizada" | "metadados";

interface TranscriptionDraft {
  literalTranscription: string;
  modernizedTranscription: string;
  structuredMetadata: MetadataEntity[];
  uncertainSpans: UncertainSpan[];
}

const EMPTY_DRAFT: TranscriptionDraft = {
  literalTranscription: "",
  modernizedTranscription: "",
  structuredMetadata: [],
  uncertainSpans: [],
};

function draftFromTranscription(transcription: Transcription): TranscriptionDraft {
  return {
    literalTranscription: transcription.literalTranscription,
    modernizedTranscription: transcription.modernizedTranscription,
    structuredMetadata: transcription.structuredMetadata,
    uncertainSpans: transcription.uncertainSpans,
  };
}

function readStoredLayout(): Layout {
  if (typeof window === "undefined") return DEFAULT_LAYOUT;
  try {
    const raw = window.localStorage.getItem(PANEL_SPLIT_STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<Layout>;
    if (typeof parsed.image === "number" && typeof parsed.editor === "number") {
      return { image: parsed.image, editor: parsed.editor };
    }
  } catch {
    // ignora storage malformado/bloqueado — usa a divisão padrão
  }
  return DEFAULT_LAYOUT;
}

interface ReviewWorkspaceProps {
  documentId: string;
}

export function ReviewWorkspace({ documentId }: ReviewWorkspaceProps) {
  const [document, setDocument] = useState<Document | null>(null);
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [draft, setDraft] = useState<TranscriptionDraft>(EMPTY_DRAFT);
  const [baseline, setBaseline] = useState<TranscriptionDraft>(EMPTY_DRAFT);
  const [activeTab, setActiveTab] = useState<TabKey>("literal");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [toast, setToast] = useState<ReviewToastMessage | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);

  const imageViewerRef = useRef<ImageViewerHandle | null>(null);
  const literalRef = useRef<HTMLTextAreaElement | null>(null);
  const modernizedRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingFocusRef = useRef<TabKey | null>(null);

  const [defaultLayout] = useState<Layout>(readStoredLayout);

  const latestVersion = transcriptions[0]?.version ?? null;
  const isViewingOld = selectedVersion !== null && selectedVersion !== latestVersion;
  const canEdit = document !== null && EDITABLE_STATUSES.has(document.status) && !isViewingOld;
  const canApprove = document !== null && document.status === "inReview" && !isViewingOld;
  const isDirty = JSON.stringify(draft) !== JSON.stringify(baseline);

  function showToast(tone: ReviewToastMessage["tone"], text: string) {
    setToast({ id: Date.now(), tone, text });
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const docResponse = await fetch(`/api/documents/${documentId}`);
        if (!docResponse.ok) {
          if (!cancelled) {
            setLoadError(
              docResponse.status === 404
                ? "Documento não encontrado."
                : "Não foi possível carregar o documento.",
            );
          }
          return;
        }
        let doc = (await docResponse.json()) as Document;

        if (doc.status === "readyForReview" || doc.status === "inReview") {
          const claimResponse = await fetch(`/api/documents/${documentId}/claim`, { method: "POST" });
          if (claimResponse.ok) {
            const claimBody = (await claimResponse.json()) as ClaimDocumentResponse;
            doc = claimBody.document;
          }
        }
        if (cancelled) return;
        setDocument(doc);

        const listResponse = await fetch(`/api/documents/${documentId}/transcriptions`);
        if (listResponse.ok) {
          const listBody = (await listResponse.json()) as TranscriptionListResponse;
          if (cancelled) return;
          setTranscriptions(listBody.transcriptions);
          const latest = listBody.transcriptions[0] ?? null;
          setSelectedVersion(latest?.version ?? null);
          const snapshot = latest ? draftFromTranscription(latest) : EMPTY_DRAFT;
          setDraft(snapshot);
          setBaseline(snapshot);
        }
      } catch {
        if (!cancelled) setLoadError("Não foi possível carregar o documento.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  useEffect(() => {
    const target = pendingFocusRef.current;
    if (!target) return;
    pendingFocusRef.current = null;
    const targetRef = target === "literal" ? literalRef : modernizedRef;

    // O Tabs.Content do Radix monta o painel recém-ativo um commit depois da
    // atualização de estado `activeTab` (efeito interno de bookkeeping do
    // Presence), então o ref ainda pode ser null nesta primeira passada —
    // tenta de novo por alguns frames de animação em vez de assumir que já
    // está anexado de forma síncrona.
    let cancelled = false;
    let attempts = 0;
    function tryFocus() {
      if (cancelled) return;
      if (targetRef.current) {
        targetRef.current.focus();
        return;
      }
      attempts += 1;
      if (attempts < 10) requestAnimationFrame(tryFocus);
    }
    requestAnimationFrame(tryFocus);

    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const performSave = useCallback(async (): Promise<boolean> => {
    if (!document) return false;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/documents/${document.id}/transcriptions/current`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...draft, expectedVersion: latestVersion }),
      });
      if (response.status === 409) {
        showToast("conflict", REVIEW_CONFLICT_MESSAGE);
        return false;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        showToast("conflict", body?.error?.message ?? "Não foi possível salvar a versão.");
        return false;
      }
      const body = (await response.json()) as SaveTranscriptionResponse;
      setTranscriptions((prev) => [body.transcription, ...prev]);
      setDocument(body.document);
      setSelectedVersion(body.transcription.version);
      const snapshot = draftFromTranscription(body.transcription);
      setDraft(snapshot);
      setBaseline(snapshot);
      showToast("success", "Versão salva.");
      return true;
    } catch {
      showToast("conflict", "Não foi possível salvar a versão.");
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [document, draft, latestVersion]);

  const performApprove = useCallback(
    async (expectedVersionOverride?: number | null): Promise<boolean> => {
      if (!document) return false;
      setIsApproving(true);
      try {
        const response = await fetch(`/api/documents/${document.id}/approve`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ expectedVersion: expectedVersionOverride ?? latestVersion }),
        });
        if (response.status === 409) {
          showToast("conflict", REVIEW_CONFLICT_MESSAGE);
          return false;
        }
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          showToast("conflict", body?.error?.message ?? "Não foi possível aprovar.");
          return false;
        }
        const body = (await response.json()) as ApproveDocumentResponse;
        setDocument(body.document);
        showToast("success", "Documento aprovado.");
        return true;
      } catch {
        showToast("conflict", "Não foi possível aprovar.");
        return false;
      } finally {
        setIsApproving(false);
      }
    },
    [document, latestVersion],
  );

  const handleApproveClick = useCallback(() => {
    if (!canApprove) return;
    if (isDirty) {
      setConfirmApproveOpen(true);
      return;
    }
    void performApprove();
  }, [canApprove, isDirty, performApprove]);

  function handleSelectVersion(version: number) {
    if (isDirty) return; // resolva as alterações não salvas (Salvar versão) antes de navegar pelo histórico
    const target = transcriptions.find((t) => t.version === version);
    if (!target) return;
    setSelectedVersion(version);
    const snapshot = draftFromTranscription(target);
    setDraft(snapshot);
    setBaseline(snapshot);
  }

  function handleRestoreAsNew() {
    const old = transcriptions.find((t) => t.version === selectedVersion);
    if (!old) return;
    setDraft(draftFromTranscription(old));
    setSelectedVersion(latestVersion);
  }

  function handleHighlightClick(span: UncertainSpan) {
    const fieldLength = draft[span.field].length;
    const proportion = computeSpanProportion(span, fieldLength);
    imageViewerRef.current?.panToProportion(proportion);
  }

  function handleAddReviewerFlag(span: UncertainSpan) {
    setDraft((prev) => ({ ...prev, uncertainSpans: [...prev.uncertainSpans, span] }));
  }

  function handleRemoveReviewerFlag(span: UncertainSpan) {
    setDraft((prev) => ({ ...prev, uncertainSpans: prev.uncertainSpans.filter((s) => s !== span) }));
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const action = matchReviewShortcut(event);
      if (!action) return;

      const target = event.target as HTMLElement | null;
      const isEditableTarget =
        target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement || Boolean(target?.isContentEditable);

      // Nunca engolir um "?" literal digitado dentro de um campo de texto.
      if (action === "help" && isEditableTarget) return;

      if (shouldPreventDefault(action)) event.preventDefault();

      switch (action) {
        case "approve":
          handleApproveClick();
          break;
        case "save":
          void performSave();
          break;
        case "zoomIn":
          imageViewerRef.current?.zoomIn();
          break;
        case "zoomOut":
          imageViewerRef.current?.zoomOut();
          break;
        case "zoomReset":
          imageViewerRef.current?.resetView();
          break;
        case "rotateCw":
          imageViewerRef.current?.rotateCw();
          break;
        case "rotateCcw":
          imageViewerRef.current?.rotateCcw();
          break;
        case "focusLiteral":
          pendingFocusRef.current = "literal";
          setActiveTab("literal");
          break;
        case "focusModernized":
          pendingFocusRef.current = "modernizada";
          setActiveTab("modernizada");
          break;
        case "focusMetadata":
          setActiveTab("metadados");
          break;
        case "dismiss":
          setShortcutsOpen(false);
          setConfirmApproveOpen(false);
          break;
        case "help":
          setShortcutsOpen(true);
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleApproveClick, performSave]);

  const editorSpans = useMemo(() => draft.uncertainSpans, [draft.uncertainSpans]);

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-sm font-semibold">{document?.title ?? "Revisão de documento"}</h1>
          {document ? <StatusChip status={document.status} /> : null}
        </div>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Atalhos" onClick={() => setShortcutsOpen(true)}>
          <Keyboard aria-hidden className="size-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Carregando documento...
          </div>
        ) : loadError ? (
          <div role="alert" className="flex h-full items-center justify-center text-sm text-destructive">
            {loadError}
          </div>
        ) : !document ? null : !VIEWABLE_STATUSES.has(document.status) ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <StatusChip status={document.status} />
            <p>Este documento ainda não está pronto para revisão.</p>
          </div>
        ) : (
          <ResizablePanelGroup
            orientation="horizontal"
            defaultLayout={defaultLayout}
            onLayoutChanged={(layout, meta) => {
              if (!meta.isUserInteraction) return;
              try {
                window.localStorage.setItem(PANEL_SPLIT_STORAGE_KEY, JSON.stringify(layout));
              } catch {
                // persistência best-effort apenas
              }
            }}
          >
            <ResizablePanel id="image" defaultSize={defaultLayout.image} minSize={240}>
              <ImageViewer
                ref={imageViewerRef}
                documentId={documentId}
                documentTitle={document.title}
                hasEnhanced={Boolean(document.enhancedPath)}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel id="editor" defaultSize={defaultLayout.editor} minSize={240}>
              <div className="flex h-full flex-col">
                <Tabs
                  value={activeTab}
                  onValueChange={(value) => setActiveTab(value as TabKey)}
                  className="flex min-h-0 flex-1 flex-col gap-2 p-3"
                >
                  <TabsList>
                    <TabsTrigger value="literal">Literal</TabsTrigger>
                    <TabsTrigger value="modernizada">Modernizada</TabsTrigger>
                    <TabsTrigger value="metadados">Metadados</TabsTrigger>
                  </TabsList>

                  <TabsContent value="literal" className="min-h-0 flex-1">
                    <TranscriptionEditor
                      field="literalTranscription"
                      value={draft.literalTranscription}
                      onChange={(value) => setDraft((prev) => ({ ...prev, literalTranscription: value }))}
                      spans={editorSpans}
                      onAddReviewerFlag={handleAddReviewerFlag}
                      onRemoveReviewerFlag={handleRemoveReviewerFlag}
                      onHighlightClick={handleHighlightClick}
                      readOnly={!canEdit}
                      textareaRef={literalRef}
                    />
                  </TabsContent>

                  <TabsContent value="modernizada" className="min-h-0 flex-1">
                    <TranscriptionEditor
                      field="modernizedTranscription"
                      value={draft.modernizedTranscription}
                      onChange={(value) => setDraft((prev) => ({ ...prev, modernizedTranscription: value }))}
                      spans={editorSpans}
                      onAddReviewerFlag={handleAddReviewerFlag}
                      onRemoveReviewerFlag={handleRemoveReviewerFlag}
                      onHighlightClick={handleHighlightClick}
                      readOnly={!canEdit}
                      textareaRef={modernizedRef}
                    />
                  </TabsContent>

                  <TabsContent value="metadados" className="min-h-0 flex-1">
                    <MetadataEditor
                      entities={draft.structuredMetadata}
                      onChange={(entities) => setDraft((prev) => ({ ...prev, structuredMetadata: entities }))}
                      readOnly={!canEdit}
                    />
                  </TabsContent>
                </Tabs>

                <VersionBar
                  versions={transcriptions}
                  selectedVersion={selectedVersion}
                  isDirty={isDirty}
                  isSaving={isSaving}
                  isApproving={isApproving}
                  canEdit={canEdit}
                  canApprove={canApprove}
                  onSelectVersion={handleSelectVersion}
                  onRestoreAsNew={handleRestoreAsNew}
                  onSave={() => void performSave()}
                  onApprove={handleApproveClick}
                />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>

      <ShortcutsHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      <Dialog open={confirmApproveOpen} onOpenChange={setConfirmApproveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Alterações não salvas</DialogTitle>
            <DialogDescription>
              Há alterações não salvas nesta versão. Deseja salvar antes de aprovar, ou descartá-las?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setConfirmApproveOpen(false);
                setDraft(baseline);
                void performApprove();
              }}
            >
              Descartar e aprovar
            </Button>
            <Button
              type="button"
              onClick={async () => {
                setConfirmApproveOpen(false);
                const saved = await performSave();
                if (saved) void performApprove();
              }}
            >
              Salvar e aprovar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReviewToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
