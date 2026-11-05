// 생성 폼의 선택지. 화면 라벨과 프롬프트에 들어갈 설명을 한곳에서 관리한다.

export const TONES = {
  friendly: { label: "친근함", guide: "친구에게 설명하듯 편안한 구어체. 적당한 공감 표현을 쓴다." },
  professional: { label: "전문적", guide: "근거와 용어를 정확히 쓰는 전문가 문체. 과장 없이 단정하게 쓴다." },
  informative: { label: "정보 전달", guide: "핵심 정보를 빠르게 전달하는 객관적 문체. 목록과 표를 적극 활용한다." },
  review: { label: "리뷰체", guide: "직접 써 본 사람의 시점으로 장단점을 솔직하게 비교한다. 경험을 지어내지 말고 일반적 사용 시나리오로 서술한다." },
} as const;

export const LENGTHS = {
  short: { label: "짧게 (약 800자)", chars: 800 },
  medium: { label: "보통 (약 1,500자)", chars: 1500 },
  long: { label: "길게 (약 3,000자)", chars: 3000 },
} as const;

export const PLATFORMS = {
  naver: {
    label: "네이버 블로그",
    guide: "네이버 검색(C-Rank, D.I.A.)에 맞춰 문단을 짧게, 모바일에서 읽기 쉽게 쓴다. 핵심 문장은 **굵게** 강조하고, 이모지는 소제목 앞 정도로만 절제해 쓴다.",
  },
  tistory: {
    label: "티스토리",
    guide: "구글 검색 유입을 고려해 H2/H3 구조를 명확히 하고, 첫 문단에 검색 의도에 대한 직접적인 답을 둔다.",
  },
  wordpress: {
    label: "워드프레스",
    guide: "구글 SEO 기준(명확한 H2/H3, 목록, 짧은 문단, FAQ 섹션)을 따른다. 마지막에 자주 묻는 질문 2~3개를 넣는다.",
  },
  brunch: {
    label: "브런치",
    guide: "에세이처럼 서사가 있는 흐름으로 쓴다. 이모지와 과한 강조는 쓰지 않고, 문장의 완성도를 우선한다.",
  },
} as const;

export const LANGUAGES = {
  ko: { label: "한국어", name: "한국어" },
  en: { label: "영어", name: "English" },
} as const;

export type Tone = keyof typeof TONES;
export type Length = keyof typeof LENGTHS;
export type Platform = keyof typeof PLATFORMS;
export type Language = keyof typeof LANGUAGES;

export const REWRITE_ACTIONS = {
  rewrite: { label: "다시 쓰기", guide: "같은 내용과 분량을 유지하면서 더 읽기 좋게 다시 쓴다." },
  longer: { label: "더 길게", guide: "구체적인 설명이나 예시를 더해 약 1.5~2배 분량으로 늘린다. 사실을 지어내지 않는다." },
  shorter: { label: "더 짧게", guide: "핵심만 남겨 약 절반 분량으로 줄인다." },
  tone: { label: "말투 바꾸기", guide: "내용은 유지하고 지정한 말투로 바꾼다." },
} as const;

export type RewriteAction = keyof typeof REWRITE_ACTIONS;
