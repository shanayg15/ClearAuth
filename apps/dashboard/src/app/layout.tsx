import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClearAuth",
  description: "Autonomous prior-authorization agent for clinicians",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
