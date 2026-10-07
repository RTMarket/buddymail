import React from "react";

export type EmailPaymentMethod = "alipay" | "airwallex";

function DomesticAlipayMark({ en }: { en: boolean }) {
  return (
    <span className="text-[17px] font-bold tracking-tight text-white">{en ? "zhifubao" : "支付宝"}</span>
  );
}

function InternationalAlipayMark({ en }: { en: boolean }) {
  return (
    <span className="text-[15px] font-bold tracking-tight text-[#1677ff]">{en ? "Alipay" : "支付宝国际"}</span>
  );
}

export function EmailPaymentMethodPicker(props: {
  locale: "zh" | "en";
  paymentMethod: EmailPaymentMethod;
  disabled?: boolean;
  /** 独立部署等场景暂隐藏「支付宝国际 / 空中云汇」 */
  showInternational?: boolean;
  onPaymentMethodChange: (method: EmailPaymentMethod) => void;
}) {
  const {
    locale,
    paymentMethod,
    disabled = false,
    showInternational = true,
    onPaymentMethodChange
  } = props;
  const en = locale === "en";

  return (
    <div className="space-y-1.5">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">
        {en ? "Payment method" : "支付方式"}
      </p>
      <div className={showInternational ? "grid grid-cols-2 gap-2" : "grid grid-cols-1 gap-2"}>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={paymentMethod === "alipay"}
          className={`flex h-11 items-center justify-center rounded-lg border border-[#1677ff]/80 bg-gradient-to-r from-[#1677ff] to-[#4096ff] px-2 transition hover:from-[#0958d9] hover:to-[#1677ff] disabled:opacity-60 ${
            paymentMethod === "alipay" ? "ring-2 ring-[#1677ff]/40 ring-offset-1" : "opacity-90"
          }`}
          onClick={() => {
            if (!disabled) onPaymentMethodChange("alipay");
          }}
        >
          <DomesticAlipayMark en={en} />
        </button>

        {showInternational ? (
          <button
            type="button"
            disabled={disabled}
            aria-pressed={paymentMethod === "airwallex"}
            className={`flex h-11 items-center justify-center rounded-lg border bg-white px-2 transition hover:border-[#1677ff]/50 hover:bg-[#1677ff]/5 disabled:opacity-60 ${
              paymentMethod === "airwallex"
                ? "border-[#1677ff]/70 ring-2 ring-[#1677ff]/30 ring-offset-1"
                : "border-slate-200"
            }`}
            onClick={() => {
              if (!disabled) onPaymentMethodChange("airwallex");
            }}
          >
            <InternationalAlipayMark en={en} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
