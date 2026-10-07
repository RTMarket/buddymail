# Mail / PTR VPS 安装要点

**角色**：**反向 DNS（rDNS）** 指向的主机名；**Dovecot IMAP 993** 收退信（DSN）；可选入站 25。

**易错**：`BOUNCE_IMAP_HOST`、LA `.env` 里退信 IMAP 必须指向 **本机（ptr_ip / Mail 机）**，**不要**填 Relay 发信机 IP。

## 云厂商 PTR（必须先做）

在 **ptr_ip** 所在账号设置 **反向解析** → `ptr_hostname`（通常与发件子域相同，如 `mail.customer.com`）。

正向 DNS 的 **A 记录**（`ptrHostname`，通常即发件子域 → `ptr_ip`）由租户在域名服务商添加；平台推送的 DNS 清单已自动包含该 A 记录（与 `buildDedicatedDnsRecords` 一致）。

## 一键装机（R19，推荐空白机）

```bash
# 云厂商先在 ptr_ip 设好 rDNS → ptr_hostname
sudo bash install-mail.sh
# 或装机时顺带建退信邮箱：
sudo BOUNCE_MAIL_USER='info@mail.customer.com' BOUNCE_MAIL_PASSWORD='与 provision 一致' bash install-mail.sh
sudo bash dovecot-user-add.sh 'info@mail.customer.com' '密码'   # 后续加用户
sudo bash install-mail.sh --check
```

## Dovecot 993（手工装时）

```bash
sudo apt-get update
sudo apt-get install -y dovecot-imapd dovecot-core
```

### 退信邮箱用户

邮箱地址与租户 `from_email` 或专用退信地址一致，例如 `info@mail.customer.com`。

用户行格式见 [dovecot-users-line.example.txt](./dovecot-users-line.example.txt)：

```bash
sudo doveadm pw -s SHA512-CRYPT -p '与后台SMTP密码一致'
# 写入 /etc/dovecot/users 或 passwd-file
sudo systemctl reload dovecot
doveadm auth test 'info@mail.customer.com'
```

密码须与：

- 管理后台 provision 的 `smtpPassword`  
- Relay 上 SASL（若共用认证）  

保持一致。

## Postfix（Mail 机）

双机架构下 Mail 机主要 **收退信**；若 DSN 进入 `info@...` 的 INBOX，需保证：

- 要么本机 Postfix 接收该域邮件并投递到 Dovecot；  
- 要么 Relay 将退信/退送回 Mail 机（按你们路由设计）。

具体 `virtual_mailbox_maps` / LMTP 与现网保持一致，本文不强制单一拓扑。

## 业务机拉退信（LA）

| 模式 | 配置 |
|------|------|
| **单租户 / 兜底** | `backend/.env` 中 `BOUNCE_IMAP_HOST=<Mail机 ptr_ip>` |
| **多租户（推荐方向）** | `BOUNCE_IMAP_ALLOW_DB_SOURCES=1`，由 `smtp_profiles` + `email_dedicated_servers` 枚举邮箱；注意当前实现中 IMAP 主机取自 `smtp_profiles.host`（provision 时为 relay_ip），**若 Relay≠Mail 两台分离**，需以 Mail 机为准：可暂用 `.env` 指向 Mail，或待后续改造为使用 `ptr_ip` 拉 IMAP |

专线记录处于 `ready` / `awaiting_dns` / `provisioning` 时，后端会尝试用对应 SMTP 账号扫 INBOX。

## 可选：deferred 队列上报

见 [`../mail-vps-deferred-reporter.sh`](../mail-vps-deferred-reporter.sh)：

- 业务机 `INTERNAL_MAIL_REPORT_TOKEN`  
- Mail 机 cron 每 5 分钟 POST `/api/internal/postfix-deferred`

主文档 **阶段 G** 已标为可选、代码已实现。

## 验收

```bash
sudo systemctl status dovecot
sudo ss -lntp | grep 993
# 业务机 pm2 logs | grep imap-bounce
```

租户测试发送后，Mail 机 `info@...` 的 INBOX 应出现 DSN；统计页「退信再次检查」有数据。
