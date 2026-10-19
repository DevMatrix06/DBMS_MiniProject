import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do not let `next dev` generate AGENTS.md for AI coding tools.
  agentRules: false,
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
};

export default nextConfig;
