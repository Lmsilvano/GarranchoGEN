"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SHORTCUT_ROWS: Array<[string, string]> = [
  ["Ctrl+Enter", "Aprovar (confirma se houver alterações não salvas)"],
  ["Ctrl+S", "Salvar versão"],
  ["Ctrl+= / Ctrl++", "Aumentar zoom"],
  ["Ctrl+-", "Diminuir zoom"],
  ["Ctrl+0", "Restaurar zoom / ajustar à tela"],
  ["Ctrl+Z", "Desfazer no editor em foco"],
  ["Ctrl+Shift+Z", "Refazer"],
  ["Ctrl+R", "Girar 90° à direita"],
  ["Ctrl+Shift+R", "Girar 90° à esquerda"],
  ["Alt+1 / Alt+2 / Alt+3", "Focar Literal / Modernizada / Metadados"],
  ["Escape", "Limpar seleção de destaque / fechar confirmação"],
  ["?", "Abrir esta ajuda"],
];

interface ShortcutsHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** "?" abre este diálogo (o Dialog do radix já faz o focus-trap enquanto aberto). */
export function ShortcutsHelp({ open, onOpenChange }: ShortcutsHelpProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Atalhos</DialogTitle>
          <DialogDescription>
            No macOS, use Command no lugar de Ctrl. Os atalhos funcionam com a área de
            revisão em foco.
          </DialogDescription>
        </DialogHeader>
        <table className="w-full text-sm">
          <tbody>
            {SHORTCUT_ROWS.map(([keys, action]) => (
              <tr key={keys} className="border-b border-border/40 last:border-0">
                <td className="py-1.5 pr-3 font-mono text-xs whitespace-nowrap text-primary">{keys}</td>
                <td className="py-1.5 text-muted-foreground">{action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}
