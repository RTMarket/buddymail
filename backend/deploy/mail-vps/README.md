# 邮件 VPS 附录（Relay + Mail 双机）

本目录为 [`../DEDICATED-VPS-ONBOARDING-ZH.md`](../DEDICATED-VPS-ONBOARDING-ZH.md) 的操作附录，**不要**把 root 密码写进这些文件或 Git。

文档/代码改错时的对照与回滚：[`../DUAL-VPS-BACKUP-INDEX-ZH.md`](../DUAL-VPS-BACKUP-INDEX-ZH.md)。

## 文档

| 文件 | 用途 |
|------|------|
| [INSTALL-RELAY.md](./INSTALL-RELAY.md) | 发信机：Postfix 587/25 + SASL + OpenDKIM |
| [INSTALL-MAIL.md](./INSTALL-MAIL.md) | Mail/PTR 机：Dovecot 993、退信收件、PTR 说明 |
| [DKIM-GENKEY.md](./DKIM-GENKEY.md) | OpenDKIM 生成公钥、提取 `p=`、回填后台 |

## R19 幂等装机脚本（在 VPS 上执行）

将本目录 `scp` 到目标机后，在 **Relay** / **Mail** 分别执行（Ubuntu/Debian）：

| 脚本 | 机器 | 说明 |
|------|------|------|
| [install-relay.sh](./install-relay.sh) | Relay | 装 Postfix + OpenDKIM + 587；已装跳过 |
| [install-mail.sh](./install-mail.sh) | Mail/PTR | 装 Dovecot 993；已装跳过 |
| [dkim-genkey.sh](./dkim-genkey.sh) | Relay | 每发件域一套 DKIM，打印 `p=` |
| [relay-smtp-sync.sh](./relay-smtp-sync.sh) | Relay | **推荐** 按 `smtpd_sasl_type` 自动写 Dovecot 或 sasldb |
| [smtp-user-add.sh](./smtp-user-add.sh) | Relay | 仅当 `smtpd_sasl_type=cyrus`（sasldb） |
| [dovecot-user-add.sh](./dovecot-user-add.sh) | Mail | 退信 INBOX 用户 |
| [lib.sh](./lib.sh) | — | 共享库，勿直接运行 |

```bash
# 示例：空白 Relay
cd /root/mail-vps   # 或你 scp 到的路径
sudo bash install-relay.sh
sudo bash smtp-user-add.sh 'info@mail.customer.com' '与后台一致'
sudo bash dkim-genkey.sh mail.customer.com

# 示例：空白 Mail（可选环境变量一次建用户）
sudo BOUNCE_MAIL_USER='info@mail.customer.com' BOUNCE_MAIL_PASSWORD='…' bash install-mail.sh
```

**安全**

- 默认 **幂等**：`/var/lib/bigsocialboss-mail-vps/*.done` 存在则跳过整机步骤。  
- `--force` 须 `BSS_ALLOW_FORCE=1`，**禁止对生产机盲目 force**；仅替换带 `bigsocialboss-mail-vps` 标记的配置块。  
- `--check` 只验收服务/端口，不改系统。

装机完成后回到主文档 **阶段 B**，在管理后台 **provision-server-group**。

## 其它

| 文件 | 用途 |
|------|------|
| [dovecot-users-line.example.txt](./dovecot-users-line.example.txt) | Dovecot 用户行示例 |
| [../mail-vps-deferred-reporter.sh](../mail-vps-deferred-reporter.sh) | Mail 机 cron 上报 Postfix deferred（可选，R25） |

自动化队列与后台一键 DKIM 见整改清单 **R20、R21**；**R23** 租户工作台机组区「检查/装机 Relay|Mail」（`EMAIL_DEDICATED_VPS_INSTALL_ENABLED=1`）。
