import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { FALLBACK_PARAMS, MODEL, checkStopReason, errorResponse, getClient, usageOf } from "@/lib/claude";
import { SYSTEM_PROMPT, buildOutlinePrompt } from "@/lib/prompts";
import { BlogInputSchema, OutlineResultSchema } from "@/lib/schemas";

export const runtime = "nodejs";

/** 1단계: 제목 후보 5개와 목차 */
export async function POST(req: Request) {
  const parsed = BlogInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." }, { status: 400 });
  }
  try {
    const message = await getClient().beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      ...FALLBACK_PARAMS,
      output_config: { effort: "low", format: betaZodOutputFormat(OutlineResultSchema) },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildOutlinePrompt(parsed.data) }],
    });
    const stopError = checkStopReason(message);
    if (stopError) throw stopError;
    const result = message.parsed_output;
    if (!result) throw new Error("목차 응답을 해석하지 못했습니다.");
    return Response.json({
      titles: result.titles.map((t) => t.trim()).filter(Boolean).slice(0, 5),
      outline: result.outline.trim(),
      usage: usageOf(message),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
