import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // 상위 폴더의 pnpm-lock.yaml 때문에 워크스페이스 루트가 잘못 추론되는 것 방지.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
