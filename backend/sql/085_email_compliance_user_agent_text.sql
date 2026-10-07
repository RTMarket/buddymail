-- 微信/移动端 WebView 的 User-Agent 可超过 255 字符；避免收件人点击订阅/退订时写入失败导致后端崩溃。

ALTER TABLE email_subscribe_events
  MODIFY user_agent TEXT NULL;

ALTER TABLE email_unsubscribe_events
  MODIFY user_agent TEXT NULL;
