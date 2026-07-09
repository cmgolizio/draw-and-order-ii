import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Pin the workspace root to this project. Next 16 / Turbopack otherwise
  // infers the root from the nearest lockfile it can find walking upward, so a
  // stray package-lock.json in a parent directory (e.g. the user's home folder)
  // roots the build there and misclassifies every App Router module as Pages
  // Router — producing a wall of bogus "server-only / next/headers can't be
  // used in the Pages Router" errors.
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#root-directory
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;