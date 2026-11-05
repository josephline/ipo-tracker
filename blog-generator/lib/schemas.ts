import { z } from "zod";
import { LANGUAGES, LENGTHS, PLATFORMS, REWRITE_ACTIONS, TONES } from "./options";

const enumOf = <T extends Record<string, unknown>>(obj: T) =>
  z.enum(Object.keys(obj) as [Extract<keyof T, string>, ...Extract<keyof T, string>[]]);

/** 글 생성 폼 입력 */
export const BlogInputSchema = z.object({
  topic: z.string().trim().min(1, "주제를 입력하세요").max(200),
  keywords: z.array(z.string().trim().min(1).max(50)).max(10).default([]),
  audience: z.string().trim().max(200).default(""),
  tone: enumOf(TONES),
  length: enumOf(LENGTHS),
  platform: enumOf(PLATFORMS),
  language: enumOf(LANGUAGES).default("ko"),
});
export type BlogInput = z.infer<typeof BlogInputSchema>;

/** 2단계 본문 생성 입력 = 폼 입력 + 확정한 제목·목차 */
export const GenerateInputSchema = BlogInputSchema.extend({
  title: z.string().trim().min(1).max(200),
  outline: z.string().trim().min(1).max(5000),
});
export type GenerateInput = z.infer<typeof GenerateInputSchema>;

/** 메타 정보 생성 입력 */
export const MetaInputSchema = BlogInputSchema.extend({
  title: z.string().trim().min(1).max(200),
  content: z.string().min(1).max(60000),
});

/** 부분 다시 쓰기 입력 */
export const RewriteInputSchema = z.object({
  passage: z.string().trim().min(1).max(8000),
  action: enumOf(REWRITE_ACTIONS),
  tone: enumOf(TONES),
  title: z.string().max(200).default(""),
  language: enumOf(LANGUAGES).default("ko"),
});
export type RewriteInput = z.infer<typeof RewriteInputSchema>;

// ---- Claude 구조화 출력 스키마 (길이 제약은 코드에서 자른다) ----

export const OutlineResultSchema = z.object({
  titles: z.array(z.string()).describe("제목 후보 5개"),
  outline: z.string().describe("H2/H3 마크다운 목차. 본문 없이 제목 줄만."),
});
export type OutlineResult = z.infer<typeof OutlineResultSchema>;

export const MetaResultSchema = z.object({
  metaDescription: z.string().describe("150자 이내 메타 설명"),
  tags: z.array(z.string()).describe("태그 10개, # 없이"),
  thumbnailTexts: z.array(z.string()).describe("썸네일 문구 3개"),
  summary: z.array(z.string()).describe("세 줄 요약, 줄마다 한 문장"),
});
export type MetaResult = z.infer<typeof MetaResultSchema>;

/** 메타 결과를 개수·길이 규칙에 맞게 정리한다. */
export function normalizeMeta(meta: MetaResult): MetaResult {
  const clean = (arr: string[]) => arr.map((s) => s.trim()).filter(Boolean);
  return {
    metaDescription: meta.metaDescription.trim().slice(0, 150),
    tags: [...new Set(clean(meta.tags).map((t) => t.replace(/^#+/, "")))].slice(0, 10),
    thumbnailTexts: clean(meta.thumbnailTexts).slice(0, 3),
    summary: clean(meta.summary).slice(0, 3),
  };
}

/** 저장·수정용 */
export const PostSaveSchema = z.object({
  title: z.string().trim().min(1).max(200),
  topic: z.string().trim().max(200),
  keywords: z.array(z.string()).max(10),
  audience: z.string().max(200).default(""),
  tone: z.string(),
  length: z.string(),
  platform: z.string(),
  language: z.string().default("ko"),
  outline: z.string().max(5000).default(""),
  content: z.string().max(100000).default(""),
  metaDescription: z.string().max(300).default(""),
  tags: z.array(z.string()).default([]),
  thumbnailTexts: z.array(z.string()).default([]),
  summary: z.array(z.string()).default([]),
  status: z.enum(["draft", "done"]).default("draft"),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
});
export const PostUpdateSchema = PostSaveSchema.partial();
export type PostSave = z.infer<typeof PostSaveSchema>;
