import type { Metadata } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import { SITE_URL } from "@/lib/brand";
import { QueryProvider } from "@/lib/query-provider";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
// Editorial serif for the italic accent words in headlines
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif" });

const TITLE = "Dropboard: turn any spreadsheet into a dashboard";
const DESCRIPTION = "Drop an Excel, CSV or JSON file and get an instant dashboard with KPIs and charts. Runs in your browser, so your data never leaves your device.";

export const metadata: Metadata = {
  // the address that links in the preview tags are made absolute from
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  // the picture shown when a link is shared comes from opengraph-image.png and twitter-image.png in this folder
  openGraph: { type: "website", siteName: "Dropboard", title: TITLE, description: DESCRIPTION, url: "/" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable, serif.variable)}>
      <body suppressHydrationWarning className="flex min-h-screen flex-col bg-background text-foreground antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
