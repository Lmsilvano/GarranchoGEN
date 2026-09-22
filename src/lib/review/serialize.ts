import type { Document as DocumentContract, Transcription as TranscriptionContract } from "@/types";

/**
 * O tipo de retorno de `.toJSON()` do Mongoose não conhece o `transform` do schema
 * (que renomeia `_id` para `id`), então o TS enxerga uma forma sem `id`. Mesmo padrão
 * de `toContractDocument` em `src/app/api/documents/route.ts`, compartilhado aqui
 * porque a Fase 7 precisa dele em quatro arquivos de rota, além de Transcription.
 */
export function toContractDocument(doc: { toJSON: () => DocumentContract }): DocumentContract {
  return doc.toJSON();
}

export function toContractTranscription(doc: { toJSON: () => TranscriptionContract }): TranscriptionContract {
  return doc.toJSON();
}
