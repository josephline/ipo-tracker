import { FALLBACK_PARAMS, MODEL, getClient } from "@/lib/claude";
import { SYSTEM_PROMPT, buildArticlePrompt } from "@/lib/prompts";
import { GenerateInputSchema } from "@/lib/schemas";
import { toNdjsonResponse } from "@/lib/stream";

export const runtime = "nodejs";
export const maxDuration = 300;

/** 2단계: 확정한 제목·목차로 본문을 스트리밍 생성 */
export async function POST(req: Request) {
  const parsed = GenerateInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." }, { status: 400 });
  }
  const stream = getClient().beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    ...FALLBACK_PARAMS,
    output_config: { effort: "medium" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildArticlePrompt(parsed.data) }],
  });
  return toNdjsonResponse(stream);
}
