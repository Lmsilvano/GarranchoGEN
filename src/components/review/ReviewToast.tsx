"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Sem dependência de sonner/toast (decisão #6 do plano da fase) — um banner
 * mínimo de posição fixa construído com Tailwind + framer-motion (já presentes
 * no stack obrigatório). `tone: "success"` usa role="status" (aria-live polite,
 * conforme o requisito de a11y de docs/specs/03-review-workspace.md para sucesso
 * de save/approve); `tone: "conflict"` usa role="alert" para o texto do toast 409.
 */
export interface ReviewToastMessage {
  id: number;
  tone: "success" | "conflict";
  text: string;
}

interface ReviewToastProps {
  toast: ReviewToastMessage | null;
  onDismiss: () => void;
}

export function ReviewToast({ toast, onDismiss }: ReviewToastProps) {
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(onDismiss, toast.tone === "conflict" ? 8000 : 4000);
    return () => clearTimeout(timeout);
  }, [toast, onDismiss]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <AnimatePresence>
        {toast ? (
          <motion.div
            key={toast.id}
            role={toast.tone === "conflict" ? "alert" : "status"}
            aria-live={toast.tone === "conflict" ? "assertive" : "polite"}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "glass-panel-elevated pointer-events-auto flex max-w-md items-center gap-2 rounded-xl px-4 py-2.5 text-sm",
              toast.tone === "conflict" ? "text-destructive" : "text-foreground",
            )}
          >
            {toast.tone === "conflict" ? (
              <AlertTriangle aria-hidden className="size-4 shrink-0" />
            ) : (
              <CheckCircle2 aria-hidden className="size-4 shrink-0 text-primary" />
            )}
            <span>{toast.text}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
