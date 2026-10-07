/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 直连后端根地址（如 http://127.0.0.1:8787），不设则走相对路径 /api（依赖 Vite 代理） */
  readonly VITE_API_BASE?: string;
  /** 邮件模版内 /uploads/ 图片解析用公网根（如 https://example.com）；不设则用 VITE_API_BASE 的 origin 或当前页 origin */
  readonly VITE_PUBLIC_EMAIL_ASSET_BASE_URL?: string;
  readonly VITE_BSS_LINKEDIN_PUBLISHER_ACCOUNTS?: string;
  readonly VITE_BSS_TIKTOK_PUBLISHER_ACCOUNTS?: string;
  readonly VITE_BSS_WECHAT_OFFICIAL_ACCOUNTS?: string;
  readonly VITE_BSS_DAILY_SEND_LIMIT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
