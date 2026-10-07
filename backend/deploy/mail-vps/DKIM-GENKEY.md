# OpenDKIM：生成密钥与回填后台

## 在哪台机器执行？

| 部署方式 | 建议 |
|----------|------|
| Relay 与 Mail **分机** | 在 **Relay（发信机）** 上签名出站邮件（与 Postfix 集成） |
| 单机合并 | 在该机执行即可 |

全文以下按 **Relay 发信机** 描述；若你司固定放在 Mail 机，团队内统一即可，但 Postfix 必须能读到私钥。

## 1. 安装与目录（Ubuntu/Debian 示例）

```bash
sudo apt-get update
sudo apt-get install -y opendkim opendkim-tools
sudo mkdir -p /etc/opendkim/keys
sudo chown -R opendkim:opendkim /etc/opendkim
```

## 2. 生成密钥（每个发件域一套）

**推荐（R19 脚本，幂等）** — 在 Relay 上：

```bash
sudo bash dkim-genkey.sh mail.customer.com
# 终端会打印 p= 整段，粘贴到 provision dkimPublicKey
```

手工方式（与脚本等价）：

```bash
DOMAIN="mail.customer.com"
SELECTOR="default"
sudo mkdir -p "/etc/opendkim/keys/${DOMAIN}"
cd "/etc/opendkim/keys/${DOMAIN}"
sudo opendkim-genkey -b 2048 -d "${DOMAIN}" -s "${SELECTOR}" -v
sudo chown opendkim:opendkim "${SELECTOR}.private"
```

生成文件：

- `default.private` — **私钥，仅留 VPS，勿上传 Git、勿发给租户**
- `default.txt` — DNS TXT 草稿

## 3. 提取公钥 `p=`（给管理后台）

```bash
sudo cat "/etc/opendkim/keys/${DOMAIN}/${SELECTOR}.txt"
```

示例内容：

```text
default._domainkey.mail.customer.com. IN TXT ( "v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3..."
```

**只取 `p=` 后面到引号结束的一整段**（无空格、无换行），粘贴到：

- 管理后台 → 邮件营销服务开通 → **provision** 请求体 `dkimPublicKey`，或  
- 同页 PATCH `dnsRecords` 前重新生成 DNS。

系统会把其写入 `buildDedicatedDnsRecords` 的 DKIM TXT；若留空，租户端会看到「请替换为邮件 VPS 上生成的 DKIM 公钥…」占位文案。

## 4. 与 Postfix 集成（概要）

`/etc/opendkim.conf`（片段，按发行版调整）：

```text
Domain                  mail.customer.com
KeyFile                 /etc/opendkim/keys/mail.customer.com/default.private
Selector                default
Socket                  inet:8891@localhost
```

`/etc/postfix/main.cf`（片段）：

```text
milter_protocol = 2
milter_default_action = accept
smtpd_milters = inet:localhost:8891
non_smtpd_milters = inet:localhost:8891
```

```bash
sudo systemctl enable opendkim postfix
sudo systemctl restart opendkim postfix
```

多域：为每个 `sender_domain` 重复第 2 步，并在 OpenDKIM `KeyTable` / `SigningTable` 中登记（见 INSTALL-RELAY.md）。

## 5. 验收

```bash
# 本机
opendkim-testkey -d mail.customer.com -s default -vvv

# 外网（DNS 生效后）
dig +short TXT default._domainkey.mail.customer.com
```

管理后台 **生成 DNS 并推送给用户** 后，租户在专线页 **验证 DNS**，再 **测试发送**。

## 6. 与系统自动 DNS 的关系

- 推荐：先在本机生成 DKIM → provision 时带上 `dkimPublicKey` → 一次推送完整 DNS。  
- 若先 provision 再补密钥：更新 DKIM 后让管理员 **重新生成 DNS** 或 PATCH `dnsRecords`，租户需再次验证。

未来 **R21** 将从本机 SSH 自动读取 `default.txt` 并回填，无需手抄 `p=`。
