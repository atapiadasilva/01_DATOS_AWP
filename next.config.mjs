/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Required for web-ifc WASM and Three.js
    config.resolve.fallback = { fs: false, path: false, crypto: false };
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    return config;
  },
};

export default nextConfig;
