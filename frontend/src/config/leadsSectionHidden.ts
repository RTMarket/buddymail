/** 独立站已开放 Leads 搜索（Apollo + Hunter）。 */
export const LEADS_SECTION_HIDDEN = false;

export function isLeadsSectionHiddenForEmail(_email: string | null | undefined): boolean {
  return LEADS_SECTION_HIDDEN;
}

export function isLeadsSectionHidden(): boolean {
  return LEADS_SECTION_HIDDEN;
}
