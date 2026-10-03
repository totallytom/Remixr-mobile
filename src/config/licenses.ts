import i18n from '../i18n';

// Track licences the artist can choose (tracks.license_type).
// Keep in sync with sypher/src/config/licenses.ts (website) and the
// tracks_license_type_check constraint.

export type LicenseType =
  | 'all_rights_reserved'
  | 'cc_by'
  | 'cc_by_sa'
  | 'cc_by_nc'
  | 'cc_by_nc_sa'
  | 'cc_by_nd'
  | 'cc_by_nc_nd'
  | 'cc_zero';

export interface LicenseInfo {
  value: LicenseType;
  /** Short badge text, e.g. "CC BY-NC". */
  short: string;
  /** Full name. */
  name: string;
  /** What listeners may do, in plain words. */
  summary: string;
  /** Creative Commons deed; none for All rights reserved. */
  url?: string;
  allowsRemix: boolean;
  allowsCommercial: boolean;
}

export const LICENSES: LicenseInfo[] = [
  {
    value: 'all_rights_reserved', short: '© All rights reserved', name: 'All rights reserved',
    summary: 'You keep every right. Others can listen on Re-Mixed but can’t reuse your track without asking.',
    allowsRemix: false, allowsCommercial: false,
  },
  {
    value: 'cc_by', short: 'CC BY', name: 'Creative Commons Attribution 4.0',
    summary: 'Anyone can share, remix and use it, even commercially, as long as they credit you.',
    url: 'https://creativecommons.org/licenses/by/4.0/', allowsRemix: true, allowsCommercial: true,
  },
  {
    value: 'cc_by_sa', short: 'CC BY-SA', name: 'Creative Commons Attribution-ShareAlike 4.0',
    summary: 'Like CC BY, but remixes must be shared under the same licence.',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/', allowsRemix: true, allowsCommercial: true,
  },
  {
    value: 'cc_by_nc', short: 'CC BY-NC', name: 'Creative Commons Attribution-NonCommercial 4.0',
    summary: 'Anyone can share and remix it with credit, but not to make money.',
    url: 'https://creativecommons.org/licenses/by-nc/4.0/', allowsRemix: true, allowsCommercial: false,
  },
  {
    value: 'cc_by_nc_sa', short: 'CC BY-NC-SA', name: 'Creative Commons Attribution-NonCommercial-ShareAlike 4.0',
    summary: 'Non-commercial sharing and remixing with credit; remixes use the same licence.',
    url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/', allowsRemix: true, allowsCommercial: false,
  },
  {
    value: 'cc_by_nd', short: 'CC BY-ND', name: 'Creative Commons Attribution-NoDerivatives 4.0',
    summary: 'Anyone can share it as-is with credit, but no remixes or edits.',
    url: 'https://creativecommons.org/licenses/by-nd/4.0/', allowsRemix: false, allowsCommercial: true,
  },
  {
    value: 'cc_by_nc_nd', short: 'CC BY-NC-ND', name: 'Creative Commons Attribution-NonCommercial-NoDerivatives 4.0',
    summary: 'Share it as-is with credit, non-commercially. No remixes.',
    url: 'https://creativecommons.org/licenses/by-nc-nd/4.0/', allowsRemix: false, allowsCommercial: false,
  },
  {
    value: 'cc_zero', short: 'CC0', name: 'CC0 1.0 Public Domain Dedication',
    summary: 'You give up your rights: anyone can do anything with it, no credit needed.',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/', allowsRemix: true, allowsCommercial: true,
  },
];

export const DEFAULT_LICENSE: LicenseType = 'all_rights_reserved';

/** Licence text in the app language (CC names and badges stay as-is). */
export function licenseText(info: LicenseInfo): { short: string; name: string; summary: string } {
  const k = `licenses.${info.value}`;
  return {
    short: i18n.t(`${k}.short`, { defaultValue: info.short }),
    name: i18n.t(`${k}.name`, { defaultValue: info.name }),
    summary: i18n.t(`${k}.summary`, { defaultValue: info.summary }),
  };
}

export function licenseInfo(value?: string | null): LicenseInfo {
  return LICENSES.find((l) => l.value === value) ?? LICENSES[0];
}
