/** 手机号国家/地区前缀（人工安装需求单） */
export const PHONE_COUNTRY_PREFIXES = [
  { code: "+86", label: "中国 +86" },
  { code: "+852", label: "香港 +852" },
  { code: "+886", label: "台湾 +886" },
  { code: "+853", label: "澳门 +853" },
  { code: "+1", label: "美国/加拿大 +1" },
  { code: "+44", label: "英国 +44" },
  { code: "+61", label: "澳大利亚 +61" },
  { code: "+65", label: "新加坡 +65" },
  { code: "+81", label: "日本 +81" },
  { code: "+82", label: "韩国 +82" },
  { code: "+49", label: "德国 +49" },
  { code: "+33", label: "法国 +33" },
  { code: "+39", label: "意大利 +39" },
  { code: "+34", label: "西班牙 +34" },
  { code: "+55", label: "巴西 +55" },
  { code: "+91", label: "印度 +91" },
  { code: "+971", label: "阿联酋 +971" },
  { code: "+60", label: "马来西亚 +60" },
  { code: "+66", label: "泰国 +66" },
  { code: "+84", label: "越南 +84" }
] as const;

/** 北京时间可预约开始时刻：09:00–18:00（每段 3 小时，最晚至 21:00） */
export const BEIJING_APPOINTMENT_START_HOURS = Array.from({ length: 10 }, (_, i) => {
  const h = 9 + i;
  return `${String(h).padStart(2, "0")}:00`;
});

export function formatAppointmentSlotHint(date: string, time: string): string {
  if (!date || !time) return "请选择日期与开始时间（每段约 3 小时）";
  const [hh] = time.split(":").map(Number);
  if (Number.isNaN(hh)) return "";
  const endH = hh + 3;
  return `${date} ${time} – ${String(endH).padStart(2, "0")}:00（北京时间）`;
}
