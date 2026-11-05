import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { FALLBACK_PARAMS, MODEL, checkStopReason, errorResponse, getClient, usageOf } from "@/lib/claude";
import { SYSTEM_PROMPT, buildMetaPrompt } from "@/lib/prompts";
import { MetaInputSchema, MetaResultSchema, normalizeMeta } from "@/lib/schemas";

export const runtime = "nodejs";

/** 메타 설명, 태그, 썸네일 문구, 세 줄 요약 */
export async function POST(req: Request) {
  const parsed = MetaInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." }, { status: 400 });
  }
  try {
    const message = await getClient().beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      ...FALLBACK_PARAMS,
      output_config: { effort: "low", format: betaZodOutputFormat(MetaResultSchema) },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildMetaPrompt(parsed.data) }],
    });
    const stopError = checkStopReason(message);
    if (stopError) throw stopError;
    if (!message.parsed_output) throw new Error("메타 정보 응답을 해석하지 못했습니다.");
    return Response.json({ ...normalizeMeta(message.parsed_output), usage: usageOf(message) });
  } catch (error) {
    return errorResponse(error);
  }
}
