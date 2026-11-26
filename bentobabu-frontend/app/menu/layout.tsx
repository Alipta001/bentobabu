import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Healthy Meal Menu",
  description:
    "Browse freshly prepared protein bowls, salads, and wholesome bento meals from BentoBabu.",
  alternates: {
    canonical: "/menu",
  },
};

export default function MenuLayout({ children }: { children: React.ReactNode }) {
  return children;
}
