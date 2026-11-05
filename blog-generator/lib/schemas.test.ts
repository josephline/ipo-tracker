import { describe, expect, it } from "vitest";
import { BlogInputSchema, normalizeMeta } from "./schemas";

describe("BlogInputSchema", () => {
  it("rejects an empty topic and unknown options", () => {
    expect(BlogInputSchema.safeParse({ topic: " ", tone: "friendly", length: "short", platform: "naver" }).success).toBe(false);
    expect(BlogInputSchema.safeParse({ topic: "x", tone: "angry", length: "short", platform: "naver" }).success).toBe(false);
  });

  it("applies defaults", () => {
    const r = BlogInputSchema.parse({ topic: "x", tone: "friendly", length: "short", platform: "naver" });
    expect(r).toMatchObject({ keywords: [], audience: "", language: "ko" });
  });
});

describe("normalizeMeta", () => {
  it("caps counts, strips # and trims the description", () => {
    const m = normalizeMeta({
      metaDescription: " " + "가".repeat(200),
      tags: ["#a", "a", "b", ...Array.from({ length: 12 }, (_, i) => `t${i}`)],
      thumbnailTexts: ["1", "2", "3", "4"],
      summary: ["x", " ", "y", "z", "w"],
    });
    expect(m.metaDescription).toHaveLength(150);
    expect(m.tags[0]).toBe("a");
    expect(m.tags).toHaveLength(10);
    expect(new Set(m.tags).size).toBe(m.tags.length);
    expect(m.thumbnailTexts).toHaveLength(3);
    expect(m.summary).toEqual(["x", "y", "z"]);
  });
});
