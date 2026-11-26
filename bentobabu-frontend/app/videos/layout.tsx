import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kitchen Videos & Recipes",
  description:
    "Watch BentoBabu kitchen stories, meal preparation highlights, and healthy food videos.",
  alternates: {
    canonical: "/videos",
  },
};

export default function VideosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
