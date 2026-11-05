import { PrismaClient, type Post } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** DB 행(배열을 문자열로 저장)을 API 응답 형태로 바꾼다. */
export function serializePost(post: Post) {
  const parse = (s: string): string[] => {
    try {
      const v = JSON.parse(s);
      return Array.isArray(v) ? v.map(String) : [];
    } catch {
      return [];
    }
  };
  return {
    ...post,
    keywords: post.keywords ? post.keywords.split(",").filter(Boolean) : [],
    tags: parse(post.tags),
    thumbnailTexts: parse(post.thumbnailTexts),
    summary: parse(post.summary),
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

export type PostDTO = ReturnType<typeof serializePost>;

/** 저장용 입력의 배열 필드를 DB 형식으로 바꾼다. */
export function toDbFields<T extends { keywords?: string[]; tags?: string[]; thumbnailTexts?: string[]; summary?: string[] }>(
  data: T,
) {
  const { keywords, tags, thumbnailTexts, summary, ...rest } = data;
  return {
    ...rest,
    ...(keywords !== undefined && { keywords: keywords.join(",") }),
    ...(tags !== undefined && { tags: JSON.stringify(tags) }),
    ...(thumbnailTexts !== undefined && { thumbnailTexts: JSON.stringify(thumbnailTexts) }),
    ...(summary !== undefined && { summary: JSON.stringify(summary) }),
  };
}
