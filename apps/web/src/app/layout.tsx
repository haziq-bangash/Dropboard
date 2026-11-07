import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dropboard: turn any spreadsheet into a dashboard",
  description:
    "Drop an Excel, CSV or JSON file and get an instant dashboard with KPIs and charts. Runs in your browser, so your data never leaves your device.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
