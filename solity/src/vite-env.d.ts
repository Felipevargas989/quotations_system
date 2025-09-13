/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_GOOGLE_SHEETS_ID: string;
  readonly VITE_GOOGLE_SHEETS_RANGE: string;
  readonly VITE_GOOGLE_SHEETS_FIXED_RANGE: string;
  readonly VITE_GOOGLE_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
