"use client";

import { useRef, useState } from "react";
import { Markdown } from "./Markdown";

export function ExportButtons({ title, content }: { title: string; content: string }) {
  const htmlRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (kind: "md" | "html") => {
    const text = kind === "md" ? content : (htmlRef.current?.firstElementChild?.innerHTML ?? "");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      alert("클립보드에 복사하지 못했어요. 브라우저 권한을 확인해 주세요.");
    }
  };

  const download = () => {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[\\/:*?"<>|]/g, "").slice(0, 60) || "post"}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn-secondary" onClick={() => copy("md")}>
        {copied === "md" ? "복사됨 ✓" : "마크다운 복사"}
      </button>
      <button type="button" className="btn-secondary" onClick={() => copy("html")}>
        {copied === "html" ? "복사됨 ✓" : "HTML 복사"}
      </button>
      <button type="button" className="btn-secondary" onClick={download}>
        .md 다운로드
      </button>
      {/* HTML 복사용으로 화면 밖에 렌더링해 둔다 */}
      <div ref={htmlRef} aria-hidden className="hidden">
        <Markdown>{content}</Markdown>
      </div>
    </div>
  );
}
