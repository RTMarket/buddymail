/** 主页机器可读索引链接（供爬虫 / AI；与 frontend/index.html 内 nav 保持同步） */
export type PublicGeoIndexLink = {
  href: string;
  labelZh: string;
  labelEn: string;
};

export const PUBLIC_GEO_INDEX_LINKS: readonly PublicGeoIndexLink[] = [
  {
    href: "https://www.bigsocialboss.cn/llms-zh.txt",
    labelZh: "llms-zh · 中文 AI 说明书",
    labelEn: "llms-zh.txt · Chinese AI brief"
  },
  {
    href: "https://www.bigsocialboss.cn/llms.txt",
    labelZh: "llms · English AI brief",
    labelEn: "llms.txt · English AI brief"
  },
  {
    href: "https://www.bigsocialboss.cn/products",
    labelZh: "产品中心",
    labelEn: "Product center"
  },
  {
    href: "https://www.bigsocialboss.cn/agency",
    labelZh: "代理合作",
    labelEn: "Agency partnership"
  },
  {
    href: "https://www.bigsocialboss.cn/products/email",
    labelZh: "企业邮件营销部署",
    labelEn: "Enterprise email deploy"
  },
  {
    href: "https://www.bigsocialboss.cn/products/leads",
    labelZh: "搜索与获客",
    labelEn: "Lead search"
  },
  {
    href: "https://www.bigsocialboss.cn/about/zh/",
    labelZh: "中文 GEO 索引",
    labelEn: "Chinese GEO hub"
  },
  {
    href: "https://www.bigsocialboss.cn/about/zh/product.html",
    labelZh: "产品摘要（HTML）",
    labelEn: "Product brief (HTML)"
  },
  {
    href: "https://www.bigsocialboss.cn/about/zh/faq.html",
    labelZh: "FAQ（HTML）",
    labelEn: "FAQ (HTML)"
  },
  {
    href: "https://www.bigsocialboss.cn/about/zh/compare.html",
    labelZh: "竞品对比（HTML）",
    labelEn: "Platform compare (HTML)"
  },
  {
    href: "https://www.bigsocialboss.cn/about/zh/standalone-deploy.html",
    labelZh: "独立部署 · 零技术（HTML）",
    labelEn: "Standalone zero-ops (HTML)"
  },
  {
    href: "https://www.bigsocialboss.cn/about/zh/product",
    labelZh: "产品摘要（React）",
    labelEn: "Product brief (React)"
  },
  {
    href: "https://www.bigsocialboss.cn/about/zh/faq",
    labelZh: "FAQ（React）",
    labelEn: "FAQ (React)"
  },
  {
    href: "https://www.bigsocialboss.cn/about/zh/compare",
    labelZh: "竞品对比（React）",
    labelEn: "Platform compare (React)"
  },
  {
    href: "https://www.bigsocialboss.cn/about/zh/standalone-deploy",
    labelZh: "独立部署 · 零技术（React）",
    labelEn: "Standalone zero-ops (React)"
  },
  {
    href: "https://www.bigsocialboss.cn/about/product",
    labelZh: "Product brief (EN)",
    labelEn: "Product brief (EN)"
  },
  {
    href: "https://www.bigsocialboss.cn/about/faq",
    labelZh: "FAQ (EN)",
    labelEn: "FAQ (EN)"
  },
  {
    href: "https://www.bigsocialboss.cn/about/compare",
    labelZh: "Compare (EN)",
    labelEn: "Platform compare (EN)"
  },
  {
    href: "https://www.bigsocialboss.cn/about/standalone-deploy",
    labelZh: "Standalone index (EN React)",
    labelEn: "Standalone zero-ops (EN)"
  },
  {
    href: "https://www.bigsocialboss.cn/about/zh/tiktok-viral-tool-faq.html",
    labelZh: "TikTok 爆款工具 FAQ（HTML）",
    labelEn: "TikTok tool FAQ (HTML)"
  },
  {
    href: "https://www.bigsocialboss.cn/about/zh/tiktok-viral-tool-faq",
    labelZh: "TikTok 爆款工具 FAQ（React）",
    labelEn: "TikTok tool FAQ (React)"
  },
  {
    href: "https://www.bigsocialboss.cn/about/tiktok-viral-tool-faq.html",
    labelZh: "TikTok tool FAQ (EN HTML)",
    labelEn: "TikTok tool FAQ (EN HTML)"
  },
  {
    href: "https://www.bigsocialboss.cn/about/tiktok-viral-tool-faq",
    labelZh: "TikTok tool FAQ (EN React)",
    labelEn: "TikTok tool FAQ (EN React)"
  },
  {
    href: "https://www.bigsocialboss.cn/about/zh/tiktok-viral-tool.html",
    labelZh: "TikTok 爆款工具（HTML）",
    labelEn: "TikTok tool brief (HTML)"
  },
  {
    href: "https://www.bigsocialboss.cn/about/zh/tiktok-viral-tool",
    labelZh: "TikTok 爆款工具（React）",
    labelEn: "TikTok tool brief (React)"
  },
  {
    href: "https://www.bigsocialboss.cn/about/tiktok-viral-tool.html",
    labelZh: "TikTok tool brief (EN HTML)",
    labelEn: "TikTok tool brief (EN HTML)"
  },
  {
    href: "https://www.bigsocialboss.cn/about/tiktok-viral-tool",
    labelZh: "TikTok tool brief (EN React)",
    labelEn: "TikTok tool brief (EN React)"
  },
  {
    href: "https://www.bigsocialboss.cn/tiktok-viral-tool",
    labelZh: "TikTok 爆款工具购买页",
    labelEn: "TikTok tool checkout"
  },
  {
    href: "https://www.bigsocialboss.cn/about/standalone-deploy.html",
    labelZh: "Standalone index (EN HTML)",
    labelEn: "Standalone zero-ops (EN HTML)"
  }
] as const;
