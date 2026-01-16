import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable Turbopack for Next.js 16 compatibility
  turbopack: {},

  // External packages for server-side rendering
  serverExternalPackages: ['better-sqlite3'],

  // Configure webpack for Node.js modules
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push({
        'better-sqlite3': 'commonjs better-sqlite3',
      });
    }
    return config;
  },

  // Environment variables
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
  },

  // Headers for security
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type,Authorization' },
        ],
      },
    ];
  },
};

export default nextConfig;
