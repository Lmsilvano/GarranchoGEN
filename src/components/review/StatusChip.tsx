import { Badge } from "@/components/ui/badge";
import { PROCESSING_STATUS_LABELS_PT_BR, type ProcessingStatus } from "@/types";

const VARIANT_BY_STATUS: Record<ProcessingStatus, "default" | "secondary" | "outline" | "destructive"> = {
  uploaded: "secondary",
  enhancing: "secondary",
  enhancementFailed: "destructive",
  awaitingQuota: "outline",
  transcribing: "secondary",
  transcriptionFailed: "destructive",
  readyForReview: "outline",
  inReview: "secondary",
  approved: "default",
  rejected: "destructive",
};

interface StatusChipProps {
  status: ProcessingStatus;
}

/** labelPtBr conforme docs/specs/04-contracts.md — awaitingQuota exibe a string de espera exata. */
export function StatusChip({ status }: StatusChipProps) {
  return <Badge variant={VARIANT_BY_STATUS[status]}>{PROCESSING_STATUS_LABELS_PT_BR[status]}</Badge>;
}
