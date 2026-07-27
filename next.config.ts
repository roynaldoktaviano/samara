import type { NextConfig } from "next";
import path from "path";

const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  images: {
    // Lets next/image resize/compress media-kit photos on the fly instead of shipping
    // the original upload to every grid thumbnail — the stored Blob file is untouched.
    remotePatterns: [{ protocol: 'https', hostname: '*.public.blob.vercel-storage.com' }],
  },
  async headers() {
    return [
      {
        // Public trip calendar is designed to be embedded on the marketing site — exempt
        // it from X-Frame-Options/framing restrictions (it carries no sensitive data).
        source: '/((?!kalender).*)',
        headers: SECURITY_HEADERS,
      },
    ];
  },
  // Turbopack (Next.js 16 default): alias canvas/encoding to empty module
  // so pdfjs-dist doesn't pull in Node-only native addons into the browser bundle.
  turbopack: {
    root: path.join(__dirname),
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
