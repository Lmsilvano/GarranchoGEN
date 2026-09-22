import { TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import type { UncertainSpan } from "@/types";

/**
 * ADR-0008: apenas uncertainSpans + marcações do revisor, nunca uma porcentagem
 * calibrada. Presença/ausência binária — sem níveis de severidade, já que o
 * contrato não carrega nenhum. A cor nunca é o único sinal (ícone + texto,
 * docs/specs/12-design-system.md).
 */
export function UncertaintyBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-warning px-2 py-0.5 text-xs font-medium text-warning-foreground",
        className,
      )}
    >
      <TriangleAlert aria-hidden className="size-3" />
      Baixa confiança
    </span>
  );
}

interface HighlightSegment {
  text: string;
  span: UncertainSpan | null;
}

/** Divide `text` em trechos simples/destacados a partir de spans (já filtrados por campo). */
export function splitIntoHighlightSegments(text: string, spans: UncertainSpan[]): HighlightSegment[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const segments: HighlightSegment[] = [];
  let cursor = 0;

  for (const span of sorted) {
    const start = Math.max(cursor, Math.min(span.start, text.length));
    const end = Math.max(start, Math.min(span.end, text.length));
    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), span: null });
    }
    if (end > start) {
      segments.push({ text: text.slice(start, end), span });
    }
    cursor = Math.max(cursor, end);
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), span: null });
  }
  return segments;
}

interface HighlightedTextProps {
  text: string;
  spans: UncertainSpan[];
}

/**
 * Renderiza os glifos visíveis do overlay do TranscriptionEditor: texto simples com
 * trechos <mark> (fundo bg-warning + sublinhado pontilhado, nunca uma porcentagem)
 * sobre os spans. Um placeholder de quebra de linha final mantém a contagem de
 * linhas do overlay idêntica à do <textarea>, o que mantém as duas camadas alinhadas.
 */
export function HighlightedText({ text, spans }: HighlightedTextProps) {
  const segments = splitIntoHighlightSegments(text, spans);
  return (
    <>
      {segments.map((segment, index) =>
        segment.span ? (
          <mark
            key={index}
            data-uncertain-source={segment.span.source}
            className="rounded-[2px] bg-warning text-foreground underline decoration-warning-foreground decoration-dotted underline-offset-2"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
      {text.endsWith("\n") ? "​" : null}
    </>
  );
}
