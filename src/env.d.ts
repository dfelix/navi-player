/// <reference types="vite/client" />

interface ImportMetaEnv {
  // The Navidrome server this build talks to. Public configuration, not a
  // secret — see .env.example.
  readonly VITE_NAVIDROME_URL?: string;
  readonly VITE_APP_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
