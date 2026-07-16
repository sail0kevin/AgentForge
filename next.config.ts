import type { NextConfig } from "next";

// Electron loads the app via the local production server (npm start ->
// http://localhost:3000), so the default server output mode is correct:
// assets are served relative to the origin and need no special path prefix.
//
// WARNING: Do NOT switch to output: "export" or "standalone". This app
// depends on Next.js server features (API routes, server components, Prisma),
// and an exported/static build will break routes and database access.
const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};

export default nextConfig;
