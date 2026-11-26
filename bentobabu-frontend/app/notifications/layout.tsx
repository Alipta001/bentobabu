import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false, follow: true },
};

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
