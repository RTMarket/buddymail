import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  standaloneLicenseDailySendLimit,
  standaloneLicensePlanTierId
} from "../lib/standaloneDeploy";

export type ProductModuleKey = "social" | "leads" | "crm" | "email";

export const PRODUCT_MODULE_LABELS: Record<ProductModuleKey, string> = {
  social: "社交媒体",
  leads: "搜索与获客",
  crm: "客户新增与管理",
  email: "邮件与营销"
};

export type ProductModuleRow = {
  key: ProductModuleKey;
  active: boolean;
  monthlyPriceCents: number;
  simulatedPaidAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  serviceEffectiveStart?: string | null;
  serviceEffectiveEnd?: string | null;
  emailTierId?: string | null;
  dailySendLimit?: number | null;
  sentToday?: number | null;
};

type ProductModulesContextValue = {
  loading: boolean;
  modules: ProductModuleRow[];
  /** 递增以在 license 拉取后刷新侧栏社媒分组 */
  linkedInNavRevision: number;
  refresh: () => Promise<void>;
  isModuleActive: (key: ProductModuleKey) => boolean;
  simulatePay: (key: ProductModuleKey) => Promise<void>;
  paying: ProductModuleKey | null;
};

const ProductModulesContext = createContext<ProductModulesContextValue | null>(null);

const licensePaidAt = "2000-01-01T00:00:00.000Z";

function buildDefaultModules(planTierId: string, dailySendLimit: number): ProductModuleRow[] {
  return [
    {
      key: "crm",
      active: true,
      monthlyPriceCents: 0,
      simulatedPaidAt: licensePaidAt,
      periodStart: licensePaidAt,
      periodEnd: null,
      serviceEffectiveStart: licensePaidAt,
      serviceEffectiveEnd: null
    },
    {
      key: "email",
      active: true,
      monthlyPriceCents: 0,
      simulatedPaidAt: licensePaidAt,
      periodStart: licensePaidAt,
      periodEnd: null,
      serviceEffectiveStart: licensePaidAt,
      serviceEffectiveEnd: null,
      emailTierId: planTierId,
      dailySendLimit,
      sentToday: 0
    }
  ];
}

export function ProductModulesProvider({ children }: { children: React.ReactNode }) {
  const [modules, setModules] = useState<ProductModuleRow[]>(() =>
    buildDefaultModules(standaloneLicensePlanTierId(), standaloneLicenseDailySendLimit())
  );
  const [loading, setLoading] = useState(true);
  const [linkedInNavRevision, setLinkedInNavRevision] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      /* 开源版：无 LICENSE 接口，档位与日发上限由构建时 env 决定 */
      setLinkedInNavRevision((x) => x + 1);
      setModules(
        buildDefaultModules(standaloneLicensePlanTierId(), standaloneLicenseDailySendLimit())
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<ProductModulesContextValue>(
    () => ({
      loading,
      modules,
      linkedInNavRevision,
      refresh,
      isModuleActive: (key) => modules.some((m) => m.key === key && m.active),
      simulatePay: async () => {
        throw new Error("独立站不支持在线开通套餐");
      },
      paying: null
    }),
    [loading, modules, linkedInNavRevision, refresh]
  );

  return <ProductModulesContext.Provider value={value}>{children}</ProductModulesContext.Provider>;
}

export function useProductModules() {
  const ctx = useContext(ProductModulesContext);
  if (!ctx) throw new Error("useProductModules must be used within ProductModulesProvider");
  return ctx;
}
