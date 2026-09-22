import type { Config } from "tailwindcss";

/**
 * Tailwind v4 is CSS-first: design tokens live in `@theme` inside
 * `src/app/globals.css` and are managed by the shadcn/ui registry.
 * This file is loaded from that stylesheet via `@config` and exists for
 * settings that have no CSS-first equivalent yet, plus explicit content
 * globs so template scanning stays predictable in the Docker build.
 * Dark mode is handled by the `dark` custom variant in globals.css.
 */
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx,mdx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
