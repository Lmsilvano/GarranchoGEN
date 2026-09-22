import type { UncertainSpan, UncertainSpanField } from "@/types";

/** Usado pelo handler de clique/seleção do TranscriptionEditor para detectar um clique dentro de um trecho destacado. */
export function findSpanAtOffset(
  spans: UncertainSpan[],
  field: UncertainSpanField,
  offset: number,
): UncertainSpan | null {
  return spans.find((span) => span.field === field && offset >= span.start && offset < span.end) ?? null;
}
