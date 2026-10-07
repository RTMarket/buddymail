/** 链接导入：HTML 主内容提取，通常 10–40 秒 */
export const EMAIL_TEMPLATE_LINK_IMPORT_TIMEOUT_MS = 120_000;

/** 上传图片识图：先插入截图，再识别文字排版（约 30–90 秒） */
export const EMAIL_TEMPLATE_VISION_IMPORT_TIMEOUT_MS = 120_000;

/** 测试识图能力：探针请求，最长约 60 秒 */
export const EMAIL_TEMPLATE_VISION_TEST_TIMEOUT_MS = 60_000;

/** 模版页内联图片上传（识图/电商助手） */
export const EMAIL_TEMPLATE_INLINE_UPLOAD_TIMEOUT_MS = 90_000;

/** 正文多语言翻译（长 HTML 可能 30–90 秒） */
export const EMAIL_TEMPLATE_TRANSLATE_TIMEOUT_MS = 120_000;
