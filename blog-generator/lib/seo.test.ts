import { describe, expect, it } from "vitest";
import { analyzeSeo, stripMarkdown } from "./seo";

const article = `# 공모주 청약 방법 총정리: 처음이어도 쉽게

공모주 청약이 처음이라면 무엇부터 해야 할지 막막하죠. 이 글에서 공모주 청약 순서를 정리합니다.

## 공모주 청약이란

공모주 청약은 상장 전에 주식을 미리 배정받는 절차입니다.

## 공모주 청약 준비물

- 증권 계좌
- 청약 증거금

### 증거금 계산

증거금은 청약 금액의 절반입니다.

## 마무리

정리하면 계좌와 증거금만 있으면 됩니다.`;

describe("stripMarkdown", () => {
  it("removes headings, emphasis, links and list markers", () => {
    expect(stripMarkdown("## 제목\n**굵게** [링크](http://a.b)\n- 항목")).toBe("제목\n굵게 링크\n항목");
  });
});

describe("analyzeSeo", () => {
  it("counts headings and keyword occurrences", () => {
    const r = analyzeSeo({ title: "공모주 청약 방법 총정리: 처음이어도 쉽게", content: article, keywords: ["공모주 청약"] });
    expect(r.h2Count).toBe(3);
    expect(r.h3Count).toBe(1);
    expect(r.keywords[0].count).toBe(6);
    expect(r.keywords[0].density).toBeGreaterThan(0);
  });

  it("passes keyword placement checks for a well-formed article", () => {
    const r = analyzeSeo({ title: "공모주 청약 방법 총정리: 처음이어도 쉽게", content: article, keywords: ["공모주 청약"] });
    const byId = Object.fromEntries(r.checks.map((c) => [c.id, c.pass]));
    expect(byId["title-keyword"]).toBe(true);
    expect(byId["intro-keyword"]).toBe(true);
    expect(byId["heading-keyword"]).toBe(true);
    expect(byId["headings"]).toBe(true);
    expect(byId["title-length"]).toBe(true);
  });

  it("flags a missing keyword and too-short content", () => {
    const r = analyzeSeo({ title: "짧은 제목", content: "## 하나\n\n내용", keywords: ["재테크"], targetChars: 1500 });
    const byId = Object.fromEntries(r.checks.map((c) => [c.id, c.pass]));
    expect(byId["title-keyword"]).toBe(false);
    expect(byId["length"]).toBe(false);
    expect(byId["title-length"]).toBe(false);
    expect(r.score).toBeLessThan(30);
  });

  it("skips keyword checks when no keywords are given and keeps score within 0-100", () => {
    const r = analyzeSeo({ title: "", content: "", keywords: [] });
    expect(r.checks.find((c) => c.id === "density")).toBeUndefined();
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it("matches keywords case-insensitively", () => {
    const r = analyzeSeo({ title: "SEO guide", content: "seo SEO Seo", keywords: ["SEO"] });
    expect(r.keywords[0].count).toBe(3);
  });
});
