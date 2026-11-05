import { describe, expect, it } from "vitest";
import {
  SYSTEM_PROMPT,
  buildArticlePrompt,
  buildBrief,
  buildMetaPrompt,
  buildOutlinePrompt,
  buildRewritePrompt,
  parseKeywords,
} from "./prompts";
import type { BlogInput } from "./schemas";

const input: BlogInput = {
  topic: "공모주 청약 방법",
  keywords: ["공모주", "균등배정"],
  audience: "주식 초보",
  tone: "friendly",
  length: "medium",
  platform: "naver",
  language: "ko",
};

describe("SYSTEM_PROMPT", () => {
  it("contains the core writing rules and no per-request values", () => {
    expect(SYSTEM_PROMPT).toContain("[출처 확인 필요]");
    expect(SYSTEM_PROMPT).toContain("마크다운");
    expect(SYSTEM_PROMPT).not.toContain(input.topic);
  });
});

describe("buildBrief", () => {
  it("includes every input field", () => {
    const brief = buildBrief(input);
    expect(brief).toContain("주제: 공모주 청약 방법");
    expect(brief).toContain("공모주, 균등배정");
    expect(brief).toContain("주식 초보");
    expect(brief).toContain("친근함");
    expect(brief).toContain("1,500자");
    expect(brief).toContain("네이버 블로그");
    expect(brief).toContain("한국어");
  });

  it("falls back to defaults for empty keywords and audience", () => {
    const brief = buildBrief({ ...input, keywords: [], audience: "" });
    expect(brief).toContain("지정 없음");
    expect(brief).toContain("일반 독자");
  });

  it("uses English as the output language when requested", () => {
    expect(buildBrief({ ...input, language: "en" })).toContain("English");
  });
});

describe("step prompts", () => {
  it("outline prompt asks for 5 titles and H2 headings", () => {
    const p = buildOutlinePrompt(input);
    expect(p).toContain("5개");
    expect(p).toContain("## ");
  });

  it("article prompt embeds the chosen title and outline", () => {
    const p = buildArticlePrompt({ ...input, title: "청약 A to Z", outline: "## 하나\n## 둘" });
    expect(p).toContain("# 청약 A to Z");
    expect(p).toContain("<outline>\n## 하나\n## 둘\n</outline>");
  });

  it("meta prompt embeds the article", () => {
    const p = buildMetaPrompt({ ...input, title: "T", content: "본문입니다" });
    expect(p).toContain("<article>\n본문입니다\n</article>");
    expect(p).toContain("150자");
  });

  it("rewrite prompt switches tone line by action", () => {
    const toneChange = buildRewritePrompt({ passage: "문단", action: "tone", tone: "professional", title: "", language: "ko" });
    expect(toneChange).toContain("바꿀 말투: 전문적");
    const shorter = buildRewritePrompt({ passage: "문단", action: "shorter", tone: "professional", title: "제목", language: "ko" });
    expect(shorter).toContain("더 짧게");
    expect(shorter).toContain("(유지한다)");
    expect(shorter).toContain("글 제목: 제목");
  });
});

describe("parseKeywords", () => {
  it("splits, trims, dedupes and caps at 10", () => {
    expect(parseKeywords(" a, b ,a,,c\nd")).toEqual(["a", "b", "c", "d"]);
    expect(parseKeywords(Array.from({ length: 15 }, (_, i) => `k${i}`).join(","))).toHaveLength(10);
  });
});
