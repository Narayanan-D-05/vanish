/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Stub out Node.js-only native modules that @hashgraph/sdk and @grpc try to load
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        dns: false,
        http2: false,
        child_process: false,
        perf_hooks: false,
        async_hooks: false,
      };
    }
    return config;
  },
};

export default nextConfig;
