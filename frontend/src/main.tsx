/* 必须最先加载：补齐 pdfjs-dist v5 依赖的 Map/WeakMap upsert 方法，避免老版 Safari 报
   "C(this,bv).getOrInsertComputed is not a function" 等错误。 */
import "./lib/polyfills";
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ProductModulesProvider } from "./state/ProductModulesContext";
import { SiteLocaleProvider } from "./i18n/SiteLocaleContext";
import "./styles.css";
/* QUILL_LOCK（硬性锁定）：未经需求方允许禁止调换顺序。须先 styles.css，再 quill/dist/quill.snow.css（邮件正文/签名档工具栏依赖）。见 .cursor/rules/email-template-quill-toolbar-lock.mdc */
import "quill/dist/quill.snow.css";
import { router } from "./router";
import { trackSiteVisit } from "./lib/siteVisit";
import { captureMarketingUtmFromUrl } from "./lib/marketingUtm";
import { refreshFollowupChannelsCache } from "./ui/nav/standaloneNavCatalog";

captureMarketingUtmFromUrl();
trackSiteVisit("initial");
// 预加载跟进渠道名称缓存（导航菜单动态显示）
refreshFollowupChannelsCache();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SiteLocaleProvider>
      <AuthProvider>
        <ProductModulesProvider>
          <RouterProvider router={router} />
        </ProductModulesProvider>
      </AuthProvider>
    </SiteLocaleProvider>
  </React.StrictMode>
);

