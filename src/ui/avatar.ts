/**
 * Avatar der Lehrperson in den geführten Demos. Alle können ihn selbst
 * einstellen (Frisur, Bart, Brille …); die Wahl bleibt nur in diesem Browser
 * gespeichert und enthält keine Personendaten, nur das Aussehen.
 */
export const SKINS = ['#f6d7c3', '#eac1a0', '#d39c74', '#a8704b', '#6f4a33'] as const;
export const HAIR_COLORS = ['#2b2118', '#5a3a22', '#8b5a2b', '#c99a5b', '#e8d27a', '#9aa0a6', '#b23a3a'] as const;
export const SHIRTS = ['#1d5fd6', '#16a34a', '#d97706', '#7c3aed', '#be123c', '#334155'] as const;
export const HAIR_STYLES = ['short', 'side', 'curly', 'long', 'bun', 'bald'] as const;
export const BEARDS = ['none', 'stubble', 'full', 'moustache'] as const;
export const GLASSES = ['none', 'round', 'square'] as const;
export const EXTRAS = ['none', 'headset', 'cap'] as const;

export interface AvatarConfig {
  skin: number;
  hair: (typeof HAIR_STYLES)[number];
  hairColor: number;
  beard: (typeof BEARDS)[number];
  glasses: (typeof GLASSES)[number];
  shirt: number;
  extra: (typeof EXTRAS)[number];
}

export const DEFAULT_AVATAR: AvatarConfig = { skin: 1, hair: 'short', hairColor: 1, beard: 'stubble', glasses: 'square', shirt: 0, extra: 'headset' };

const KEY = 'netzwerk-simulator.avatar';

const pick = <T extends readonly unknown[]>(list: T, value: unknown, fallback: T[number]): T[number] => (list.includes(value) ? (value as T[number]) : fallback);
const index = (length: number, value: unknown, fallback: number) => (Number.isInteger(value) && (value as number) >= 0 && (value as number) < length ? (value as number) : fallback);

/** Unvollständige oder fremde Werte durch die Grundeinstellung ersetzen. */
export function normalizeAvatar(raw: unknown): AvatarConfig {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_AVATAR;
  return {
    skin: index(SKINS.length, o.skin, d.skin),
    hair: pick(HAIR_STYLES, o.hair, d.hair),
    hairColor: index(HAIR_COLORS.length, o.hairColor, d.hairColor),
    beard: pick(BEARDS, o.beard, d.beard),
    glasses: pick(GLASSES, o.glasses, d.glasses),
    shirt: index(SHIRTS.length, o.shirt, d.shirt),
    extra: pick(EXTRAS, o.extra, d.extra),
  };
}

export function loadAvatar(): AvatarConfig {
  try {
    return normalizeAvatar(JSON.parse(window.localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_AVATAR };
  }
}

export function saveAvatar(config: AvatarConfig) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    // Ohne Speicher gilt die Wahl bis zum Neuladen.
  }
}

export function randomAvatar(random: () => number = Math.random): AvatarConfig {
  const any = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)]!;
  const n = (length: number) => Math.floor(random() * length);
  return { skin: n(SKINS.length), hair: any(HAIR_STYLES), hairColor: n(HAIR_COLORS.length), beard: any(BEARDS), glasses: any(GLASSES), shirt: n(SHIRTS.length), extra: any(EXTRAS) };
}
