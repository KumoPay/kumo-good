/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @kumo-good/shared is shipped as TypeScript source in the workspace.
  transpilePackages: ["@kumo-good/shared"],
  webpack: (config) => {
    // transformers.js (offline Whisper) runs only in the browser worker. Stub the
    // node-only backends so the client bundle doesn't try to pull them in.
    config.resolve.alias = {
      ...config.resolve.alias,
      sharp$: false,
      "onnxruntime-node$": false,
    }
    return config
  },
}

export default nextConfig
