# 发信 VPS（Relay）安装要点

**角色**：租户邮件 **出站**；Postfix **587（提交）+ 25（投递）**；SASL 认证；OpenDKIM 签名。

**不要**在本机跑 Dovecot 退信邮箱（除非你们刻意单机合并）——退信 INBOX 在 [INSTALL-MAIL.md](./INSTALL-MAIL.md) 的 Mail/PTR 机。

## 网络与安全组

| 方向 | 端口 | 说明 |
|------|------|------|
| 入站 | 587 | 业务 LA / 租户 SMTP 提交 |
| 入站 | 25 | 按需（通常出站为主） |
| 出站 | 25 | 对外域投递 |

## 一键装机（R19，推荐空白机）

```bash
# 将 deploy/mail-vps 目录 scp 到 Relay 后：
sudo bash install-relay.sh
sudo bash install-relay.sh --check          # 仅验收
sudo bash smtp-user-add.sh 'info@mail.customer.com' '与后台 smtpPassword 一致'
sudo bash dkim-genkey.sh mail.customer.com  # 复制输出的 p= 到 provision
```

已上线机 **不要** 盲目 `BSS_ALLOW_FORCE=1 … --force`；多域仅再跑 `dkim-genkey.sh`。

脚本使用 **sasldb**（`smtpd_sasl_type = cyrus`）。若你现网已是 Dovecot SASL，请勿 force，只手工加 DKIM。

## 软件包（Debian/Ubuntu，手工装时）

```bash
sudo apt-get update
sudo apt-get install -y postfix libsasl2-modules sasl2-bin opendkim opendkim-tools
```

安装 Postfix 时：

- 「Internet Site」或「Satellite」按是否需要本机收信选择；**双机分离** 时 Relay 可不收用户邮件。  
- 系统邮件名可填 `mail.customer.com`（发件域）。

## Postfix：提交端口 587 + SASL

`/etc/postfix/main.cf` 常见片段（**按现网已有配置合并，勿整文件覆盖**）：

```text
smtpd_tls_security_level = may
smtpd_sasl_auth_enable = yes
smtpd_sasl_type = dovecot
broken_sasl_auth_clients = yes
smtpd_recipient_restrictions = permit_sasl_authenticated, reject_unauth_destination
```

若 SASL 走 Dovecot auth socket（Mail 机认证）或 `sasldb`，与你们现网一致即可；**专线租户密码**须与后台录入的 `smtpPassword`、Mail 机 Dovecot 一致。

`/etc/postfix/master.cf` 启用 `submission`（587）。

## OpenDKIM

见 [DKIM-GENKEY.md](./DKIM-GENKEY.md)。每增加一个发件域，增加一对密钥 + SigningTable 行。

## 与业务系统的关系

- 管理后台 `provision-server-group` 写入 `smtp_profiles.host = relay_ip`、`port = 587`。  
- SPF 由 LA 生成，包含 **relay_ip + ptr_ip** 两个 IPv4。

## 幂等与复用

- **同一 Relay 服务多租户、多域**（未来「一组双机多域」）：不要重复 `apt install` 毁坏现有 `main.cf`；仅 **新增** OpenDKIM 域密钥与 Postfix 发件人限制。  
- 新购空白机：可按本文从零装；已上线机：只加域，见 DKIM 文档。

## 验收

```bash
sudo postfix status
sudo ss -lntp | grep -E ':587|:25'
# 从业务机或 swaks 测 587 认证发信
```

完成后回到主文档 **阶段 B**，在管理后台 provision。
