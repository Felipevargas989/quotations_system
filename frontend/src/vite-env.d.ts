/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_EVENTIA_API_REST: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
