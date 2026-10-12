export type InjectionSite = 'ABDOMEN_LEFT' | 'ABDOMEN_RIGHT' | 'THIGH_LEFT' | 'THIGH_RIGHT' | 'ARM_LEFT' | 'ARM_RIGHT';

/** Left and right are the patient's own. */
export const SITE_LABEL: Record<InjectionSite, string> = {
  ABDOMEN_LEFT: 'Belly, left',
  ABDOMEN_RIGHT: 'Belly, right',
  THIGH_LEFT: 'Thigh, left',
  THIGH_RIGHT: 'Thigh, right',
  ARM_LEFT: 'Upper arm, left',
  ARM_RIGHT: 'Upper arm, right',
};

/**
 * The order to go round in. Each step changes both the area and the side, so back-to-back
 * injections are never close together (the same spot used again and again can leave lumps).
 */
export const SITE_ROTATION: InjectionSite[] = ['ABDOMEN_LEFT', 'THIGH_RIGHT', 'ARM_LEFT', 'ABDOMEN_RIGHT', 'THIGH_LEFT', 'ARM_RIGHT'];

/** Where to inject next, given where the last one went. With no history, start at the first spot. */
export function suggestNextSite(last: InjectionSite | null | undefined): InjectionSite {
  const i = last ? SITE_ROTATION.indexOf(last) : -1;
  return SITE_ROTATION[(i + 1) % SITE_ROTATION.length];
}

/** The newest dose (from a list in any order) that has a recorded site. */
export function lastSiteOf(doses: { status: string; scheduledFor: string; injectionSite?: string | null }[]): InjectionSite | null {
  const withSite = doses
    .filter((d) => d.status === 'TAKEN' && d.injectionSite)
    .sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor));
  return (withSite[0]?.injectionSite as InjectionSite | undefined) ?? null;
}
