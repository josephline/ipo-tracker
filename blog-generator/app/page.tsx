"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ErrorBox } from "@/components/ErrorBox";
import { requestJson } from "@/lib/api-client";
import { PLATFORMS, type Platform } from "@/lib/options";

interface PostSummary {
  id: string;
  title: string;
  topic: string;
  keywords: string[];
  platform: string;
  status: "draft" | "done";
  updatedAt: string;
  inputTokens: number;
  outputTokens: number;
}

export default function Dashboard() {
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | "draft" | "done">("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    try {
      setPosts(await requestJson<PostSummary[]>(`/api/posts?${params}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [q, status]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const remove = async (post: PostSummary) => {
    if (!confirm(`"${post.title}" 글을 삭제할까요?`)) return;
    try {
      await requestJson(`/api/posts/${post.id}`, { method: "DELETE" });
      setPosts((prev) => prev?.filter((p) => p.id !== post.id) ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <section className="card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">내 블로그 글</h1>
          <p className="text-sm text-zinc-500">주제와 키워드만 넣으면 SEO에 맞춘 글을 만들어 드려요.</p>
        </div>
        <Link href="/new" className="btn-primary">
          ✨ 새 글 만들기
        </Link>
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="input"
          placeholder="제목, 주제, 키워드로 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="검색"
        />
        <select className="input sm:w-40" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="상태">
          <option value="">전체</option>
          <option value="draft">초안</option>
          <option value="done">완료</option>
        </select>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}

      {posts === null && !error && <p className="text-sm text-zinc-500">불러오는 중…</p>}
      {posts?.length === 0 && (
        <p className="py-12 text-center text-sm text-zinc-500">
          아직 글이 없어요. <Link href="/new" className="text-indigo-600 underline">첫 글을 만들어 보세요.</Link>
        </p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {posts?.map((post) => (
          <li key={post.id} className="card flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs">
              <span
                className={`rounded-full px-2 py-0.5 ${
                  post.status === "done"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                }`}
              >
                {post.status === "done" ? "완료" : "초안"}
              </span>
              <span className="text-zinc-500">{PLATFORMS[post.platform as Platform]?.label ?? post.platform}</span>
            </div>
            <Link href={`/posts/${post.id}`} className="line-clamp-2 font-semibold hover:text-indigo-600">
              {post.title}
            </Link>
            {post.keywords.length > 0 && (
              <p className="line-clamp-1 text-xs text-zinc-500">{post.keywords.map((k) => `#${k}`).join(" ")}</p>
            )}
            <div className="mt-auto flex items-center justify-between pt-2 text-xs text-zinc-500">
              <span>{new Date(post.updatedAt).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })}</span>
              <button type="button" className="btn-danger px-2 py-1" onClick={() => remove(post)}>
                삭제
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
