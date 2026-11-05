import type { BetaMessageStream } from "@anthropic-ai/sdk/lib/BetaMessageStream";
import { checkStopReason, toGenerationError, usageOf } from "./claude";
import type { StreamEvent } from "./events";

/** Claude 스트림을 NDJSON 응답으로 바꾼다. */
export function toNdjsonResponse(stream: BetaMessageStream): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            send({ type: "text", text: event.delta.text });
          }
        }
        const message = await stream.finalMessage();
        const stopError = checkStopReason(message);
        if (stopError) {
          send({ type: "error", message: stopError.message, retryable: stopError.retryable });
        } else {
          send({ type: "done", usage: usageOf(message) });
        }
      } catch (error) {
        const e = toGenerationError(error);
        send({ type: "error", message: e.message, retryable: e.retryable });
      } finally {
        controller.close();
      }
    },
    cancel() {
      stream.abort();
    },
  });
  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
