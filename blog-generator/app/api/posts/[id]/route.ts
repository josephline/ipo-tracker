import { Prisma } from "@prisma/client";
import { prisma, serializePost, toDbFields } from "@/lib/db";
import { PostUpdateSchema } from "@/lib/schemas";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => Response.json({ error: "글을 찾을 수 없어요." }, { status: 404 });
const isNotFound = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025";

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const post = await prisma.post.findUnique({ where: { id } });
  return post ? Response.json(serializePost(post)) : notFound();
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = PostUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." }, { status: 400 });
  }
  try {
    const post = await prisma.post.update({ where: { id }, data: toDbFields(parsed.data) });
    return Response.json(serializePost(post));
  } catch (e) {
    if (isNotFound(e)) return notFound();
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    await prisma.post.delete({ where: { id } });
    return new Response(null, { status: 204 });
  } catch (e) {
    if (isNotFound(e)) return notFound();
    throw e;
  }
}
