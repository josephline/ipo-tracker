"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorBox } from "@/components/ErrorBox";
import { ExportButtons } from "@/components/ExportButtons";
import { Markdown } from "@/components/Markdown";
import { SeoPanel } from "@/components/SeoPanel";
import { UsageBadge } from "@/components/UsageBadge";
import { ApiError, postJson, requestJson, streamText } from "@/lib/api-client";
import { LENGTHS, REWRITE_ACTIONS, TONES, type Length, type RewriteAction, type Tone } from "@/lib/options";
import type { MetaResult } from "@/lib/schemas";
import type { TokenUsage } from "@/lib/usage";

interface Post extends MetaResult {
  id: string;
  title: string;
  topic: string;
  keywords: string[];
  audience: string;
  tone: string;
  length: string;
  platform: string;
  language: string;
  outline: string;
  content: string;
  status: "draft" | "done";
  inputTokens: number;
  outputTokens: number;
  updatedAt: string;
}

interface Selection {
  start: number;
  end: number;
  text: string;
}

export default function EditPostPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [post, setPost] = useState<Post | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; retry?: () => void } | null>(null);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // 부분 다시 쓰기
  const [selection, setSelection] = useState<Selection | null>(null);
  const [rewriteTone, setRewriteTone] = useState<Tone>("friendly");
  const [rewriteResult, setRewriteResult] = useState("");
  const [rewriting, setRewriting] = useState(false);
  const [metaBusy, setMetaBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const p = await requestJson<Post>(`/api/posts/${id}`);
      setPost(p);
      if (p.tone in TONES) setRewriteTone(p.tone as Tone);
    } catch (e) {
      setError({ message: (e as Error).message, retry: load });
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // 저장하지 않고 나가려 하면 경고
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const update = (patch: Partial<Post>) => {
    setPost((p) => (p ? { ...p, ...patch } : p));
    setDirty(true);
  };

  const addTokens = (u: TokenUsage) =>
    update({ inputTokens: (post?.inputTokens ?? 0) + u.inputTokens, outputTokens: (post?.outputTokens ?? 0) + u.outputTokens });

  async function save(patch: Partial<Post> = {}) {
    if (!post) return;
    const next = { ...post, ...patch };
    setSaving(true);
    setError(null);
    try {
      const saved = await requestJson<Post>(`/api/posts/${post.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: next.title,
          content: next.content,
          status: next.status,
          metaDescription: next.metaDescription,
          tags: next.tags,
          thumbnailTexts: next.thumbnailTexts,
          summary: next.summary,
          inputTokens: next.inputTokens,
          outputTokens: next.outputTokens,
        }),
      });
      setPost(saved);
      setDirty(false);
    } catch (e) {
      setError({ message: (e as Error).message, retry: () => save(patch) });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!post || !confirm("이 글을 삭제할까요?")) return;
    try {
      await requestJson(`/api/posts/${post.id}`, { method: "DELETE" });
      setDirty(false);
      router.push("/");
    } catch (e) {
      setError({ message: (e as Error).message });
    }
  }

  const captureSelection = () => {
    const el = editorRef.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    const text = el.value.slice(start, end);
    setSelection(text.trim() ? { start, end, text } : null);
  };

  async function rewrite(action: RewriteAction) {
    if (!post || !selection) return;
    setRewriting(true);
    setRewriteResult("");
    setError(null);
    let out = "";
    try {
      const u = await streamText(
        "/api/rewrite",
        { passage: selection.text, action, tone: rewriteTone, title: post.title, language: post.language },
        (chunk) => {
          out += chunk;
          setRewriteResult(out);
        },
      );
      addTokens(u);
    } catch (e) {
      setRewriteResult("");
      setError({ message: (e as Error).message, retry: (e as ApiError).retryable ? () => rewrite(action) : undefined });
    } finally {
      setRewriting(false);
    }
  }

  const applyRewrite = () => {
    if (!post || !selection) return;
    // 선택 후 본문이 바뀌었다면 같은 문장을 다시 찾아 바꾼다.
    let { start, end } = selection;
    if (post.content.slice(start, end) !== selection.text) {
      start = post.content.indexOf(selection.text);
      if (start === -1) return setError({ message: "선택한 문단을 찾지 못했어요. 다시 선택해 주세요." });
      end = start + selection.text.length;
    }
    const replacement = rewriteResult.trim();
    update({ content: post.content.slice(0, start) + replacement + post.content.slice(end) });
    setSelection(null);
    setRewriteResult("");
  };

  async function regenerateMeta() {
    if (!post) return;
    setMetaBusy(true);
    setError(null);
    try {
      const res = await postJson<MetaResult & { usage: TokenUsage }>("/api/meta", {
        topic: post.topic,
        keywords: post.keywords,
        audience: post.audience,
        tone: post.tone,
        length: post.length,
        platform: post.platform,
        language: post.language,
        title: post.title,
        content: post.content,
      });
      const { usage, ...meta } = res;
      update({ ...meta, inputTokens: post.inputTokens + usage.inputTokens, outputTokens: post.outputTokens + usage.outputTokens });
    } catch (e) {
      setError({ message: (e as Error).message, retry: (e as ApiError).retryable ? regenerateMeta : undefined });
    } finally {
      setMetaBusy(false);
    }
  }

  if (!post) {
    return error ? <ErrorBox message={error.message} onRetry={error.retry} /> : <p className="text-sm text-zinc-500">불러오는 중…</p>;
  }

  const targetChars = LENGTHS[post.length as Length]?.chars;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/" className="text-sm text-zinc-500 hover:underline">← 목록</Link>
        <UsageBadge usage={{ inputTokens: post.inputTokens, outputTokens: post.outputTokens }} />
        <div className="ml-auto flex flex-wrap gap-2">
          <select
            className="input w-auto"
            value={post.status}
            onChange={(e) => update({ status: e.target.value as Post["status"] })}
            aria-label="상태"
          >
            <option value="draft">초안</option>
            <option value="done">완료</option>
          </select>
          <button type="button" className="btn-primary" onClick={() => save()} disabled={saving || !dirty}>
            {saving ? "저장 중…" : dirty ? "저장" : "저장됨"}
          </button>
          <button type="button" className="btn-danger" onClick={remove}>
            삭제
          </button>
        </div>
      </div>

      {error && <ErrorBox message={error.message} onRetry={error.retry} />}

      <input
        className="input text-lg font-semibold"
        value={post.title}
        onChange={(e) => update({ title: e.target.value })}
        aria-label="제목"
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          <div className="flex gap-1 lg:hidden">
            {(["edit", "preview"] as const).map((v) => (
              <button key={v} type="button" className={view === v ? "btn-primary" : "btn-secondary"} onClick={() => setView(v)}>
                {v === "edit" ? "편집" : "미리보기"}
              </button>
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <div className={view === "edit" ? "" : "hidden lg:block"}>
              <textarea
                ref={editorRef}
                className="input min-h-[60vh] font-mono leading-relaxed"
                value={post.content}
                onChange={(e) => update({ content: e.target.value })}
                onSelect={captureSelection}
                onMouseUp={captureSelection}
                onKeyUp={captureSelection}
                aria-label="본문 마크다운"
              />
              <p className="mt-1 text-xs text-zinc-500">문단을 드래그해 선택하면 부분 다시 쓰기를 쓸 수 있어요.</p>
            </div>
            <article className={`card max-h-[75vh] overflow-auto ${view === "preview" ? "" : "hidden xl:block"}`}>
              <Markdown>{post.content}</Markdown>
            </article>
          </div>

          <ExportButtons title={post.title} content={post.content} />
        </div>

        <aside className="space-y-4">
          <section className="card space-y-3">
            <h2 className="font-semibold">부분 다시 쓰기</h2>
            {selection ? (
              <>
                <p className="line-clamp-3 rounded bg-zinc-100 p-2 text-xs dark:bg-zinc-800">{selection.text}</p>
                <select className="input" value={rewriteTone} onChange={(e) => setRewriteTone(e.target.value as Tone)} aria-label="말투">
                  {(Object.keys(TONES) as Tone[]).map((t) => (
                    <option key={t} value={t}>말투: {TONES[t].label}</option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(REWRITE_ACTIONS) as RewriteAction[]).map((a) => (
                    <button key={a} type="button" className="btn-secondary" disabled={rewriting} onClick={() => rewrite(a)}>
                      {REWRITE_ACTIONS[a].label}
                    </button>
                  ))}
                </div>
                {(rewriting || rewriteResult) && (
                  <div className="space-y-2">
                    <div className="max-h-60 overflow-auto rounded border border-indigo-200 p-2 text-sm dark:border-indigo-900">
                      {rewriteResult ? <Markdown>{rewriteResult}</Markdown> : <span className="animate-pulse text-zinc-500">쓰는 중…</span>}
                    </div>
                    {!rewriting && rewriteResult && (
                      <div className="flex gap-2">
                        <button type="button" className="btn-primary flex-1" onClick={applyRewrite}>적용</button>
                        <button type="button" className="btn-secondary" onClick={() => setRewriteResult("")}>취소</button>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-zinc-500">본문에서 고칠 부분을 먼저 선택하세요.</p>
            )}
          </section>

          <SeoPanel title={post.title} content={post.content} keywords={post.keywords} targetChars={targetChars} />

          <section className="card space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">발행 정보</h2>
              <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={regenerateMeta} disabled={metaBusy}>
                {metaBusy ? "만드는 중…" : "다시 생성"}
              </button>
            </div>
            <div>
              <label className="label" htmlFor="meta">메타 설명 ({post.metaDescription.length}/150)</label>
              <textarea
                id="meta"
                className="input min-h-20"
                maxLength={150}
                value={post.metaDescription}
                onChange={(e) => update({ metaDescription: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="tags">태그 (쉼표로 구분)</label>
              <input
                id="tags"
                className="input"
                key={post.tags.join(",")}
                defaultValue={post.tags.join(", ")}
                onBlur={(e) => {
                  const tags = [...new Set(e.target.value.split(",").map((t) => t.trim().replace(/^#+/, "")).filter(Boolean))];
                  if (tags.join(",") !== post.tags.join(",")) update({ tags });
                }}
              />
            </div>
            {post.thumbnailTexts.length > 0 && (
              <div>
                <p className="label">썸네일 문구</p>
                <ul className="list-inside list-disc space-y-1">
                  {post.thumbnailTexts.map((t) => <li key={t}>{t}</li>)}
                </ul>
              </div>
            )}
            {post.summary.length > 0 && (
              <div>
                <p className="label">세 줄 요약</p>
                <ol className="list-inside list-decimal space-y-1">
                  {post.summary.map((s) => <li key={s}>{s}</li>)}
                </ol>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
