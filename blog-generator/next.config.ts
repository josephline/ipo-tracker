import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  // 상위 폴더(ipo-tracker)의 lockfile을 프로젝트 루트로 오인하지 않게 고정한다.
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
};

export default nextConfig;
