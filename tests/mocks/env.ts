// Stand-in for src/lib/env.ts (which reads import.meta.env). Tests set the
// configured values through the environment.
export const NAVIDROME_URL_ENV: string | undefined = process.env.VITE_NAVIDROME_URL;
export const APP_NAME_ENV: string | undefined = process.env.VITE_APP_NAME;
