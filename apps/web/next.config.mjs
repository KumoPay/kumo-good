/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @kumo-good/shared is shipped as TypeScript source in the workspace.
  transpilePackages: ["@kumo-good/shared"],
}

export default nextConfig
