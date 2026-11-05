import type { TokenUsage } from "@/lib/usage";

export function UsageBadge({ usage }: { usage: TokenUsage }) {
  const total = usage.inputTokens + usage.outputTokens;
  return (
    <span
      className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
      title={`입력 ${usage.inputTokens.toLocaleString()} / 출력 ${usage.outputTokens.toLocaleString()}`}
    >
      토큰 {total.toLocaleString()} (입력 {usage.inputTokens.toLocaleString()} · 출력 {usage.outputTokens.toLocaleString()})
    </span>
  );
}
