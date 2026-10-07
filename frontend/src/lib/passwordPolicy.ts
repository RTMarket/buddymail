/** 与注册 / 登录 / 个人中心一致的登录密码规则：6 位字母或数字 */
const PASSWORD_PATTERN = /^[A-Za-z0-9]{6}$/;

export function validateLoginPassword(pw: string): string | null {
  if (!PASSWORD_PATTERN.test(pw)) {
    return "密码须为 6 位，仅可使用英文字母与数字（可全字母、全数字或混合）";
  }
  return null;
}
