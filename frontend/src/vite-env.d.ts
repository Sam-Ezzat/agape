/// <reference types="vite/client" />

/**
 * Vite Environment Variables
 * WHY: Type definitions for import.meta.env
 */

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_WS_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
