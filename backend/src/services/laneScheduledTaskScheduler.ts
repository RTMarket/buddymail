import type { Pool, RowDataPacket } from "mysql2/promise";

const POLL_INTERVAL_MS = 30_000; // 每 30 秒轮询一次
const CONFIRM_WAIT_SECONDS = 300; // 最多等 5 分钟（300 秒）

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * 专线特定时间发送任务调度器
 * - 每分钟检查到期需要执行的任务
 * - 如果专线空闲则自动执行
 * - 如果专线忙则标记为 pending_confirm，等用户确认（最长 5 分钟）
 * - 超时后强制接管
 */
export function startLaneScheduledTaskScheduler(db: Pool) {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => tick(db), POLL_INTERVAL_MS);
}

export function stopLaneScheduledTaskScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

async function tick(db: Pool) {
  try {
    // 找出所有到期或等待确认的任务
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT * FROM lane_scheduled_send_tasks
       WHERE status IN ('pending','pending_confirm')
         AND scheduled_at <= CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+08:00')
       ORDER BY scheduled_at ASC
       LIMIT 20`
    );

    for (const task of rows as any[]) {
      const id = Number(task.id);
      const tenantId = Number(task.tenant_id);
      const laneIndex = Number(task.lane_index);
      const campaignName = String(task.campaign_name ?? "");
      const targetIndustries: string[] = (() => {
        try {
          const parsed = JSON.parse(String(task.target_industries ?? "[]"));
          return Array.isArray(parsed) ? parsed.map(String) : [];
        } catch { return []; }
      })();
      const audienceCount = Number(task.audience_count ?? 0);

      // 检查该专线当前是否有发送中的活动（以 send_run 为准，避免依赖不存在的 legacy 列）
      const [[laneRow]] = await db.query<RowDataPacket[]>(
        `SELECT id FROM email_campaign_send_runs
         WHERE tenant_id = ? AND lane_index = ? AND status = 'sending'
         LIMIT 1`,
        [tenantId, laneIndex]
      );

      if (laneRow) {
        // 专线忙：检查是否已超过等待时间
        const [oldRows] = await db.query<RowDataPacket[]>(
          `SELECT TIMESTAMPDIFF(SECOND, updated_at, NOW()) AS wait_sec
           FROM lane_scheduled_send_tasks WHERE id = ?`,
          [id]
        );
        const waitSec = Number((oldRows as any)?.[0]?.wait_sec ?? 0);

        if (waitSec < CONFIRM_WAIT_SECONDS) {
          // 等待期内，保持 pending_confirm 状态让用户确认
          if (String(task.status ?? "") === "pending") {
            await db.query(
              `UPDATE lane_scheduled_send_tasks SET status = 'pending_confirm' WHERE id = ? AND status = 'pending'`,
              [id]
            );
          }
          // 如果用户已确认（前端调了确认接口），状态会变为 running
          continue;
        }

        // 超时 5 分钟：强制停止当前发送
        await db.query(
          `UPDATE email_campaign_send_runs SET status = 'stopped', finished_at = NOW()
            WHERE tenant_id = ? AND lane_index = ? AND status = 'sending'`,
          [tenantId, laneIndex]
        );
      }

      let campaignId = Number(task.campaign_id ?? 0);
      if (!campaignId) {
        campaignId = await pickUnsentCampaignForLane(db, tenantId, laneIndex);
      }
      if (!campaignId) {
        // 没有可用活动 ID，标记为失败
        await db.query(
          `UPDATE lane_scheduled_send_tasks SET status = 'failed', last_error = ? WHERE id = ?`,
          ["没有可用的未发送活动 ID，请为该专线新建活动后重新创建任务。", id]
        );
        continue;
      }

      // 标记任务为 running
      await db.query(
        `UPDATE lane_scheduled_send_tasks SET status = 'running', campaign_id = ?, executed_at = NOW() WHERE id = ?`,
        [campaignId, id]
      );

      // 调用外部执行函数（由 email.ts 提供）
      const { getLaneScheduledExecuteSend } = await import("../routes/laneScheduledTaskRoutes.js");
      const executeFn = getLaneScheduledExecuteSend();
      if (executeFn) {
        void executeFn({
          tenantId,
          laneIndex,
          campaignId,
          campaignName,
          targetIndustries
        })
          .then(async () => {
            await db.query(
              `UPDATE lane_scheduled_send_tasks
                  SET status = 'completed', completed_at = NOW()
                WHERE id = ? AND status = 'running'`,
              [id]
            );
          })
          .catch(async (e) => {
            const message = String((e as Error)?.message ?? e).slice(0, 4000);
            console.error(`[scheduled-task] execute send failed task=${id}`, e);
            await db.query(
              `UPDATE lane_scheduled_send_tasks
                  SET status = 'failed', completed_at = NOW(), last_error = ?
                WHERE id = ?`,
              [message, id]
            );
          });
      } else {
        await db.query(
          `UPDATE lane_scheduled_send_tasks SET status = 'failed', last_error = ? WHERE id = ?`,
          ["定时任务执行器未注册，请检查后端启动流程。", id]
        );
      }
    }
  } catch (e) {
    console.error("[lane-scheduled-task-scheduler] tick error:", e);
  }
}

async function pickUnsentCampaignForLane(db: Pool, tenantId: number, laneIndex: number): Promise<number> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT c.id
       FROM email_campaigns c
       INNER JOIN smtp_profiles sp ON sp.id = c.smtp_profile_id AND sp.tenant_id = c.tenant_id
       INNER JOIN email_dedicated_servers eds
               ON eds.smtp_profile_id = sp.id
              AND eds.tenant_id = c.tenant_id
              AND eds.status <> 'cancelled'
       INNER JOIN email_dedicated_vps_groups g
               ON g.id = eds.vps_group_id
              AND g.tenant_id = eds.tenant_id
      WHERE c.tenant_id = ?
        AND g.group_index = ?
        AND LOWER(COALESCE(c.status, '')) IN ('draft','scheduled','paused','stopped')
        AND NOT EXISTS (SELECT 1 FROM email_sends s WHERE s.campaign_id = c.id LIMIT 1)
      ORDER BY c.id ASC
      LIMIT 1`,
    [tenantId, laneIndex]
  );
  const id = Number((rows as any[])?.[0]?.id ?? 0);
  return Number.isFinite(id) && id > 0 ? id : 0;
}
