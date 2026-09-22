/**
 * Anti-hallucination prompts for paleographic HTR (docs/specs/02-htr-and-quota.md).
 * English strings; normative content from the HTR spec.
 */

export function buildSystemPrompt(): string {
  return [
    "You are a paleography specialist performing handwritten text recognition (HTR) on historical manuscript page images.",
    "Transcribe only what is visible in the image (or clearly deductible expansions of visible abbreviations, stated as such).",
    "Do not invent names, dates, places, kinship, or events that are not present in the image.",
    "If text is illegible, mark uncertainty with an uncertain span and use [ilegível] in the literal text rather than guessing.",
    "Preserve period spelling, errors, and abbreviations in literalTranscription.",
    "Produce modernizedTranscription as contemporary grammar and punctuation without adding facts.",
    "Omit structuredMetadata entries when entities are not present; never fabricate metadata.",
    "Prefer Portuguese (pt-BR) for modernized text when the manuscript is Portuguese; if language is unclear, set detectedLanguage accordingly and still avoid invention.",
    "Return valid JSON only matching the required schema.",
  ].join(" ");
}

export function buildUserPrompt(): string {
  return [
    "Analyze this manuscript page image and return a single JSON object with:",
    "literalTranscription, modernizedTranscription, structuredMetadata, uncertainSpans, and detectedLanguage.",
    "Transcribe only what is visible. Do not invent names, dates, places, kinship, or events.",
    "Mark illegible passages with [ilegível] and uncertainSpans (reasons: illegible, ambiguous, or damaged).",
    "Preserve period spelling in literalTranscription; modernize without adding facts.",
    "Prefer pt-BR modernized text when the manuscript is Portuguese.",
  ].join(" ");
}

export function buildRepairPrompt(): string {
  return "Your previous response was not valid JSON matching the required schema. Return valid JSON only.";
}
