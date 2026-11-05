import { LANGUAGES, LENGTHS, PLATFORMS, REWRITE_ACTIONS, TONES } from "./options";
import type { BlogInput, GenerateInput, RewriteInput } from "./schemas";

/**
 * 모든 생성 요청에 공통으로 쓰는 시스템 프롬프트.
 * 요청마다 바뀌는 값(주제, 날짜 등)은 넣지 않는다. 그래야 프롬프트 캐시가 유지된다.
 */
export const SYSTEM_PROMPT = `너는 블로그 전문 작가다. 독자가 끝까지 읽고 싶게 쓰되, 검색엔진 최적화도 지킨다.
- 첫 문단 3줄 안에 독자의 문제나 궁금증을 짚고, 이 글에서 얻을 것을 알려 준다.
- 핵심 키워드는 제목, 첫 문단, 소제목 1개 이상에 자연스럽게 넣는다. 억지로 반복하지 않는다.
- 소제목(H2/H3)으로 구조를 나누고, 문단은 3~4문장 이내로 쓴다.
- 확인되지 않은 수치, 통계, 인용은 지어내지 않는다. 필요하면 [출처 확인 필요]라고 표시한다.
- 마지막에는 요약과 행동 유도(CTA)를 넣는다.
- 출력은 마크다운으로만 한다. 앞뒤에 설명이나 인사말을 붙이지 않는다.`;

/** 사용자 입력을 프롬프트용 브리프 블록으로 만든다. */
export function buildBrief(input: BlogInput): string {
  const keywords = input.keywords.length ? input.keywords.join(", ") : "(지정 없음: 주제에서 핵심어를 골라 쓴다)";
  return [
    `<brief>`,
    `주제: ${input.topic}`,
    `핵심 키워드: ${keywords}`,
    `타깃 독자: ${input.audience || "이 주제를 검색해서 들어온 일반 독자"}`,
    `말투: ${TONES[input.tone].label} - ${TONES[input.tone].guide}`,
    `목표 분량: 공백 포함 약 ${LENGTHS[input.length].chars.toLocaleString("ko-KR")}자`,
    `발행 플랫폼: ${PLATFORMS[input.platform].label} - ${PLATFORMS[input.platform].guide}`,
    `작성 언어: ${LANGUAGES[input.language].name}`,
    `</brief>`,
  ].join("\n");
}

/** 1단계: 제목 후보 5개와 목차 */
export function buildOutlinePrompt(input: BlogInput): string {
  return `${buildBrief(input)}

위 브리프로 블로그 글을 기획한다.
1. 클릭하고 싶은 제목 후보를 5개 만든다. 서로 다른 각도(질문형, 숫자형, 문제 해결형 등)로 쓰고, 핵심 키워드를 앞쪽에 둔다. 각 제목은 40자 이내로 쓴다.
2. 목표 분량에 맞는 목차를 마크다운으로 만든다. "## " 소제목 3~6개, 필요하면 그 아래 "### " 소제목을 둔다. 마지막 소제목은 마무리(요약과 CTA)로 한다. 본문 문장은 쓰지 않는다.`;
}

/** 2단계: 확정한 제목·목차로 본문 */
export function buildArticlePrompt(input: GenerateInput): string {
  return `${buildBrief(input)}

<title>${input.title}</title>

<outline>
${input.outline}
</outline>

위 제목과 목차대로 블로그 본문 전체를 쓴다.
- 첫 줄은 "# ${input.title}" 로 시작한다.
- 목차의 소제목 순서와 문구를 그대로 쓴다. 필요하면 다듬어도 되지만 구조는 바꾸지 않는다.
- 목표 분량(약 ${LENGTHS[input.length].chars.toLocaleString("ko-KR")}자)에서 크게 벗어나지 않는다.`;
}

/** 메타 정보(메타 설명, 태그, 썸네일 문구, 요약) */
export function buildMetaPrompt(input: BlogInput & { title: string; content: string }): string {
  return `${buildBrief(input)}

<article>
${input.content}
</article>

위 글 "${input.title}"의 발행용 메타 정보를 만든다. 작성 언어로 쓴다.
- metaDescription: 검색 결과에 노출될 설명. 핵심 키워드를 포함해 150자 이내.
- tags: 검색용 태그 10개. # 기호 없이, 중복 없이.
- thumbnailTexts: 썸네일 이미지에 넣을 짧고 강한 문구 3개. 각 20자 이내.
- summary: 글 전체를 세 줄로 요약. 줄마다 한 문장.`;
}

/** 부분 다시 쓰기 */
export function buildRewritePrompt(input: RewriteInput): string {
  const action = REWRITE_ACTIONS[input.action];
  const toneLine =
    input.action === "tone"
      ? `바꿀 말투: ${TONES[input.tone].label} - ${TONES[input.tone].guide}`
      : `글 전체 말투: ${TONES[input.tone].label} (유지한다)`;
  return `${input.title ? `글 제목: ${input.title}\n` : ""}작업: ${action.label} - ${action.guide}
${toneLine}
작성 언어: ${LANGUAGES[input.language].name}

<passage>
${input.passage}
</passage>

위 passage만 고쳐서 마크다운으로 출력한다. 원래 있던 소제목(#)이나 목록 형식은 유지한다. passage 밖의 내용은 쓰지 않는다.`;
}

/** 쉼표로 구분한 키워드 문자열을 배열로 바꾼다. */
export function parseKeywords(raw: string): string[] {
  return [...new Set(raw.split(/[,，\n]/).map((k) => k.trim()).filter(Boolean))].slice(0, 10);
}
