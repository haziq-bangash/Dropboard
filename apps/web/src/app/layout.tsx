import type { Metadata } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
// Editorial serif for the italic accent words in headlines
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "Dropboard: turn any spreadsheet into a dashboard",
  description:
    "Drop an Excel, CSV or JSON file and get an instant dashboard with KPIs and charts. Runs in your browser, so your data never leaves your device.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable, serif.variable)}>
      <body suppressHydrationWarning className="flex min-h-screen flex-col bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
