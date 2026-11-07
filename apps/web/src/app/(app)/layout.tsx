import type { Metadata } from "next";
import { AppFrame } from "@/components/app/AppFrame";

export const metadata: Metadata = { title: "Dropboard", robots: { index: false } };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppFrame>{children}</AppFrame>;
}
