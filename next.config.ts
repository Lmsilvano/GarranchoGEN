import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Playwright/e2e hits the dev server via 127.0.0.1 (playwright.config.ts's
  // default baseURL); Next 16 only allows "localhost" dev-resource access by
  // default, which was silently breaking client hydration for 127.0.0.1
  // requests. Dev-only setting — has no effect on `next build`/`next start`.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Proxy buffers request bodies (default ~10MB) and truncates silently when
  // exceeded. Raise so the route handler can enforce MAX_UPLOAD_BYTES → 413.
  experimental: {
    proxyClientMaxBodySize: "50mb",
  },
  // Worker Thread entry + sharp native binaries are outside the static import
  // graph (dynamic Worker path / nft may miss them). Include for standalone.
  outputFileTracingIncludes: {
    "/*": [
      "node_modules/sharp/**/*",
      "src/lib/enhancement/enhance.worker.mjs",
    ],
  },
  // Keep sharp external so Worker Threads load the same native module as Node.
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
