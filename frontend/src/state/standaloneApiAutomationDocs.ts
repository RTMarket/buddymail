export type StandaloneApiAutomationDocSection = {
  title: string;
  items: string[];
};

export type StandaloneApiAutomationDocId = "cursor" | "codex" | "n8n" | "zapier" | "make";

export type StandaloneApiAutomationDocAccent =
  | "indigo"
  | "violet"
  | "orange"
  | "amber"
  | "teal";

export type StandaloneApiAutomationDoc = {
  id: StandaloneApiAutomationDocId;
  title: string;
  subtitle: string;
  accent: StandaloneApiAutomationDocAccent;
  filename: string;
  sections: StandaloneApiAutomationDocSection[];
};

export const API_AUTOMATION_INDEX_LABEL: Record<StandaloneApiAutomationDocId, string> = {
  cursor: "A1",
  codex: "A2",
  n8n: "A3",
  zapier: "A4",
  make: "A5"
};

/** 独立站 API 自动化 · 五栏教程（主站部署安装文档页展示） */
export const STANDALONE_API_AUTOMATION_DOCS: StandaloneApiAutomationDoc[] = [
  {
    id: "cursor",
    title: "Cursor 接入教程",
    subtitle: "终端 + Agent · Bearer API Key · 一键编排发信",
    accent: "indigo",
    filename: "api-automation-cursor.md",
    sections: [
      {
        title: "适用对象",
        items: [
          "已在自有独立站完成装机，能手动发信测试成功",
          "本机已安装 Cursor IDE，具备租户管理员权限",
          "在独立站「设置 → API 对接」已生成 API Key（bss_live_…）"
        ]
      },
      {
        title: "第一步 · 保存密钥（本机）",
        items: [
          "打开 Cursor → Terminal → New Terminal",
          "创建密钥文件（勿提交 Git）：mkdir -p ~/.bss-secrets",
          "写入：export BSS_API_BASE=\"https://您的域名.com\"",
          "写入：export BSS_API_KEY=\"bss_live_您的密钥\"",
          "每次新开终端执行：source ~/.bss-secrets/my-site.env"
        ]
      },
      {
        title: "第二步 · 验证连接",
        items: [
          "curl -sS \"$BSS_API_BASE/api/v1/me\" -H \"Authorization: Bearer $BSS_API_KEY\"",
          "期望返回 ok:true，含 remainingToday（今日剩余配额）",
          "若 UNAUTHORIZED：检查 Key 是否完整、是否已撤销"
        ]
      },
      {
        title: "第三步 · 查模版与行业",
        items: [
          "GET /api/v1/email/templates → 记下 templateId",
          "GET /api/v1/email/industry-counts?lite=1 → 记下行业标签名",
          "创建活动时还需 smtpProfileId（发信配置编号，来自模版或营销页）"
        ]
      },
      {
        title: "第四步 · 让 Cursor Agent 自动发信",
        items: [
          "不必看懂 curl 返回的 JSON。配置好 BSS_API_BASE / BSS_API_KEY 后，直接用中文任务清单告诉 Cursor（见下一步）。",
          "Agent 会在终端执行 curl 或 Python，并用人话汇报结果",
          "也可让 Agent 生成本地 Python 脚本 + macOS cron 实现每日定时发送"
        ]
      },
      {
        title: "第五步 · 任务清单模式（推荐）",
        items: [
          "在 Cursor Chat 粘贴任务即可，例如：「今天 2026-07-05，09:30 开始。行业「海关170-175」用模版 ID 3、专线 1 发 500 封；行业「138-15」用模版 ID 5、专线 2 发 300 封。先查配额和 preview-count，再执行。」",
          "您只需提供：日期/开始时间（到点由 Agent 或 cron 触发）、行业标签（与 CRM 完全一致）、每行业对应的 templateId、专线 laneIndex（多专线档）、每批 limit",
          "Agent 负责：查 /api/v1/me、preview-count → 创建活动 → POST send → 轮询 progress → 汇报成功/失败数",
          "到点发送 = 该时刻打开 Cursor 让 Agent 执行，或事先写好 cron/n8n 定时脚本",
          "勿在对话里粘贴完整 API Key；终端须已 source 密钥文件"
        ]
      },
      {
        title: "完整发信 API 顺序",
        items: [
          "（给 Agent 看即可，您不必手敲）POST preview-count → POST campaigns → POST send → GET send-progress → GET stats",
          "返回 JSON 密密麻麻属正常；让 Agent 解读并汇报「可发人数 / 活动 ID / 进度」",
          "若 templates 的 items 为空：须先在独立站「邮件模版」页创建模版",
          "若 industry-counts 里 count 为 0 但 crmCount 很大：表示 CRM 有人但该标签下当前无可发联系人（已退订、无 MX、今日已发等），Agent 会先跑 preview-count 确认"
        ]
      },
      {
        title: "注意事项",
        items: [
          "Cursor 不会自动连接您的独立站，必须您自己配置 API Key",
          "API Key 仅可访问 /api/v1/*，不能代替浏览器登录",
          "文案请使用独立站已有邮件模版；AI 写稿可在 Cursor 中完成后再存模版",
          "完整端点列表见您独立站：/docs/api-v1-email.md 或「设置 → API 对接」页内文档"
        ]
      }
    ]
  },
  {
    id: "codex",
    title: "Codex 接入教程",
    subtitle: "CLI / 终端脚本 · 与 Cursor 相同 API · 适合命令行用户",
    accent: "violet",
    filename: "api-automation-codex.md",
    sections: [
      {
        title: "适用对象",
        items: [
          "使用 OpenAI Codex CLI 或同类终端 AI 编码工具的用户",
          "独立站已上线且 SMTP/模版/联系人就绪",
          "已在「设置 → API 对接」创建 API Key"
        ]
      },
      {
        title: "第一步 · 环境变量",
        items: [
          "与 Cursor 相同：在本机设置 BSS_API_BASE（您的独立站域名）",
          "设置 BSS_API_KEY=bss_live_…（明文 Key 只显示一次，请妥善保存）",
          "Codex 执行命令前先在同一 shell 中 source 密钥文件"
        ]
      },
      {
        title: "第二步 · 验证",
        items: [
          "curl -sS \"$BSS_API_BASE/api/v1/me\" -H \"Authorization: Bearer $BSS_API_KEY\"",
          "确认 auth.type 为 api_key 且 remainingToday > 0"
        ]
      },
      {
        title: "第三步 · 任务清单或脚本",
        items: [
          "与 Cursor 相同：用中文任务清单描述「日期、开始时间、行业标签、模版 ID、专线、每批封数」，Codex/Agent 代为调用 API",
          "或提示词：「用 Python requests + 环境变量 BSS_API_BASE/KEY，按任务清单发信并轮询 progress」",
          "建议先用 limit:5 小批量测试，确认营销页可见进度后再放大"
        ]
      },
      {
        title: "第四步 · 定时任务（可选）",
        items: [
          "macOS/Linux：crontab -e 添加 0 9 * * * source ~/.bss-secrets/my-site.env && python3 ~/bss-daily-send.py",
          "Windows：任务计划程序运行同样脚本，启动前设置环境变量",
          "脚本内应先 GET /api/v1/me，remainingToday 为 0 时跳过发送"
        ]
      },
      {
        title: "Python 最小示例逻辑",
        items: [
          "headers = {\"Authorization\": f\"Bearer {key}\", \"Content-Type\": \"application/json\"}",
          "me = requests.get(f\"{api}/api/v1/me\", headers=headers).json()",
          "campaign = requests.post(f\"{api}/api/v1/email/campaigns\", headers=headers, json={...}).json()",
          "requests.post(f\"{api}/api/v1/email/campaigns/{id}/send\", headers=headers, json={\"limit\":500,\"industries\":[...]})"
        ]
      },
      {
        title: "注意事项",
        items: [
          "Codex 与 Cursor 使用同一套 /api/v1 REST API，无单独接口",
          "勿将 API Key 写入公开仓库或粘贴到第三方 SaaS 明文配置",
          "多专线档位（5 万/10 万）发送前 GET /api/v1/email/dedicated-lanes，send 时传 laneIndex"
        ]
      }
    ]
  },
  {
    id: "n8n",
    title: "n8n 接入教程",
    subtitle: "HTTP 节点 · 定时触发 · 可视化编排发信",
    accent: "orange",
    filename: "api-automation-n8n.md",
    sections: [
      {
        title: "适用对象",
        items: [
          "自建或使用 n8n Cloud 的自动化用户",
          "独立站管理员，已在「设置 → API 对接」创建 API Key",
          "希望用可视化流程：定时 → 查配额 → 建活动 → 发送 → 通知"
        ]
      },
      {
        title: "第一步 · n8n 凭证",
        items: [
          "n8n → Credentials → Header Auth（或 Generic Credential Type）",
          "Header Name：Authorization",
          "Header Value：Bearer bss_live_您的密钥（注意 Bearer 后有空格）",
          "Base URL 填：https://您的域名.com（不要带 /api/v1 后缀，节点里写完整路径）"
        ]
      },
      {
        title: "第二步 · 工作流骨架",
        items: [
          "触发器：Schedule Trigger（如每天 09:00 北京时间）",
          "节点 1：HTTP Request GET /api/v1/me → 判断 remainingToday",
          "节点 2：IF 节点，remainingToday > 0 才继续",
          "节点 3：HTTP GET /api/v1/email/industry-counts?lite=1",
          "节点 4：HTTP POST /api/v1/email/campaigns（JSON body 含 templateId、smtpProfileId、industries）",
          "节点 5：HTTP POST /api/v1/email/campaigns/{{id}}/send（body: limit、industries、minIntervalMs）",
          "节点 6：Loop + Wait 10s + GET send-progress 直到 status 完成",
          "节点 7（可选）：Slack/邮件/Webhook 通知结果"
        ]
      },
      {
        title: "HTTP 节点示例 · 创建活动",
        items: [
          "Method: POST",
          "URL: https://您的域名.com/api/v1/email/campaigns",
          "Authentication: 上述 Header Auth 凭证",
          "Body JSON: {\"name\":\"n8n daily\",\"templateId\":1,\"smtpProfileId\":1,\"groupIds\":[],\"industries\":[\"制造业\"],\"scheduleSpecific\":false,\"sendMode\":\"immediate\"}"
        ]
      },
      {
        title: "HTTP 节点示例 · 发送",
        items: [
          "Method: POST",
          "URL: https://您的域名.com/api/v1/email/campaigns/{{$json.id}}/send",
          "Body: {\"limit\":500,\"industries\":[\"制造业\"],\"minIntervalMs\":1000}",
          "多专线：额外加 \"laneIndex\":1，发送前 GET dedicated-lanes 选空闲 lane"
        ]
      },
      {
        title: "接收独立站 Webhook（可选）",
        items: [
          "独立站「API 对接」→ 添加 Webhook URL（n8n Webhook 节点 URL）",
          "事件：email.send.completed、email.send.daily_limit_reached、email.campaign.stopped",
          "验证签名：X-BSS-Signature = sha256= + HMAC-SHA256(secret, raw_body)",
          "n8n 用 Crypto 节点或 Code 节点校验后触发后续 CRM 动作"
        ]
      },
      {
        title: "注意事项",
        items: [
          "n8n 无官方 BigSocialBoss 插件，全部走标准 HTTP Request",
          "错误码 DAILY_LIMIT_REACHED / LANE_BUSY / SMTP_NOT_READY 应在 IF 节点分支处理",
          "建议工作流开头加「手动 Execute Workflow」便于调试，确认后再启用 Schedule"
        ]
      }
    ]
  },
  {
    id: "zapier",
    title: "Zapier 接入教程",
    subtitle: "Webhooks + HTTP · 出站事件驱动 · 无原生 App",
    accent: "amber",
    filename: "api-automation-zapier.md",
    sections: [
      {
        title: "适用对象",
        items: [
          "使用 Zapier 连接 CRM、表格、Slack 等与邮件营销的用户",
          "独立站已配置 API Key 与（可选）出站 Webhook",
          "接受「Zapier 无官方 BSS 应用，用 Webhooks by Zapier + Webhooks/API 模块」"
        ]
      },
      {
        title: "方案 A · 定时主动发信（Zap 发起 API）",
        items: [
          "Trigger：Schedule by Zapier（Every Day 9:00am）",
          "Action 1：Webhooks by Zapier → GET",
          "URL: https://您的域名.com/api/v1/me",
          "Headers: Authorization = Bearer bss_live_xxx",
          "Filter：仅当 remainingToday 大于 0 时继续",
          "Action 2：Webhooks → POST 创建活动 /api/v1/email/campaigns（JSON body）",
          "Action 3：Webhooks → POST …/campaigns/[id]/send（从上一 step 取 id）"
        ]
      },
      {
        title: "方案 B · 发完信再联动（独立站 → Zapier）",
        items: [
          "Zapier Trigger：Webhooks by Zapier → Catch Hook",
          "复制 Zapier 提供的 Hook URL",
          "独立站「设置 → API 对接」→ 新建 Webhook，粘贴 Hook URL",
          "保存 Webhook Secret，在 Zapier 中用 Code by Zapier 校验 X-BSS-Signature",
          "收到 email.send.completed 后：写 Google Sheets、发 Slack、更新 HubSpot 等"
        ]
      },
      {
        title: "创建活动 POST 字段",
        items: [
          "name、templateId、smtpProfileId、groupIds（空数组）、industries（数组）",
          "scheduleSpecific: false，sendMode: \"immediate\"",
          "templateId / smtpProfileId 请先在独立站查好固定填入 Zap"
        ]
      },
      {
        title: "发送 POST 字段",
        items: [
          "limit：本批上限（勿超过 remainingToday）",
          "industries：与创建活动时一致",
          "minIntervalMs：1000（毫秒，控制发送间隔）"
        ]
      },
      {
        title: "注意事项",
        items: [
          "Zapier 免费版任务数有限，高频轮询 send-progress 会消耗 Task，建议 send 后只在 Webhook 完成事件触发下游",
          "API Key 存在 Zapier Connection 或环境变量，勿硬编码在共享 Zap 截图中",
          "复杂多步发信更推荐 n8n；Zapier 适合「定时发一批 + 完成后写表/通知」"
        ]
      }
    ]
  },
  {
    id: "make",
    title: "Make 接入教程",
    subtitle: "HTTP 模块 · 场景编排 · 与 n8n 类似的可视化方案",
    accent: "teal",
    filename: "api-automation-make.md",
    sections: [
      {
        title: "适用对象",
        items: [
          "使用 Make（原 Integromat）编排自动化的用户",
          "独立站 API Key 已就绪，模版与 SMTP 已验收",
          "需要比 Zapier 更灵活的 HTTP 与循环模块"
        ]
      },
      {
        title: "第一步 · Make 连接",
        items: [
          "模块：HTTP → Make a request",
          "或创建 Custom app connection，默认 Header：Authorization: Bearer bss_live_…",
          "Base 概念：每个模块 URL 写完整路径 https://您的域名.com/api/v1/..."
        ]
      },
      {
        title: "第二步 · 场景：每日发信",
        items: [
          "触发：Schedule（Cron 0 9 * * *）",
          "模块 1：HTTP GET /api/v1/me → 映射 remainingToday",
          "Router：remainingToday > 0 → 分支 A；否则结束",
          "模块 2：HTTP GET industry-counts?lite=1",
          "模块 3：HTTP POST campaigns（JSON）",
          "模块 4：HTTP POST campaigns/{id}/send",
          "模块 5：Repeater + Sleep 10s + GET send-progress 直到完成（或固定重复 30 次）",
          "模块 6：HTTP GET stats → 写入 Google Sheets / Airtable"
        ]
      },
      {
        title: "HTTP 模块配置要点",
        items: [
          "Method / URL / Headers 与 n8n 相同",
          "Body type: Raw / JSON",
          "Parse response：Yes，便于下一模块引用 {{1.data.id}} 等字段",
          "错误处理：Add error handler route 捕获 4xx（如 DAILY_LIMIT_REACHED）"
        ]
      },
      {
        title: "接收 Webhook（Make ← 独立站）",
        items: [
          "模块：Webhooks → Custom webhook → 创建 webhook",
          "将 URL 填入独立站「API 对接」Webhook 配置",
          "用 Make 的 crypto 或 Set variable + 比较 X-BSS-Signature 验证 HMAC",
          "过滤 event 类型 email.send.completed 再执行后续模块"
        ]
      },
      {
        title: "多专线档位",
        items: [
          "Iterator 遍历 dedicated-lanes 返回的空闲 lane",
          "每个 lane 单独 POST send，body 含 laneIndex",
          "同一 lane 不可并行两活动（LANE_BUSY）"
        ]
      },
      {
        title: "注意事项",
        items: [
          "Make 无官方 BigSocialBoss 模块，全部用 HTTP",
          "Operations 计费与轮询次数相关，完成事件优先用 Webhook 而非高频 poll",
          "详细 API 见独立站 /docs/api-v1-email.md"
        ]
      }
    ]
  }
];
