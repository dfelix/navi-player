// The only build-time environment the app reads. Kept in one tiny module so
// tests can substitute it (Jest has no import.meta.env).
export const NAVIDROME_URL_ENV: string | undefined = import.meta.env.VITE_NAVIDROME_URL;
export const APP_NAME_ENV: string | undefined = import.meta.env.VITE_APP_NAME;
