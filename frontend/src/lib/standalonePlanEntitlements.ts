import { standaloneLicensePlanTierId } from "./standaloneDeploy";

export type StandalonePlanEntitlementPreset = {
  domainSlots: number;
  vpsGroupSlots: number;
};

const PRESETS: Record<string, StandalonePlanEntitlementPreset> = {
  "email-send-30000": { domainSlots: 1, vpsGroupSlots: 1 },
  "email-send-60000": { domainSlots: 6, vpsGroupSlots: 2 }
};

export function resolveStandalonePlanEntitlements(
  planTierId?: string | null
): StandalonePlanEntitlementPreset | null {
  const id = (planTierId ?? standaloneLicensePlanTierId()).trim();
  if (!id) return null;
  return PRESETS[id] ?? null;
}
