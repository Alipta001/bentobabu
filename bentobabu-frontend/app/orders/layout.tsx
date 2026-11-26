import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your Orders",
  robots: { index: false, follow: true },
};

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
