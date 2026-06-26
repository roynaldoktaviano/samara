import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  // Turbopack (Next.js 16 default): alias canvas/encoding to empty module
  // so pdfjs-dist doesn't pull in Node-only native addons into the browser bundle.
  turbopack: {
    resolveAlias: {
      canvas:   { browser: './src/lib/empty-module.ts' },
      encoding: { browser: './src/lib/empty-module.ts' },
    },
  },
  // Webpack fallback (when building with --webpack flag)
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        canvas: false,
        encoding: false,
      }
    }
    return config
  },
};

export default nextConfig;
