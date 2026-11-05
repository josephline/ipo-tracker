"use client";

import { useMemo } from "react";
import { analyzeSeo } from "@/lib/seo";

export function SeoPanel({ title, content, keywords, targetChars }: { title: string; content: string; keywords: string[]; targetChars?: number }) {
  const kwKey = keywords.join("\u0000");
  const report = useMemo(
    () => analyzeSeo({ title, content, keywords: kwKey ? kwKey.split("\u0000") : [], targetChars }),
    [title, content, kwKey, targetChars],
  );
  const color = report.score >= 80 ? "text-emerald-600" : report.score >= 50 ? "text-amber-600" : "text-red-600";
  return (
    <section className="card space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">SEO 체크</h2>
        <span className={`text-2xl font-bold ${color}`}>{report.score}점</span>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div><dt className="text-zinc-500">글자 수</dt><dd>{report.charCount.toLocaleString()}자</dd></div>
        <div><dt className="text-zinc-500">공백 제외</dt><dd>{report.charCountNoSpace.toLocaleString()}자</dd></div>
        <div><dt className="text-zinc-500">제목 길이</dt><dd>{report.titleLength}자</dd></div>
        <div><dt className="text-zinc-500">소제목</dt><dd>H2 {report.h2Count} · H3 {report.h3Count}</dd></div>
      </dl>
      {report.keywords.length > 0 && (
        <div className="text-sm">
          <p className="mb-1 text-zinc-500">키워드 밀도</p>
          <ul className="space-y-1">
            {report.keywords.map((k) => (
              <li key={k.keyword} className="flex justify-between">
                <span>{k.keyword}</span>
                <span className="text-zinc-500">{k.count}회 · {k.density}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="space-y-1.5 text-sm">
        {report.checks.map((c) => (
          <li key={c.id} className="flex gap-2">
            <span aria-hidden>{c.pass ? "✅" : "⚠️"}</span>
            <span>
              {c.label} <span className="text-zinc-500">— {c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
