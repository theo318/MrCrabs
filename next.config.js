/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't bundle these for the Node runtime — they ship runtime CLIs and native
  // helpers that webpack mis-resolves (e.g. picks up .d.ts files as modules).
  experimental: {
    serverComponentsExternalPackages: [
      "@cursor/sdk",
      "@modelcontextprotocol/sdk",
    ],
  },
};

module.exports = nextConfig;
