const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config: any, { isServer }: any) => {
    // Fixes npm packages that depend on 'fs' module
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        readline: false,
      };
    }
    return config;
  }
}

export default nextConfig;
