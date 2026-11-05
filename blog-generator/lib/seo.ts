// 생성된 마크다운 글의 SEO 상태를 점수로 계산한다. 외부 호출 없이 동작하는 순수 함수.

export interface SeoCheck {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
  weight: number;
}

export interface KeywordStat {
  keyword: string;
  count: number;
  /** 공백 제외 글자 수 대비 키워드 글자 비율(%) */
  density: number;
}

export interface SeoReport {
  score: number;
  charCount: number;
  charCountNoSpace: number;
  titleLength: number;
  h2Count: number;
  h3Count: number;
  keywords: KeywordStat[];
  checks: SeoCheck[];
}

/** 마크다운 기호를 걷어 낸 본문 텍스트 */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*\|?[\s:-]+\|[\s|:-]*$/gm, "")
    .replace(/\|/g, " ")
    .replace(/(\*\*|__|\*|_|~~)/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let count = 0;
  let idx = h.indexOf(n);
  while (idx !== -1) {
    count++;
    idx = h.indexOf(n, idx + n.length);
  }
  return count;
}

/** 본문의 첫 문단(제목·소제목 제외) */
function firstParagraph(md: string): string {
  const blocks = md.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocks.find((b) => !/^#{1,6}\s/.test(b)) ?? "";
}

export function analyzeSeo(params: { title: string; content: string; keywords: string[]; targetChars?: number }): SeoReport {
  const { title, content, keywords, targetChars } = params;
  const text = stripMarkdown(content);
  const charCount = text.length;
  const noSpace = text.replace(/\s/g, "");
  const charCountNoSpace = noSpace.length;
  const titleLength = title.trim().length;
  const h2Count = (content.match(/^##\s+\S/gm) ?? []).length;
  const h3Count = (content.match(/^###\s+\S/gm) ?? []).length;
  const headings = (content.match(/^#{2,3}\s+.+$/gm) ?? []).join("\n");
  const intro = stripMarkdown(firstParagraph(content));

  const kwStats: KeywordStat[] = keywords
    .map((k) => k.trim())
    .filter(Boolean)
    .map((keyword) => {
      const count = countOccurrences(text, keyword);
      const kwLen = keyword.replace(/\s/g, "").length;
      const density = charCountNoSpace ? Math.round(((count * kwLen) / charCountNoSpace) * 1000) / 10 : 0;
      return { keyword, count, density };
    });

  const main = kwStats[0];
  const checks: SeoCheck[] = [];

  checks.push({
    id: "title-length",
    label: "제목 길이",
    pass: titleLength >= 15 && titleLength <= 40,
    detail: `${titleLength}자 (권장 15~40자)`,
    weight: 15,
  });

  if (main) {
    checks.push({
      id: "title-keyword",
      label: "제목에 주요 키워드",
      pass: countOccurrences(title, main.keyword) > 0,
      detail: `"${main.keyword}"`,
      weight: 15,
    });
    checks.push({
      id: "intro-keyword",
      label: "첫 문단에 주요 키워드",
      pass: countOccurrences(intro, main.keyword) > 0,
      detail: `"${main.keyword}"`,
      weight: 10,
    });
    checks.push({
      id: "heading-keyword",
      label: "소제목에 키워드",
      pass: kwStats.some((k) => countOccurrences(headings, k.keyword) > 0),
      detail: "소제목 1개 이상에 키워드 포함",
      weight: 10,
    });
    checks.push({
      id: "density",
      label: "주요 키워드 밀도",
      pass: main.density >= 0.5 && main.density <= 3,
      detail: `${main.density}% (권장 0.5~3%)`,
      weight: 15,
    });
  }

  checks.push({
    id: "headings",
    label: "소제목(H2) 수",
    pass: h2Count >= 3 && h2Count <= 8,
    detail: `H2 ${h2Count}개, H3 ${h3Count}개 (권장 H2 3~8개)`,
    weight: 15,
  });

  const target = targetChars ?? 1500;
  const ratio = target ? charCount / target : 1;
  checks.push({
    id: "length",
    label: "글자 수",
    pass: ratio >= 0.8 && ratio <= 1.5,
    detail: `${charCount.toLocaleString("ko-KR")}자 (목표 ${target.toLocaleString("ko-KR")}자)`,
    weight: 20,
  });

  const total = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.reduce((s, c) => s + (c.pass ? c.weight : 0), 0);
  const score = total ? Math.round((got / total) * 100) : 0;

  return { score, charCount, charCountNoSpace, titleLength, h2Count, h3Count, keywords: kwStats, checks };
}
