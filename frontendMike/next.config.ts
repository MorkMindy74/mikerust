import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isTauri = process.env.TAURI_BUILD === "1";

const nextConfig: NextConfig = {
    reactCompiler: true,
    // Static export for Tauri — no Node.js server needed
    ...(isTauri ? { output: "export", trailingSlash: true } : {}),
    // Rewrites only work in server mode (not static export)
    ...(!isTauri ? {
        async rewrites() {
            return [
                {
                    source: "/sitemap.xml",
                    destination: "/api/sitemap/sitemap.xml",
                },
                {
                    source: "/sitemap_:slug.xml",
                    destination: "/api/sitemap/sitemap_:slug.xml",
                },
            ];
        },
        skipTrailingSlashRedirect: true,
    } : {}),
};

export default withNextIntl(nextConfig);
