"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ScrollText } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="glass-panel flex max-w-xl flex-col items-center gap-6 rounded-2xl p-10 text-center"
      >
        <div className="glass-panel flex size-14 items-center justify-center rounded-full text-primary">
          <ScrollText aria-hidden className="size-6" />
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">GarranchoGEN</h1>
          <p className="text-balance text-muted-foreground">
            Plataforma de paleografia e genealogia — envie documentos para restauração e
            transcrição.
          </p>
        </div>

        <Button asChild>
          <Link href="/documents">Ir para documentos</Link>
        </Button>
      </motion.section>
    </main>
  );
}
