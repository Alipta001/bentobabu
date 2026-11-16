import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProviders } from "@/providers/AppProviders";

export const metadata: Metadata = {
  title: "BentoBabu Delivery Partner",
  description: "Official delivery partner application for BentoBabu.",
};

export const viewport: Viewport = {
  themeColor: "#C86D51",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col font-sans bg-[#FBF9F6] text-[#241C1A] antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
