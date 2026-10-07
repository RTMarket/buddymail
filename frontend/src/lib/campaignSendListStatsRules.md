# 营销活动发送名单统计口径（锁定）

与后端 `backend/src/services/CAMPAIGN_SEND_LIST_STATS_RULES.md` 一致。  
**修改 `campaignSendContactsList.ts` 或 tab 筛选逻辑前须双方文档同步更新。**

- Tab 计数与分页名单使用相同筛选（含日期、发件邮箱）。
- 仅展示 **CRM 仍存在** 的联系人（`email_contacts`）；删除联系人后应从各 tab 消失。
- 退回/失败 = 同步 `failed` ∪ 退信事件 `bounced`（联系人维度去重）。
- 列表删除 = 删除 CRM 联系人；历史 `email_sends` 保留，但不再计入名单。
