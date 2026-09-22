"use client";

import { useRef } from "react";
import { Flag, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HighlightedText } from "@/components/review/UncertaintyHighlight";
import { findSpanAtOffset } from "@/lib/review/spans";
import { cn } from "@/lib/utils";
import type { UncertainSpan, UncertainSpanField } from "@/types";

/**
 * Um <textarea> real (undo/redo nativo, seleção, cursor, a11y) empilhado sobre um
 * <div> overlay de mesma métrica que pinta os glifos visíveis com trechos <mark>
 * destacados. O texto do textarea é transparente — só o cursor aparece — para que
 * as cores do overlay apareçam por trás. font-mono mantém as duas camadas alinhadas.
 * Clicar/selecionar dentro de um trecho destacado é detectado via selectionStart
 * nativo do textarea, sem precisar de um alvo de clique separado.
 */
const SHARED_TEXT_CLASSES =
  "h-full w-full resize-none whitespace-pre-wrap break-words rounded-lg p-3 font-mono text-sm leading-relaxed";

interface TranscriptionEditorProps {
  field: UncertainSpanField;
  value: string;
  onChange: (value: string) => void;
  spans: UncertainSpan[];
  onAddReviewerFlag: (span: UncertainSpan) => void;
  onRemoveReviewerFlag: (span: UncertainSpan) => void;
  onHighlightClick: (span: UncertainSpan) => void;
  readOnly?: boolean;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function TranscriptionEditor({
  field,
  value,
  onChange,
  spans,
  onAddReviewerFlag,
  onRemoveReviewerFlag,
  onHighlightClick,
  readOnly = false,
  textareaRef: externalTextareaRef,
}: TranscriptionEditorProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const internalTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const textareaRef = externalTextareaRef ?? internalTextareaRef;

  const fieldSpans = spans.filter((span) => span.field === field);
  const reviewerFlags = fieldSpans.filter((span) => span.source === "reviewer");

  function handleSelectionCheck() {
    const el = textareaRef.current;
    if (!el) return;
    if (el.selectionStart !== el.selectionEnd) return; // seleção real, não um clique em destaque
    const span = findSpanAtOffset(fieldSpans, field, el.selectionStart);
    if (span) onHighlightClick(span);
  }

  function handleMarkSelectionUncertain() {
    const el = textareaRef.current;
    if (!el || el.selectionStart === el.selectionEnd) return;
    onAddReviewerFlag({
      field,
      start: el.selectionStart,
      end: el.selectionEnd,
      reason: "reviewerFlag",
      source: "reviewer",
    });
  }

  return (
    <div className="flex h-full flex-col gap-2">
      {!readOnly ? (
        <div className="flex items-center justify-between px-1">
          <Button type="button" variant="outline" size="sm" onClick={handleMarkSelectionUncertain}>
            <Flag aria-hidden />
            Marcar seleção como incerta
          </Button>
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border/60 bg-input/20">
        <div
          ref={overlayRef}
          aria-hidden
          className={cn(SHARED_TEXT_CLASSES, "pointer-events-none absolute inset-0 overflow-hidden text-foreground")}
        >
          <HighlightedText text={value} spans={fieldSpans} />
        </div>
        <textarea
          ref={textareaRef}
          value={value}
          readOnly={readOnly}
          onChange={(event) => onChange(event.target.value)}
          onScroll={(event) => {
            if (overlayRef.current) {
              overlayRef.current.scrollTop = event.currentTarget.scrollTop;
              overlayRef.current.scrollLeft = event.currentTarget.scrollLeft;
            }
          }}
          onClick={handleSelectionCheck}
          onKeyUp={handleSelectionCheck}
          spellCheck={false}
          aria-label={field === "literalTranscription" ? "Transcrição literal" : "Transcrição modernizada"}
          className={cn(
            SHARED_TEXT_CLASSES,
            "absolute inset-0 border-0 bg-transparent text-transparent caret-foreground outline-none",
          )}
        />
      </div>

      {reviewerFlags.length > 0 ? (
        <div className="flex flex-col gap-1 px-1">
          <p className="text-xs text-muted-foreground">Marcações do revisor</p>
          <ul className="flex flex-col gap-1">
            {reviewerFlags.map((span, index) => (
              <li
                key={`${span.start}-${span.end}-${index}`}
                className="flex items-center justify-between gap-2 rounded-md bg-warning px-2 py-1 text-xs text-warning-foreground"
              >
                <span className="truncate">“{value.slice(span.start, span.end) || "…"}”</span>
                {!readOnly ? (
                  <button
                    type="button"
                    onClick={() => onRemoveReviewerFlag(span)}
                    aria-label="Remover marcação"
                    className="shrink-0 rounded-sm hover:opacity-70"
                  >
                    <X aria-hidden className="size-3.5" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
