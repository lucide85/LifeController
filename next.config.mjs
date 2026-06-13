/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle for the Docker runtime image.
  output: "standalone",
  // pdf-parse and the postgres driver are server-only; keep them external to the bundle.
  serverExternalPackages: ["pdf-parse", "postgres"],
  experimental: {
    // Allow large file uploads through server actions / route handlers.
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
