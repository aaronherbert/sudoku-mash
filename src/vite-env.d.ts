/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Endpoint returning short-lived TURN credentials as an `RTCIceServer[]` (see turn-worker/). */
  readonly VITE_TURN_CREDENTIALS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
