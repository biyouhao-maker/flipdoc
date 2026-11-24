import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ["sharp", "pdfjs-dist"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      const existingExternals = Array.isArray(config.externals)
        ? config.externals
        : config.externals
          ? [config.externals]
          : [];
      config.externals = [
        ...existingExternals,
        {
          "node:sqlite": "commonjs node:sqlite",
        },
      ];
    }
    return config;
  },
};

export default nextConfig;
