import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The engine reads the dataset from disk at request time.
  outputFileTracingIncludes: { '/**': ['./data/**', './mappings/**', './config/**'] },
};

export default nextConfig;
