import { useEffect, useState } from "react";
import { apiJson } from "../../../lib/api";

export type EmailTierAlipayPcDiagnostic = {
  missingEnvFields: string[];
  sdkInitError: string | null;
  notifyUrlHost: string | null;
  gatewayHost: string | null;
  sandbox: boolean;
  gatewayMisconfigured: boolean;
};

export function useEmailTierAlipayConfig(userPresent: boolean) {
  const [alipayQrEnabled, setAlipayQrEnabled] = useState(false);
  const [alipayPcEnabled, setAlipayPcEnabled] = useState(false);
  const [alipayConfigFetched, setAlipayConfigFetched] = useState(false);
  const [alipayPcDiagnostic, setAlipayPcDiagnostic] = useState<EmailTierAlipayPcDiagnostic | null>(null);

  useEffect(() => {
    if (!userPresent) {
      setAlipayQrEnabled(false);
      setAlipayConfigFetched(false);
      setAlipayPcEnabled(false);
      setAlipayPcDiagnostic(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const r = await apiJson<{ ok: true; qrEnabled: boolean; qrImageUrl: string | null }>(
          "/api/me/product-modules/enterprise-alipay"
        );
        let pcPay = false;
        let diag: EmailTierAlipayPcDiagnostic | null = null;
        try {
          const pc = await apiJson<{
            ok: true;
            pcPayEnabled: boolean;
            sandbox: boolean;
            gatewayMisconfigured?: boolean;
            missingEnvFields?: string[];
            sdkInitOk?: boolean;
            sdkInitError?: string | null;
            notifyUrlHost?: string | null;
            gatewayHost?: string | null;
          }>("/api/me/product-modules/alipay-pc-config");
          pcPay = Boolean(pc.pcPayEnabled);
          diag = {
            missingEnvFields: Array.isArray(pc.missingEnvFields) ? pc.missingEnvFields : [],
            sdkInitError: pc.sdkInitError ?? null,
            notifyUrlHost: pc.notifyUrlHost ?? null,
            gatewayHost: pc.gatewayHost ?? null,
            sandbox: Boolean(pc.sandbox),
            gatewayMisconfigured: Boolean(pc.gatewayMisconfigured)
          };
        } catch (e) {
          pcPay = false;
          diag = {
            missingEnvFields: [],
            sdkInitError: `alipay-pc-config 接口请求失败：${String((e as Error)?.message ?? e)}`,
            notifyUrlHost: null,
            gatewayHost: null,
            sandbox: false,
            gatewayMisconfigured: false
          };
        }
        if (cancelled) return;
        setAlipayQrEnabled(Boolean(r.qrEnabled && r.qrImageUrl));
        setAlipayPcEnabled(pcPay);
        setAlipayPcDiagnostic(diag);
        setAlipayConfigFetched(true);
      } catch {
        if (!cancelled) {
          setAlipayQrEnabled(false);
          setAlipayPcEnabled(false);
          setAlipayPcDiagnostic({
            missingEnvFields: [],
            sdkInitError: "enterprise-alipay 接口请求失败（无法获取支付通道开关）",
            notifyUrlHost: null,
            gatewayHost: null,
            sandbox: false,
            gatewayMisconfigured: false
          });
          setAlipayConfigFetched(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userPresent]);

  return { alipayQrEnabled, alipayPcEnabled, alipayConfigFetched, alipayPcDiagnostic };
}
