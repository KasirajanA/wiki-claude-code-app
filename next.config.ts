import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma requires server-only usage; ensure it is never bundled for the client.
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;
