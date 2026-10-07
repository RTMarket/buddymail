import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { isBssFullAccessDemoEmail } from "./accountUnlock";
import { PRODUCT_MODULE_LABELS, type ProductModuleKey, useProductModules } from "../state/ProductModulesContext";
import { PRODUCT_MODULE_GATE_ENABLED } from "../state/productModuleGate";

/** 独立整页「未开通」提示（路由门禁与侧边栏一致） */
export function ModuleLockedPage(props: { moduleKey: ProductModuleKey }) {
  const label = PRODUCT_MODULE_LABELS[props.moduleKey];
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-12 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-2xl" aria-hidden>
        🔒
      </div>
      <p className="text-lg font-semibold text-slate-900">{label} 未开通</p>
      <p className="mt-2 text-sm text-slate-600">
        该板块需订阅开通后方可使用。请前往「个人中心」选择套餐并完成支付。功能正常内测中，即将开放，开放后即可订阅。
      </p>
      <Link
        to="/account/center"
        className="mt-6 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        前往个人中心
      </Link>
    </div>
  );
}

export function RequireProductModule(props: {
  module: ProductModuleKey;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const { isModuleActive, loading } = useProductModules();

  if (!PRODUCT_MODULE_GATE_ENABLED) {
    return <>{props.children}</>;
  }
  if (user?.role === "super_admin") {
    return <>{props.children}</>;
  }
  if (isBssFullAccessDemoEmail(user?.email)) {
    return <>{props.children}</>;
  }
  /** 先判断开通（含 CRM 永久免费），再处理 loading，避免加载过程中误显锁定页 */
  if (isModuleActive(props.module)) {
    return <>{props.children}</>;
  }
  if (loading) {
    return <div className="text-sm text-slate-500">加载订阅与开通状态…</div>;
  }
  return <ModuleLockedPage moduleKey={props.module} />;
}
