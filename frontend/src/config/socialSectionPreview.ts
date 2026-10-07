/** 独立站无社交媒体 */
export function canAccessSocialSectionFeatures(_email: string | null | undefined): boolean {
  return false;
}

export function isSocialSectionPreviewEnforced(): boolean {
  return false;
}
