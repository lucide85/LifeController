/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle for the Docker runtime image.
  output: "standalone",
  // pdf-parse, sharp and the postgres driver are server-only (sharp has a native
  // binary); keep them external to the bundle so they load from node_modules.
  serverExternalPackages: ["pdf-parse", "postgres", "sharp"],
  // Don't fail the production build on ESLint findings (lint is a dev-time concern).
  // TypeScript type-checking still runs and WILL fail the build on type errors.
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Allow large file uploads through server actions / route handlers.
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
