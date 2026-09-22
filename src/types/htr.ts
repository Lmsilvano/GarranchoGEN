import type { MetadataEntity, Transcription, UncertainSpan } from "./transcription";

export interface HtrModelResponse {
  literalTranscription: string;
  modernizedTranscription: string;
  structuredMetadata: Omit<MetadataEntity, "id">[];
  uncertainSpans: Omit<UncertainSpan, "source">[];
  detectedLanguage?: Transcription["detectedLanguage"];
}
