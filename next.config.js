const path = require("path");
const { withSentryConfig } = require("@sentry/nextjs");

const isProduction = process.env.NODE_ENV === "production";

// Explicitly-whitelisted connect-src origins.
// 'https:' was replaced with specific domains to reduce XSS exfiltration surface.
// CSP is still in Report-Only mode — tighten further after verifying no violations.
const connectSrcDomains = [
  "'self'",
  // Supabase REST, Auth, Storage
  "https://*.supabase.co",
  // Supabase Realtime (WebSocket)
  "wss://*.supabase.co",
  // Stripe checkout and API
  "https://api.stripe.com",
  "https://*.stripe.com",
  // Anthropic API (AI features)
  "https://api.anthropic.com",
  // eBay APIs (selling, browse, fulfillment)
  "https://api.ebay.com",
  "https://svcs.ebay.com",
  "https://open.api.ebay.com",
  "https://api.sandbox.ebay.com",
  // Sentry is tunnelled through /monitoring (Next.js rewrite) → covered by 'self'
].join(" ");

const cspDirectives = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
  "style-src 'self' 'unsafe-inline' https:",
  "img-src 'self' data: https:",
  "font-src 'self' data: https:",
  `connect-src ${connectSrcDomains}`,
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the app directory as the workspace root when multiple lockfiles exist
  // (e.g. package-lock.json in a parent folder) so tracing and dev assets resolve here.
  outputFileTracingRoot: path.join(__dirname),
  serverExternalPackages: ["playwright"],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'i.ebayimg.com',
      },
    ],
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Slow first compiles after cache clears should not fail chunk loading.
      config.output = {
        ...config.output,
        chunkLoadTimeout: 120000,
      };
    }
    return config;
  },
  async headers() {
    const securityHeaders = [
      {
        key: "X-Content-Type-Options",
        value: "nosniff",
      },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        key: "X-Frame-Options",
        value: "DENY",
      },
      {
        key: "Permissions-Policy",
        value:
          "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(self), payment=(), usb=()",
      },
      {
        // TODO: Enforce CSP after validating reports in production.
        key: "Content-Security-Policy-Report-Only",
        value: cspDirectives,
      },
    ];

    if (isProduction) {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains",
      });
    }

    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = withSentryConfig(nextConfig, {
  // Sentry webpack plugin options
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Only upload source maps in production builds
  silent: !process.env.CI,

  // Automatically instrument and tree-shake Sentry
  widenClientFileUpload: true,

  // Route browser requests to Sentry through Next.js rewrite to avoid ad-blockers
  tunnelRoute: "/monitoring",

  // Hides source maps from generated client bundles
  hideSourceMaps: true,

  // Automatically tree-shake Sentry logger statements
  disableLogger: true,

  // Enable automatic instrumentation
  automaticVercelMonitors: true,
});
