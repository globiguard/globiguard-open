/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GLOBIGUARD_CONTROL_PLANE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
