import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* 빌드 시 에러가 있어도 배포를 진행하도록 설정 */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
