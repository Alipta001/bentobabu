import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Customer Support",
  description:
    "Get help with your BentoBabu orders, delivery slots, or account inquiries.",
  alternates: {
    canonical: "/support",
  },
};

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
