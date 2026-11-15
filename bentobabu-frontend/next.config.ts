import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

const connectSrc = [
  "'self'",
  ...(isProduction ? [] : ["http://localhost:*", "http://127.0.0.1:*"]),
  "https://api.bentobabu.com",
  "https://bentobabu.onrender.com",
  "https://api.bentobabu.in",
  "https://lumberjack.razorpay.com",
  "https://api.razorpay.com",
  "https://res.cloudinary.com",
  "https://media.bentobabu.com",
  "https://*.r2.cloudflarestorage.com",
].join(" ");

const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-XSS-Protection",
    value: "1; mode=block",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://checkout.razorpay.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://images.unsplash.com https://*.razorpay.com https://res.cloudinary.com https://media.bentobabu.com https://*.r2.cloudflarestorage.com https://i.ytimg.com https://*.ytimg.com",
      "media-src 'self' blob: https://media.bentobabu.com https://*.r2.cloudflarestorage.com",
      "font-src 'self' data:",
      "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://www.youtube-nocookie.com https://www.youtube.com",
      `connect-src ${connectSrc}`,
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 390, 414, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "media.bentobabu.com",
      },
      {
        protocol: "https",
        hostname: "**.r2.cloudflarestorage.com",
      },
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
    ],
  },
  compress: true,
  poweredByHeader: false,
  experimental: {
    agentFeedback: true,
    optimizePackageImports: ["lucide-react"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
