"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { motion } from "framer-motion";
import { Images, RotateCcw, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchContentRef,
} from "react-zoom-pan-pinch";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface ImageViewerHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  rotateCw: () => void;
  rotateCcw: () => void;
  /**
   * Faz apenas o pan para que a posição vertical da imagem em `proportion * naturalHeight`
   * fique centralizada na viewport — zoom atual e posição X ficam intocados. Sincronia
   * aproximada, por zona, conforme docs/specs/03-review-workspace.md (sem bounding boxes).
   */
  panToProportion: (proportion: number) => void;
}

interface ImageViewerProps {
  documentId: string;
  documentTitle: string;
  hasEnhanced: boolean;
}

export const ImageViewer = forwardRef<ImageViewerHandle, ImageViewerProps>(function ImageViewer(
  { documentId, documentTitle, hasEnhanced },
  ref,
) {
  const [useOriginal, setUseOriginal] = useState(!hasEnhanced);
  const [rotation, setRotation] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [pulse, setPulse] = useState(false);

  const transformRef = useRef<ReactZoomPanPinchContentRef | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setIsLoaded(false);
  }, [useOriginal]);

  useImperativeHandle(ref, () => ({
    zoomIn: () => transformRef.current?.zoomIn(),
    zoomOut: () => transformRef.current?.zoomOut(),
    resetView: () => transformRef.current?.resetTransform(),
    rotateCw: () => setRotation((r) => (r + 90) % 360),
    rotateCcw: () => setRotation((r) => (r - 90 + 360) % 360),
    panToProportion: (proportion: number) => {
      const context = transformRef.current;
      const img = imgRef.current;
      const wrapper = context?.instance.wrapperComponent;
      if (!context || !img || !wrapper || !img.naturalHeight) return;

      const { scale, positionX } = context.state;
      const targetContentY = proportion * img.naturalHeight;
      const newPositionY = wrapper.clientHeight / 2 - targetContentY * scale;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      context.setTransform(positionX, newPositionY, scale, reduceMotion ? 0 : 400, "easeOut");

      setPulse(true);
      window.setTimeout(() => setPulse(false), 700);
    },
  }));

  const src = `/api/media/${documentId}/${useOriginal ? "original" : "enhanced"}`;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-1.5">
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Diminuir zoom" onClick={() => transformRef.current?.zoomOut()}>
            <ZoomOut aria-hidden className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Aumentar zoom" onClick={() => transformRef.current?.zoomIn()}>
            <ZoomIn aria-hidden className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Girar 90° à esquerda"
            onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
          >
            <RotateCcw aria-hidden className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Girar 90° à direita"
            onClick={() => setRotation((r) => (r + 90) % 360)}
          >
            <RotateCw aria-hidden className="size-4" />
          </Button>
        </div>
        {hasEnhanced ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setUseOriginal((v) => !v)}
            aria-pressed={useOriginal}
          >
            <Images aria-hidden />
            {useOriginal ? "Ver melhorada" : "Ver original"}
          </Button>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1 bg-black/20">
        {!isLoaded ? <Skeleton className="absolute inset-3 rounded-lg" /> : null}
        {pulse ? (
          <motion.div
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.7 }}
            className="pointer-events-none absolute inset-0 z-10 border-4 border-primary"
            aria-hidden
          />
        ) : null}
        <TransformWrapper
          ref={transformRef}
          minScale={0.1}
          maxScale={8}
          initialScale={1}
          centerOnInit
          wheel={{ step: 0.15 }}
          doubleClick={{ mode: "toggle" }}
        >
          <TransformComponent
            wrapperStyle={{ width: "100%", height: "100%" }}
            contentStyle={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- react-zoom-pan-pinch precisa do <img> bruto em tamanho natural (ref + naturalHeight) atrás de uma rota /api/media autenticada; a caixa de layout fixa e a allowlist de remote-pattern do next/image não se encaixam aqui. */}
            <img
              ref={imgRef}
              src={src}
              alt={`Documento histórico em revisão — ${documentTitle}`}
              onLoad={() => setIsLoaded(true)}
              style={{ transform: `rotate(${rotation}deg)`, transition: "transform 200ms ease-out" }}
              className={cn("max-w-none select-none", !isLoaded && "opacity-0")}
              draggable={false}
            />
          </TransformComponent>
        </TransformWrapper>
      </div>
    </div>
  );
});
