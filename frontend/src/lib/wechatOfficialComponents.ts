export type WechatComponentKey = "divider" | "follow" | "highlight" | "quote" | "tip" | "cta";

export type WechatComponentDef = {
  key: WechatComponentKey;
  label: string;
  /** 给用户看的说明（非技术） */
  description: string;
  html: string;
};

/** 排版组件：点击后在光标处插入，用户只需改文字，无需写 HTML */
export const WECHAT_EDITOR_COMPONENTS: WechatComponentDef[] = [
  {
    key: "divider",
    label: "分隔线",
    description: "在段落之间加一条视觉分隔",
    html: `<p style="margin:20px 0;text-align:center;color:#94a3b8;font-size:14px;letter-spacing:4px;">— ✦ —</p>`
  },
  {
    key: "highlight",
    label: "重点强调",
    description: "用 ✨ 标出本段核心观点",
    html: `<p style="margin:14px 0;font-size:15px;line-height:1.85;color:#334155;"><strong>✨ 重点：</strong>在这里写读者最该记住的一句话。</p>`
  },
  {
    key: "quote",
    label: "金句引用",
    description: "左侧绿线突出客户评价、名言或数据（可直接改引号内文字）",
    html: `<blockquote style="margin:18px 0;padding:12px 16px;border-left:4px solid #10b981;background:#f8fafc;color:#334155;font-size:15px;line-height:1.85;">「在这里写一句值得转发的金句、客户反馈或行业数据。」</blockquote>`
  },
  {
    key: "tip",
    label: "温馨提示",
    description: "黄色提示框，适合补充注意事项",
    html: `<p style="margin:16px 0;padding:12px 14px;border-radius:8px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:14px;line-height:1.75;"><strong>💡 提示：</strong>在这里写操作步骤或注意事项。</p>`
  },
  {
    key: "follow",
    label: "关注引导",
    description: "文末引导读者关注公众号、点「在看」",
    html: `<p style="margin:20px 0;padding:14px;border:1px solid #d1fae5;border-radius:10px;background:#ecfdf5;text-align:center;font-size:14px;line-height:1.75;color:#065f46;"><strong>👇 觉得有用？</strong><br/>欢迎点个「在看」，并关注公众号获取更多实操内容。</p>`
  },
  {
    key: "cta",
    label: "行动引导",
    description: "引导读者私信、回复关键词或访问官网",
    html: `<p style="margin:20px 0;padding:16px;border-radius:10px;background:#0f172a;text-align:center;color:#fff;font-size:15px;line-height:1.75;"><strong>想要完整方案？</strong><br/><span style="color:#cbd5e1;font-size:13px;">回复「邮件」获取清单，或访问官网了解独立部署方案。</span></p>`
  }
];
