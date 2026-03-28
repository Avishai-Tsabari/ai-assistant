import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(import.meta.dirname, "../"),
  outputFileTracingExcludes: {
    "*": [
      "../mercury-fork/**",
      "../mercury-assistant/**",
    ],
  },
};

export default nextConfig;
