import { Client, type SFTPWrapper } from "ssh2";
import fs from "node:fs";
import path from "node:path";
import type { Env } from "../env.js";

export type MailVpsSshTarget = {
  host: string;
  port: number;
  username: string;
  password: string;
};

export function resolveMailVpsScriptDirs(env: Env): { localDir: string; remoteDir: string } {
  const localDir = (env.EMAIL_DEDICATED_MAIL_VPS_SCRIPTS_DIR ?? "/opt/buddymail/deploy/mail-vps").trim();
  const remoteDir = (env.EMAIL_DEDICATED_VPS_REMOTE_SCRIPTS_DIR ?? "/root/mail-vps").trim();
  return { localDir, remoteDir };
}

function sftpMkdir(sftp: SFTPWrapper, remote: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.mkdir(remote, { mode: 0o755 }, (err) => {
      if (!err) return resolve();
      const code = (err as { code?: number }).code;
      if (code === 4) return resolve();
      reject(err);
    });
  });
}

function sftpFastPut(sftp: SFTPWrapper, local: string, remote: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.fastPut(local, remote, (err) => (err ? reject(err) : resolve()));
  });
}

function sftpChmod(sftp: SFTPWrapper, remote: string, mode: number): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.chmod(remote, mode, (err) => (err ? reject(err) : resolve()));
  });
}

async function sftpUploadTree(sftp: SFTPWrapper, localDir: string, remoteDir: string): Promise<void> {
  await sftpMkdir(sftp, remoteDir);
  for (const name of fs.readdirSync(localDir)) {
    if (name.startsWith(".")) continue;
    const lp = path.join(localDir, name);
    const rp = `${remoteDir}/${name}`;
    const st = fs.statSync(lp);
    if (st.isDirectory()) {
      await sftpUploadTree(sftp, lp, rp);
    } else {
      await sftpFastPut(sftp, lp, rp);
      if (name.endsWith(".sh")) {
        await sftpChmod(sftp, rp, 0o755);
      }
    }
  }
}

/** 业务机 localDir → Relay/Mail 机 remoteDir（与一键装机 SCP 路径一致） */
export async function syncMailVpsScriptsToHost(
  target: MailVpsSshTarget,
  localDir: string,
  remoteDir: string,
  timeoutMs: number
): Promise<void> {
  if (!fs.existsSync(localDir)) {
    throw new Error(`业务机缺少 mail-vps 脚本目录：${localDir}`);
  }
  await new Promise<void>((resolve, reject) => {
    const conn = new Client();
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error(`SSH SFTP 超时：${target.host}`));
    }, timeoutMs);

    conn
      .on("ready", () => {
        conn.sftp((err, sftp) => {
          if (err) {
            clearTimeout(timer);
            conn.end();
            reject(err);
            return;
          }
          sftpUploadTree(sftp, localDir, remoteDir)
            .then(() => {
              clearTimeout(timer);
              conn.end();
              resolve();
            })
            .catch((e) => {
              clearTimeout(timer);
              conn.end();
              reject(e);
            });
        });
      })
      .on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      })
      .connect({
        host: target.host,
        port: target.port,
        username: target.username,
        password: target.password,
        readyTimeout: Math.min(timeoutMs, 25_000),
        hostVerifier: () => true
      });
  });
}

export function tailSshOutput(stdout: string, stderr: string, max = 1200): string {
  const combined = `${stdout}\n${stderr}`.trim();
  if (combined.length <= max) return combined;
  return combined.slice(-max);
}
