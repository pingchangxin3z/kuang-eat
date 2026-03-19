/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FEISHU_WEBHOOK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
