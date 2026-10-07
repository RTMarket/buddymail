import type { SiteLocale } from "../../../i18n/siteLocaleTypes";

export function tiktokAlipayF2fStrings(locale: SiteLocale = "zh") {
  if (locale === "en") {
    return {
      title: "Alipay · Scan to pay",
      qrAlt: "Alipay payment QR code",
      gatewayMisconfiguredTitle: "ALIPAY_GATEWAY misconfigured",
      gatewayMisconfiguredBody:
        "Must be the official gateway https://openapi.alipay.com/gateway.do or sandbox URL. Update backend/.env and restart the server.",
      sandboxBody:
        "Sandbox gateway is active — do not scan with the production Alipay app; use the QR from the API response for testing.",
      scanHint:
        "Scan with the Alipay app. Payment is confirmed automatically within seconds after success.",
      refLabel: "Order ref",
      close: "Close"
    };
  }
  return {
    title: "支付宝支付 · 请扫码支付",
    qrAlt: "支付宝收款二维码",
    gatewayMisconfiguredTitle: "ALIPAY_GATEWAY 配置错误",
    gatewayMisconfiguredBody:
      "须为官方网关 https://openapi.alipay.com/gateway.do 或沙箱地址。改 backend/.env 后重启后端。",
    sandboxBody: "当前为沙箱网关，请勿用真实支付宝 App 扫码；联调以接口返回二维码为准。",
    scanHint:
      "请使用支付宝 App「扫一扫」。支付成功后系统将自动核销（通常数秒内）；独立部署订单可关闭本窗后在右侧下载安装包。",
    refLabel: "商户单号",
    close: "关闭"
  };
}

export function enterpriseAlipayModalStrings(locale: SiteLocale = "zh") {
  if (locale === "en") {
    return {
      title: "Alipay payment",
      close: "Close",
      packageHeading: "Plan includes",
      amountDue: "Amount due:",
      amountYuan: (n: number) => `${n} CNY`,
      amountUsd: (n: number) => `$${n} USD (transfer per remark or contact support for CNY equivalent)`,
      contactOnly: "Custom pricing — contact sales before paying",
      remarkLabel: "Enter this in Alipay「Remark」for reconciliation",
      copyRemark: "Copy remark",
      copied: "Copied",
      paidConfirm: "I have completed the transfer",
      syncing: "Syncing payment…",
      paidTipTitle: "Thanks — we received your confirmation",
      paidTipBody:
        "We will verify the Alipay remark and amount, then activate Pro. Keep your order reference for support.",
      footer:
        "Scan the QR code with Alipay and match the amount shown. Activation is verified manually after we confirm the transfer.",
      imgFailed: "Image failed to load (often http vs https).",
      openImage: "Open image URL in new tab",
      httpsHint:
        "Set ALIPAY_ENTERPRISE_QR_IMAGE_URL to a full https:// URL on the server and restart the backend."
    };
  }
  return {
    title: "企业支付宝收款",
    close: "关闭",
    packageHeading: "套餐内容",
    amountDue: "应付金额：",
    amountYuan: (n: number) => `${n} 元`,
    amountUsd: (n: number) => `$${n} USD（请按备注单号转账，或联系客服确认等值人民币）`,
    contactOnly: "金额：面议（请与商务沟通后按约定支付）",
    remarkLabel: "请在支付宝「备注」中填写（便于对账开通）",
    copyRemark: "复制备注内容",
    copied: "已复制",
    paidConfirm: "我已完成扫码转账",
    syncing: "正在同步支付状态…",
    paidTipTitle: "已记录您的操作提示",
    paidTipBody: "我们将在核对支付宝备注单号与金额后尽快为您开通，请保留备注单号以便查询。",
    footer:
      "使用支付宝扫描左侧二维码完成转账，金额请与「应付金额」一致。当前为人工对账：核对备注单号与金额后，由管理员为您开通对应能力。",
    imgFailed: "图片未能加载（常见于地址为 http 而本页为 https）。",
    openImage: "新窗口打开图片地址",
    httpsHint:
      "请将服务器 ALIPAY_ENTERPRISE_QR_IMAGE_URL 改为以 https:// 开头的完整地址后重启后端。"
  };
}
