import Anthropic from "@anthropic-ai/sdk";
import type { AnthropicBeta } from "@anthropic-ai/sdk/resources/beta/beta";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { TokenUsage } from "./usage";

/** 서버에서만 import 할 것. API 키는 브라우저로 보내지 않는다. */

export const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";

/**
 * 안전 분류기가 요청을 거절하면 서버가 다른 모델로 다시 실행한다(Claude API 전용).
 * Bedrock/Vertex 등으로 옮길 때는 이 두 값을 빼야 한다.
 */
export const FALLBACK_PARAMS: { betas: AnthropicBeta[]; fallbacks: "default" } = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!client) {
    // timeout은 밀리초. 긴 글 스트리밍을 고려해 5분.
    client = new Anthropic({ timeout: 5 * 60 * 1000, maxRetries: 2 });
  }
  return client;
}

export type { TokenUsage } from "./usage";

/** fallback이 실행되면 시도별 사용량이 usage.iterations에 들어온다. 전부 합산한다. */
export function usageOf(message: BetaMessage): TokenUsage {
  const iterations = message.usage.iterations;
  if (iterations && iterations.length > 0) {
    return iterations.reduce<TokenUsage>(
      (acc, it) => ({
        inputTokens: acc.inputTokens + (it.input_tokens ?? 0),
        outputTokens: acc.outputTokens + (it.output_tokens ?? 0),
      }),
      { inputTokens: 0, outputTokens: 0 },
    );
  }
  return { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens };
}

export class GenerationError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryable: boolean,
  ) {
    super(message);
  }
}

/** stop_reason을 확인해 사용자에게 보여 줄 오류로 바꾼다. 정상이면 null. */
export function checkStopReason(message: BetaMessage): GenerationError | null {
  if (message.stop_reason === "refusal") {
    return new GenerationError("요청한 주제로는 글을 만들 수 없어요. 주제나 키워드를 바꿔 다시 시도해 주세요.", 422, false);
  }
  if (message.stop_reason === "max_tokens") {
    return new GenerationError("글이 너무 길어 중간에 끊겼어요. 분량을 줄여 다시 시도해 주세요.", 422, true);
  }
  return null;
}

/** SDK 오류를 사용자용 한국어 메시지로 바꾼다. 타입별로 구체적인 것부터 확인한다. */
export function toGenerationError(error: unknown): GenerationError {
  if (error instanceof GenerationError) return error;
  if (error instanceof Anthropic.AuthenticationError) {
    return new GenerationError("API 키가 올바르지 않아요. 서버의 ANTHROPIC_API_KEY 설정을 확인해 주세요.", 500, false);
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new GenerationError("이 API 키로는 해당 모델을 쓸 수 없어요.", 500, false);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new GenerationError("요청이 몰려 잠시 쉬어야 해요. 1분쯤 뒤에 다시 시도해 주세요.", 429, true);
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new GenerationError(`요청 형식에 문제가 있어요: ${error.message}`, 400, false);
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new GenerationError("응답이 너무 오래 걸려 중단됐어요. 다시 시도해 주세요.", 504, true);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new GenerationError("AI 서버에 연결하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.", 502, true);
  }
  if (error instanceof Anthropic.APIError) {
    const status = error.status ?? 500;
    if (status >= 500) {
      return new GenerationError("AI 서버에 일시적인 문제가 있어요. 잠시 후 다시 시도해 주세요.", 503, true);
    }
    return new GenerationError(`AI 요청 오류(${status}): ${error.message}`, status, false);
  }
  console.error(error);
  return new GenerationError("알 수 없는 오류가 발생했어요. 다시 시도해 주세요.", 500, true);
}

export function errorResponse(error: unknown): Response {
  const e = toGenerationError(error);
  return Response.json({ error: e.message, retryable: e.retryable }, { status: e.status });
}
