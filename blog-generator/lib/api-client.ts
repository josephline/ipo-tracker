// 브라우저에서 쓰는 API 호출 헬퍼. 서버 전용 모듈을 import 하지 않는다.
import { readNdjson } from "./events";
import type { TokenUsage } from "./usage";

export class ApiError extends Error {
  constructor(
    message: string,
    public retryable: boolean,
  ) {
    super(message);
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as { error?: string; retryable?: boolean } | null;
  return new ApiError(body?.error ?? `요청에 실패했어요 (${res.status}).`, body?.retryable ?? res.status >= 500);
}

function networkError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof DOMException && e.name === "AbortError") return new ApiError("생성을 중단했어요.", true);
  return new ApiError("서버에 연결하지 못했어요. 네트워크를 확인해 주세요.", true);
}

export async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw await toApiError(res);
    return (await res.json()) as T;
  } catch (e) {
    throw networkError(e);
  }
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    if (!res.ok) throw await toApiError(res);
    return (res.status === 204 ? undefined : await res.json()) as T;
  } catch (e) {
    throw networkError(e);
  }
}

/** 스트리밍 API를 호출하고 텍스트 조각마다 onText를 부른다. 끝나면 토큰 사용량을 돌려준다. */
export async function streamText(
  url: string,
  body: unknown,
  onText: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<TokenUsage> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw await toApiError(res);
    let usage: TokenUsage | null = null;
    let error: ApiError | null = null;
    await readNdjson(res, (event) => {
      if (event.type === "text") onText(event.text);
      else if (event.type === "done") usage = event.usage;
      else error = new ApiError(event.message, event.retryable);
    });
    if (error) throw error;
    if (!usage) throw new ApiError("응답이 중간에 끊겼어요. 다시 시도해 주세요.", true);
    return usage;
  } catch (e) {
    throw networkError(e);
  }
}

export const addUsage = (a: TokenUsage, b: TokenUsage): TokenUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
});

export const ZERO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0 };
