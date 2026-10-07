-- 中量/巨量专线：一组 = 25 端口发信 VPS（relay）+ PTR 反向解析 VPS（ptr）
ALTER TABLE email_dedicated_servers
  ADD COLUMN relay_ip VARCHAR(45) NULL COMMENT 'SMTP 发信机（通常开放 587/25）' AFTER ip_address,
  ADD COLUMN ptr_ip VARCHAR(45) NULL COMMENT 'PTR / 出站信誉机 IP' AFTER relay_ip,
  ADD COLUMN ptr_hostname VARCHAR(253) NULL COMMENT 'PTR 目标主机名，一般与 sender_domain 一致' AFTER ptr_ip;
