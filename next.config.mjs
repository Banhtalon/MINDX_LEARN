import { assertRuntimeEnvironmentGuard } from './src/lib/server/crypto.mjs';

assertRuntimeEnvironmentGuard(process.env);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
