import { FALLBACK_PARAMS, MODEL, getClient } from "@/lib/claude";
import { SYSTEM_PROMPT, buildRewritePrompt } from "@/lib/prompts";
import { RewriteInputSchema } from "@/lib/schemas";
import { toNdjsonResponse } from "@/lib/stream";

export const runtime = "nodejs";
export const maxDuration = 120;

/** 선택한 문단 다시 쓰기 (스트리밍) */
export async function POST(req: Request) {
  const parsed = RewriteInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." }, { status: 400 });
  }
  const stream = getClient().beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK_PARAMS,
    output_config: { effort: "low" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildRewritePrompt(parsed.data) }],
  });
  return toNdjsonResponse(stream);
}
