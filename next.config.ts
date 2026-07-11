import type { NextConfig } from "next";

// Electron loads the app via the local production server (npm start ->
// http://localhost:3000), so the default server output mode is correct:
// assets are served relative to the origin and need no special path prefix.
//
// WARNING: Do NOT switch to output: "export" or "standalone". This app
// depends on Next.js server features (API routes, server components, Prisma),
// and an exported/static build will break routes and database access.
const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
