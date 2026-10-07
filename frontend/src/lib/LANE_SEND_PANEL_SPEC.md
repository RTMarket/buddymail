# 专线栏 · 实时监控发送（产品规则）

> **2026-05-25**：监控区前端重写 Step 1 已验收。实现见 `laneSendMonitorCore.ts`、`useLaneSendMonitor.ts`、`LaneSendMonitorBlock.tsx`；保护规则见 `.cursor/rules/lane-realtime-send-stable.mdc`。

## 选活动
- 下拉：`6位编号 · 活动名称`
- 未发送时小字：`已选：编号 · 将创建第N轮 · 名称`（N = 下一发轮次）
- 发送中小字：`正在发送：编号 · 第N轮 · 名称`（N 冻结，不随列表刷新变）
- 刚结束小字：`已是第 N 轮，活动已发送完成 ✅`（切换活动 ID 后恢复「将创建第 N+1 轮」）

## 点发送流程
1. 点「发送」→ 仅弹出黄色确认框，**不**开始轮询、**不**调发送 API
2. 点「确认」→ 锁定预览人数（行业标签人数）为计划数 → 调 POST send → 再显示 0% 进度条与「剩余 N 封 / 预计时间」→ 轮询更新

## 实时监控（发送中）
- 计划数 N = 当前勾选行业预览人数（不是活动历史累计）
- 尝试/成功/失败 = **本轮 send_run** 计数
- 最近 3 封 = **本轮**且 **本次确认之后** 的邮件，按 id 逐条追加
- 进度条 0%→100%，每 20% 变色；100% 短暂展示后消失
- 底部摘要：`已发送 X 封 · 用时 Y · 已完成 ✅`

## 结束条件（缺一不可）
- 后端活动状态从 `sending` 变为 `completed`（或用户点停止）
- 且本轮 `send_run` 已有，且尝试数 ≥ 计划数
- **禁止**在未点确认、无 send_run、或计划数为 0 时自动「完成」

## 禁止
- 未确认就自动开始发送/轮询（**已移除** sessionStorage 自动恢复 effect）
- 用活动历史最近 3 封冒充本轮
- **用「最近 3 封」行数推算尝试/进度**（最多 3 行会把 25/28 误显示成 3/28）
- 无 send_run 时用后端极小 planned 覆盖预览（如误显示 2/14）

## 计划数校准
- 有 `send_run_id` 且 `runPlannedTotal>0` 时，**以本轮后端校准计划为准**（排除本活动历史已发、去重后人数）
- 预览人数：已选活动时 `preview-count` 带 `campaignId`，与发送队列一致
- send_run 口径下对 sent/failed 再减 baseline（会导致「已发送 0 封」）
- 轮询短暂丢失 `send_run_id` 时让计数回退（须 `boundSendRunId` + 单调递增）

## 计数口径
- **尝试** = 本轮 `send-progress.attempted`（去重邮箱投递次数）
- **成功** = `sent`（已扣退回）
- **失败** = `failed`（SMTP 失败 + 退回，与统计页一致）；最近 3 封里 `sent`+退信事件显示「退回」

## Step 2（v2，2026-05-26 · 须部署 www 后验收）

**规则文件**：

- `.cursor/rules/lane-send-step2-stable.mdc` — 刷新、lite、三栏计数、发送中进度（**不含收尾**）
- `.cursor/rules/lane-send-finish-deferred.mdc` — **收尾暂缓**；末封/100%/汇报/completed 须用户开「收尾专项」

### 范围（Step 2 · 非收尾）

- 刷新：DB 仍 `sending` 且本专线占有 → **每页一次**恢复轮询（不 POST）
- 后端：`send-progress` 发送中仅 lite；连接池加大
- 轮询：POST 拿到 `sendRunId` 后才 poll；间隔 800ms
- 监控三栏：**尝试** / **投递成功** / **发送失败**（`failed` 去重）

### 收尾专项（2026-05-26）

- **末封与其它封相同**：正常 SMTP 发送，最近 3 封显示真实状态（发送中 → 成功/失败），**不**在 send-progress 里对末封单独 endgame / 不等 15s 再收尾
- 全部落库终态且 `attempted ≥ 计划` → `runDeliveryComplete` → 活动 **`completed`**
- UI：进度 **100%**（约 0.2s）→ **进度条消失** → 绿色多行汇报（活动 ID、名称、发送标签、已经发送 N 封 · 用时、发送时间）

验收：`deploy/watch-send-progress.sh` 见 `done=Y`、`camp=completed`。
