# 营销活动发送名单 · 统计口径（已锁定）

**请勿在未与产品确认的情况下修改 `campaignSendContactsList.ts` 中的计数/筛选逻辑。**  
性能优化只能改查询方式（索引、分页、缓存），不能改下列业务定义。

## 数据范围

- 以 `email_sends` 为主表，按 **联系人维度**（`contact_id`）聚合。
- 仅统计 **当前仍存在于 CRM** 的联系人：`INNER JOIN email_contacts`（删除联系人后不再出现在名单与 tab 计数中）。
- 尊重活动页的 **日期范围** 与 **发件邮箱** 筛选；若范围内无发送记录但活动有历史发送，则自动回退为「本活动全部时间」。

## Tab 计数（`tab-totals` / `skipImap=1` / `fast=1`）

| Tab | 口径 |
|-----|------|
| **全量** | 本活动（+筛选）下至少有一条 `email_sends` 的去重 `contact_id` 数 |
| **已打开** | 存在 `email_delivery_events.event_type = 'opened'` 且关联到该联系人本活动发送记录 |
| **发送成功** | 至少一条 `email_sends.status IN ('sent','delivered')` |
| **退回/失败** | 去重 `contact_id`：`failed/suppressed/skipped` ∪ 退信(`email_send_id`) ∪ `postfix_deferred`；**不是**失败事件次数累加 |
| **发送成功（7 栏）** | 有 `sent/delivered` 且不在失败集合内；**勿**与失败联系人重复叠加（`success = min(successRaw, all − failed)`） |

7 栏 `summaryFailCount` 与上表失败 tab **同一去重联系人口径**。

## 列表分页（`send-contacts` 快速路径）

- 与各 tab 计数使用 **相同筛选条件**；分页先取 `contact_id`，再批量补打开/退信/发送次数。
- **已打开** 默认按打开次数降序；**全量/成功** 在 `sort=opens_desc` 时按打开次数排序。
- 行内 **成功次数** 展示：`max(0, send_count - bounce_like_count)`，其中 `bounce_like_count = sync_failed + bounced 事件数`。

## 删除联系人

- 列表内「删除」= 删除 CRM 联系人（`/api/email/contacts/:id`），**不**删除历史 `email_sends` 行。
- 删除后该联系人因不再满足 `INNER JOIN email_contacts`，应从各 tab 名单与计数中消失；服务端需 `invalidateCampaignSendListCache(campaignId)`。

## 缓存

- 服务端进程内 TTL 默认 120s（`CAMPAIGN_SEND_LIST_CACHE_TTL_MS`）。
- 客户端内存缓存 TTL 5 分钟；删除联系人时两侧均需失效。
