/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    // Fixes npm packages that depend on 'fs' module
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        readline: false,
        path: false,
        os: false,
        crypto: false,
      };
    }
    // Enable WebAssembly for ZK proof generation
    config.experiments = { 
      ...config.experiments, 
      asyncWebAssembly: true,
      layers: true,
    };
    return config;
  },
};

export default nextConfig;
