import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AdminProviders } from "@/providers/AdminProviders";

export const metadata: Metadata = {
  title: "Bento Babu | Kitchen & Business Management",
  description: "Executive control panel for Bento Babu mindful Indian nutrition e-commerce.",
  manifest: "/manifest.json",
  icons: {
    icon: "/bentobabu_logo.png",
    shortcut: "/bentobabu_logo.png",
    apple: "/bentobabu_logo.png",
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
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col font-sans bg-[#F9F7F1] text-[#1F271F] antialiased selection:bg-[#354B35] selection:text-white">
        <AdminProviders>{children}</AdminProviders>
      </body>
    </html>
  );
}
