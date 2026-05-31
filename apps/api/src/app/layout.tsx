import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HealthFlow API",
  description: "HealthFlow backend — multi-agent healthcare pipeline",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
