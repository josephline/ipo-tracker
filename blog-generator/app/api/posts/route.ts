import { prisma, serializePost, toDbFields } from "@/lib/db";
import { PostSaveSchema } from "@/lib/schemas";

export const runtime = "nodejs";

/** 글 목록. ?q= 로 제목·주제·키워드 검색, ?status=draft|done 로 필터 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const status = url.searchParams.get("status");
  const posts = await prisma.post.findMany({
    where: {
      ...(status === "draft" || status === "done" ? { status } : {}),
      ...(q
        ? { OR: [{ title: { contains: q } }, { topic: { contains: q } }, { keywords: { contains: q } }] }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return Response.json(posts.map(serializePost));
}

export async function POST(req: Request) {
  const parsed = PostSaveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." }, { status: 400 });
  }
  const post = await prisma.post.create({ data: { ...toDbFields(parsed.data), keywords: parsed.data.keywords.join(",") } });
  return Response.json(serializePost(post), { status: 201 });
}
