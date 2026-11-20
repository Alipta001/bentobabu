import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/providers/Providers";
import { brandConfig } from "@/config/brand";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: {
    default: `${brandConfig.name} | ${brandConfig.tagline}`,
    template: `%s | ${brandConfig.name}`,
  },
  description: brandConfig.description,
  keywords: [
    "healthy food",
    "protein meals",
    "fitness food India",
    "fresh fruit bowls",
    "balanced diet",
    "school nutritious meals",
    "senior citizen soft meals",
    "office healthy lunch",
  ],
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "96x96" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  authors: [{ name: brandConfig.name }],
  openGraph: {
    title: `${brandConfig.name} | ${brandConfig.tagline}`,
    description: brandConfig.description,
    type: "website",
    locale: "en_IN",
    siteName: brandConfig.name,
    images: [
      {
        url: brandConfig.logo.imagePath,
        width: 1040,
        height: 1024,
        alt: brandConfig.name,
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#354B35",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full scroll-smooth">
      <body className="min-h-full flex flex-col font-sans bg-[#F7F3EA] text-[#222922] antialiased selection:bg-[#354B35] selection:text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
