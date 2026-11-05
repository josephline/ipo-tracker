"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ErrorBox } from "@/components/ErrorBox";
import { Markdown } from "@/components/Markdown";
import { UsageBadge } from "@/components/UsageBadge";
import { ApiError, ZERO_USAGE, addUsage, postJson, streamText } from "@/lib/api-client";
import { LANGUAGES, LENGTHS, PLATFORMS, TONES, type Language, type Length, type Platform, type Tone } from "@/lib/options";
import { parseKeywords } from "@/lib/prompts";
import type { MetaResult } from "@/lib/schemas";
import type { TokenUsage } from "@/lib/usage";

type Step = "form" | "outline" | "writing";

interface Failure {
  message: string;
  retry?: () => void;
}

export default function NewPostPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");

  // 1단계 입력
  const [topic, setTopic] = useState("");
  const [keywordsRaw, setKeywordsRaw] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState<Tone>("friendly");
  const [length, setLength] = useState<Length>("medium");
  const [platform, setPlatform] = useState<Platform>("naver");
  const [language, setLanguage] = useState<Language>("ko");

  // 2단계: 제목·목차
  const [titles, setTitles] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [outline, setOutline] = useState("");

  // 3단계: 본문
  const [content, setContent] = useState("");
  const [phase, setPhase] = useState<string | null>(null);
  const [usage, setUsage] = useState<TokenUsage>(ZERO_USAGE);
  const [failure, setFailure] = useState<Failure | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const input = () => ({ topic, keywords: parseKeywords(keywordsRaw), audience, tone, length, platform, language });
  const busy = phase !== null;

  const fail = (e: unknown, retry?: () => void) => {
    const err = e instanceof ApiError ? e : new ApiError(String(e), true);
    setFailure({ message: err.message, retry: err.retryable ? retry : undefined });
  };

  async function makeOutline() {
    if (!topic.trim()) return setFailure({ message: "주제를 입력해 주세요." });
    setFailure(null);
    setPhase("제목과 목차를 만드는 중…");
    try {
      const res = await postJson<{ titles: string[]; outline: string; usage: TokenUsage }>("/api/outline", input());
      setTitles(res.titles);
      setTitle(res.titles[0] ?? "");
      setOutline(res.outline);
      setUsage((u) => addUsage(u, res.usage));
      setStep("outline");
    } catch (e) {
      fail(e, makeOutline);
    } finally {
      setPhase(null);
    }
  }

  async function writeArticle() {
    if (!title.trim() || !outline.trim()) return setFailure({ message: "제목과 목차를 확인해 주세요." });
    setFailure(null);
    setStep("writing");
    setContent("");
    setPhase("본문을 쓰는 중…");
    const controller = new AbortController();
    abortRef.current = controller;
    const base = { ...input(), title: title.trim(), outline };
    let total = usage;
    let body = "";
    try {
      const u = await streamText(
        "/api/generate",
        base,
        (chunk) => {
          body += chunk;
          setContent(body);
        },
        controller.signal,
      );
      total = addUsage(total, u);
      setUsage(total);
    } catch (e) {
      setPhase(null);
      return fail(e, writeArticle);
    } finally {
      abortRef.current = null;
    }

    // 메타 정보는 실패해도 글은 저장한다. 편집 화면에서 다시 만들 수 있다.
    setPhase("메타 정보(태그·요약)를 만드는 중…");
    let meta: MetaResult = { metaDescription: "", tags: [], thumbnailTexts: [], summary: [] };
    try {
      const res = await postJson<MetaResult & { usage: TokenUsage }>("/api/meta", { ...base, content: body });
      const { usage: metaUsage, ...rest } = res;
      meta = rest;
      total = addUsage(total, metaUsage);
      setUsage(total);
    } catch (e) {
      console.warn("메타 생성 실패", e);
    }

    setPhase("저장하는 중…");
    try {
      const post = await postJson<{ id: string }>("/api/posts", {
        ...base,
        content: body,
        ...meta,
        status: "draft",
        ...total,
      });
      router.push(`/posts/${post.id}`);
    } catch (e) {
      setPhase(null);
      fail(e, writeArticle);
    }
  }

  const stop = () => abortRef.current?.abort();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <ol className="flex gap-2 text-sm">
        {(["form", "outline", "writing"] as Step[]).map((s, i) => (
          <li
            key={s}
            className={`flex-1 rounded-lg px-3 py-2 text-center ${
              s === step ? "bg-indigo-600 text-white" : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            {i + 1}. {["주제 입력", "제목·목차", "본문 생성"][i]}
          </li>
        ))}
      </ol>

      {usage.inputTokens + usage.outputTokens > 0 && (
        <div>
          <UsageBadge usage={usage} />
        </div>
      )}
      {failure && <ErrorBox message={failure.message} onRetry={failure.retry} />}

      {step === "form" && (
        <form
          className="card space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            makeOutline();
          }}
        >
          <div>
            <label className="label" htmlFor="topic">주제 *</label>
            <input id="topic" className="input" required maxLength={200} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="예: 공모주 청약 처음 하는 법" />
          </div>
          <div>
            <label className="label" htmlFor="keywords">핵심 키워드 (쉼표로 구분, 최대 10개)</label>
            <input id="keywords" className="input" value={keywordsRaw} onChange={(e) => setKeywordsRaw(e.target.value)} placeholder="예: 공모주 청약, 균등배정, 증거금" />
          </div>
          <div>
            <label className="label" htmlFor="audience">타깃 독자</label>
            <input id="audience" className="input" maxLength={200} value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="예: 주식을 막 시작한 20~30대 직장인" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="말투" value={tone} onChange={setTone} options={TONES} />
            <Select label="길이" value={length} onChange={setLength} options={LENGTHS} />
            <Select label="플랫폼" value={platform} onChange={setPlatform} options={PLATFORMS} />
            <Select label="언어" value={language} onChange={setLanguage} options={LANGUAGES} />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? phase : "제목·목차 만들기"}
          </button>
        </form>
      )}

      {step === "outline" && (
        <div className="card space-y-4">
          <fieldset>
            <legend className="label">제목 후보 (하나를 고르고 고칠 수 있어요)</legend>
            <div className="space-y-2">
              {titles.map((t) => (
                <label key={t} className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-200 p-2 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50">
                  <input type="radio" name="title" className="mt-1" checked={title === t} onChange={() => setTitle(t)} />
                  <span>{t}</span>
                </label>
              ))}
            </div>
            <input className="input mt-2" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="선택한 제목" />
          </fieldset>
          <div>
            <label className="label" htmlFor="outline">목차 (마크다운, 자유롭게 고치세요)</label>
            <textarea id="outline" className="input min-h-64 font-mono" value={outline} onChange={(e) => setOutline(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => setStep("form")} disabled={busy}>
              ← 입력 수정
            </button>
            <button type="button" className="btn-secondary" onClick={makeOutline} disabled={busy}>
              목차 다시 만들기
            </button>
            <button type="button" className="btn-primary ml-auto" onClick={writeArticle} disabled={busy}>
              {busy ? phase : "이 목차로 본문 쓰기 →"}
            </button>
          </div>
        </div>
      )}

      {step === "writing" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {busy && <span className="animate-pulse text-sm text-indigo-600">{phase}</span>}
            {phase === "본문을 쓰는 중…" && (
              <button type="button" className="btn-secondary ml-auto" onClick={stop}>
                중단
              </button>
            )}
            {!busy && (
              <button type="button" className="btn-secondary" onClick={() => setStep("outline")}>
                ← 목차로 돌아가기
              </button>
            )}
          </div>
          <article className="card min-h-64">
            {content ? <Markdown>{content}</Markdown> : <p className="text-sm text-zinc-500">곧 글이 나타나요…</p>}
          </article>
        </div>
      )}
    </div>
  );
}

function Select<K extends string>(props: {
  label: string;
  value: K;
  onChange: (v: K) => void;
  options: Record<K, { label: string }>;
}) {
  const id = `sel-${props.label}`;
  return (
    <div>
      <label className="label" htmlFor={id}>{props.label}</label>
      <select id={id} className="input" value={props.value} onChange={(e) => props.onChange(e.target.value as K)}>
        {(Object.keys(props.options) as K[]).map((k) => (
          <option key={k} value={k}>
            {props.options[k].label}
          </option>
        ))}
      </select>
    </div>
  );
}
