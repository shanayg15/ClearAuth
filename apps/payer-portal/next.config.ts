import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The ClearAuth API the /control console flips status against.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
  },
};

export default nextConfig;
