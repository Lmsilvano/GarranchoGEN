/**
 * Tabela de atalhos de teclado de docs/specs/03-review-workspace.md, comparada contra
 * um objeto simples (não um KeyboardEvent real) para que o matcher seja testável sem
 * jsdom. No macOS, Meta é tratado como equivalente a Ctrl em todos os bindings aqui.
 *
 * Ctrl+Z / Ctrl+Shift+Z ficam de fora de propósito — desfazer/refazer no <textarea>
 * literal/modernizado em foco é comportamento nativo do navegador, nunca interceptado.
 */
export type ReviewShortcutAction =
  | "approve"
  | "save"
  | "zoomIn"
  | "zoomOut"
  | "zoomReset"
  | "rotateCw"
  | "rotateCcw"
  | "focusLiteral"
  | "focusModernized"
  | "focusMetadata"
  | "dismiss"
  | "help";

export interface ShortcutKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

interface ShortcutBinding {
  action: ReviewShortcutAction;
  /** Valores de event.key que satisfazem este binding (case-insensitive). */
  keys: string[];
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

const BINDINGS: ShortcutBinding[] = [
  { action: "approve", keys: ["Enter"], ctrl: true },
  { action: "save", keys: ["s", "S"], ctrl: true },
  { action: "zoomIn", keys: ["=", "+"], ctrl: true },
  { action: "zoomOut", keys: ["-"], ctrl: true },
  { action: "zoomReset", keys: ["0"], ctrl: true },
  { action: "rotateCcw", keys: ["r", "R"], ctrl: true, shift: true },
  { action: "rotateCw", keys: ["r", "R"], ctrl: true },
  { action: "focusLiteral", keys: ["1"], alt: true },
  { action: "focusModernized", keys: ["2"], alt: true },
  { action: "focusMetadata", keys: ["3"], alt: true },
  { action: "dismiss", keys: ["Escape"] },
  { action: "help", keys: ["?"] },
];

function isCtrlOrMeta(event: ShortcutKeyEvent): boolean {
  return event.ctrlKey || event.metaKey;
}

/** Retorna a ação correspondente, ou null. A ordem importa: rotateCcw (Ctrl+Shift+R) é verificado antes de rotateCw (Ctrl+R). */
export function matchReviewShortcut(event: ShortcutKeyEvent): ReviewShortcutAction | null {
  for (const binding of BINDINGS) {
    if (!binding.keys.includes(event.key)) continue;
    if (Boolean(binding.ctrl) !== isCtrlOrMeta(event)) continue;
    if (Boolean(binding.shift) !== event.shiftKey) continue;
    if (Boolean(binding.alt) !== event.altKey) continue;
    return binding.action;
  }
  return null;
}

/** Ações cujo comportamento padrão do navegador deve sempre ser suprimido quando correspondidas. */
const ALWAYS_PREVENT_DEFAULT: ReadonlySet<ReviewShortcutAction> = new Set([
  "approve",
  "save",
  "zoomIn",
  "zoomOut",
  "zoomReset",
  "rotateCw", // sobrepõe o recarregamento do navegador (Ctrl+R)
  "rotateCcw",
  "focusLiteral",
  "focusModernized",
  "focusMetadata",
  "help",
]);

export function shouldPreventDefault(action: ReviewShortcutAction): boolean {
  return ALWAYS_PREVENT_DEFAULT.has(action);
}
