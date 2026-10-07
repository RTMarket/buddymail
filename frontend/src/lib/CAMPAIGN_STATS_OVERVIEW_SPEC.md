# 营销活动统计页 · 概览卡片（全部轮次）

**范围：** `CampaignActivityStats` 内白底卡片「当前活动发送概览（全部轮次合计）」— 含顶部三栏、折线图、轮次表。  
**不改：** 8 项指标栏、轮次下拉、发送名单、租户区间、订阅/投诉等其它区块。

## 8 栏（单次发送明细 · 锁定口径）

| 栏位 | 含义 |
|------|------|
| **发信总数** | 总发信量 = **已送达 + 失败**（含成功与 postfix/SMTP 失败） |
| **已送达（真实）** | 真实投递成功，**不含**退信、拒收、发送异常、postfix_deferred |
| **已退回** | 失败 X 封 = `postfix_deferred`（按本活动发信邮箱）+ `email_sends` failed/suppressed |

实现见 `email-campaign-stats-page-stable.mdc` 与 `mergeListMetricsIntoSummary`。

## 顶部三栏（本活动 ID · 全部轮次累计）

| 栏位 | 含义 | 数据来源 |
|------|------|----------|
| **总轮次** | 已创建的发送轮次数 | `send-runs` 条数；无列表时用 `latest_round_no` |
| **总发信量** | **投递次数**（尝试次数）：含发送成功、SMTP 失败、退回等所有计入投递的结果 | 优先 Σ 各轮 `(success_count + fail_count)`；与 `stats.summary` 的 `successCount + failCount` 同口径（成功已扣退回，失败含退回扣减） |
| **发信成功** | 送达成功数（已扣退回） | 优先 Σ 各轮 `success_count`；否则 `summary.successCount` |

**口径说明（必记）：**  
「总发信量」≠ 仅成功，也≠ 计划人数；= **实际产生过的投递尝试次数**（与运营理解的「发了几封」一致）。

## 折线图（各轮次发信成功趋势）

- **一点一轮**：第 N 轮 → 一个数据点（11 轮 → 11 个点）。
- **纵轴 Y**：该轮 **发信成功** 数（`success_count`，已扣退回）。
- **横轴 X**：该轮 **开始发送时间** `started_at`（缺失则用 `ended_at`），按真实时间映射，禁止等距假时间轴。
- **数据：** 方案 A — 仅用已有 `GET /api/email/campaigns/:id/send-runs`，不依赖按日聚合的 `stats.series`。
- **缩放条：** 底部提供可拖动/滑动的视窗控制；收窄视窗 → 细到小时级；放宽 → 日 / 周 / 月级浏览。点位与底部时间刻度对齐。
- **悬停：** 第 N 轮 · 成功 X · 开始时间 …

## 轮次表

- 最多 **可见 3 行**，超出 **纵向滚动**；表头 sticky；点击选轮联动下方 8 栏逻辑不变。

## 禁止

- 概览折线改回 `stats.series` 按自然日叠加。
- 改动专线栏 `laneSend*` / `LaneFormalSendPanel`（另一套规则）。
