import type { TokenUsage } from "./usage";

/**
 * 서버 → 브라우저 스트리밍 프로토콜: 한 줄에 JSON 이벤트 하나(NDJSON).
 *   {"type":"text","text":"..."}
 *   {"type":"done","usage":{"inputTokens":1,"outputTokens":2}}
 *   {"type":"error","message":"...","retryable":true}
 */
export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "done"; usage: TokenUsage }
  | { type: "error"; message: string; retryable: boolean };

/** 브라우저에서 NDJSON 응답을 읽는다. */
export async function readNdjson(response: Response, onEvent: (event: StreamEvent) => void): Promise<void> {
  if (!response.body) throw new Error("응답 본문이 없습니다.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) onEvent(JSON.parse(line) as StreamEvent);
    }
  }
  const rest = buffer.trim();
  if (rest) onEvent(JSON.parse(rest) as StreamEvent);
}
