import { createPool } from "mysql2/promise";
import { env } from "./env.js";

function mysqlPoolOptions(connectionLimit: number, queueLimit: number) {
  return {
    host: env.MYSQL_HOST,
    port: env.MYSQL_PORT,
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    database: env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit,
    queueLimit,
    connectTimeout: 10_000
  };
}

/**
 * 登录 / Bearer 校验 / 个人中心首屏（product-modules）专用池。
 * 与 send-progress 轮询、executeCampaignSend 写入分离，避免「发信中无法登录」。
 */
export const dbAuth = createPool(
  mysqlPoolOptions(
    Math.max(8, Math.min(24, Number(process.env.MYSQL_AUTH_POOL_LIMIT || 12))),
    Math.max(16, Math.min(64, Number(process.env.MYSQL_AUTH_POOL_QUEUE_LIMIT || 48)))
  )
);

/** 营销活动、发送 worker、统计与诊断等业务查询 */
export const db = createPool(
  mysqlPoolOptions(
    Math.max(20, Math.min(80, Number(process.env.MYSQL_POOL_LIMIT || 48))),
    Math.max(32, Math.min(128, Number(process.env.MYSQL_POOL_QUEUE_LIMIT || 64)))
  )
);
