import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/providers/Providers";
import { brandConfig } from "@/config/brand";

export const metadata: Metadata = {
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
  authors: [{ name: brandConfig.name }],
  openGraph: {
    title: `${brandConfig.name} | ${brandConfig.tagline}`,
    description: brandConfig.description,
    type: "website",
    locale: "en_IN",
    siteName: brandConfig.name,
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
