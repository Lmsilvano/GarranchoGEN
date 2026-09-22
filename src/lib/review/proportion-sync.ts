/**
 * Sincronia editor↔imagem (v1, aproximada) — docs/specs/03-review-workspace.md.
 * Baseada em proporção, sem dados de bounding box: clamp(span.start / field.length, 0, 1).
 * O pan usa essa proporção apenas contra a altura natural da imagem; o nível de
 * zoom atual e a posição X ficam inalterados (responsabilidade do chamador).
 */
export function computeSpanProportion(span: { start: number }, fieldLength: number): number {
  if (fieldLength <= 0) return 0;
  const raw = span.start / fieldLength;
  return Math.min(1, Math.max(0, raw));
}
