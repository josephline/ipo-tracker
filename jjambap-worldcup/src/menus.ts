export interface Menu {
  id: string;
  name: string;
  emoji: string;
}

export const DEFAULT_MENUS: Menu[] = [
  { id: 'jeyuk', name: '제육볶음', emoji: '🥩' },
  { id: 'donkatsu', name: '돈까스', emoji: '🍖' },
  { id: 'dakbokkeum', name: '닭볶음탕', emoji: '🍗' },
  { id: 'curry', name: '카레라이스', emoji: '🍛' },
  { id: 'jjajang', name: '짜장밥', emoji: '🍝' },
  { id: 'bulgogi', name: '불고기', emoji: '🥘' },
  { id: 'kimchijjigae', name: '김치찌개', emoji: '🍲' },
  { id: 'doenjang', name: '된장찌개', emoji: '🫕' },
  { id: 'gundaeria', name: '군대리아', emoji: '🍔' },
  { id: 'nugget', name: '치킨너겟', emoji: '🐔' },
  { id: 'tteokbokki', name: '떡볶이', emoji: '🌶️' },
  { id: 'ramen', name: '뽀글이', emoji: '🍜' },
  { id: 'sausage', name: '소시지야채볶음', emoji: '🌭' },
  { id: 'mackerel', name: '고등어구이', emoji: '🐟' },
  { id: 'squid', name: '오징어볶음', emoji: '🦑' },
  { id: 'mandu', name: '군만두', emoji: '🥟' },
];

const EMOJI_POOL = ['🍱', '🍚', '🥗', '🍳', '🥓', '🍤', '🧆', '🥙', '🍙', '🥞'];

export function makeMenu(name: string): Menu {
  return {
    id: `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim(),
    emoji: EMOJI_POOL[Math.floor(Math.random() * EMOJI_POOL.length)],
  };
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function roundLabel(size: number): string {
  return size === 2 ? '결승' : `${size}강`;
}
