import { getItem, setItem } from './bridge';
import { DEFAULT_MENUS, type Menu } from './menus';

const MENUS_KEY = 'jjambap.menus.v1';
const STATS_KEY = 'jjambap.stats.v1';

/** 메뉴별 누적 기록: 우승 횟수, 1:1 승리 횟수, 1:1 출전 횟수 */
export interface MenuStat {
  wins: number;
  picks: number;
  matches: number;
}
export type Stats = Record<string, MenuStat>;

export async function loadMenus(): Promise<Menu[]> {
  const raw = await getItem(MENUS_KEY);
  if (!raw) return DEFAULT_MENUS;
  try {
    const parsed = JSON.parse(raw) as Menu[];
    return Array.isArray(parsed) && parsed.length >= 4 ? parsed : DEFAULT_MENUS;
  } catch {
    return DEFAULT_MENUS;
  }
}

export const saveMenus = (menus: Menu[]) => setItem(MENUS_KEY, JSON.stringify(menus));

export async function loadStats(): Promise<Stats> {
  const raw = await getItem(STATS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Stats;
  } catch {
    return {};
  }
}

export const saveStats = (stats: Stats) => setItem(STATS_KEY, JSON.stringify(stats));

export function recordMatch(stats: Stats, winnerId: string, loserId: string): Stats {
  const get = (id: string): MenuStat => stats[id] ?? { wins: 0, picks: 0, matches: 0 };
  const w = get(winnerId);
  const l = get(loserId);
  return {
    ...stats,
    [winnerId]: { ...w, picks: w.picks + 1, matches: w.matches + 1 },
    [loserId]: { ...l, matches: l.matches + 1 },
  };
}

export function recordChampion(stats: Stats, id: string): Stats {
  const s = stats[id] ?? { wins: 0, picks: 0, matches: 0 };
  return { ...stats, [id]: { ...s, wins: s.wins + 1 } };
}
