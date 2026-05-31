import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "MeridianHealth Provider Portal",
  description: "Prior authorization submission portal — MeridianHealth",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="pp-header">
          <div className="pp-header-inner">
            <Link href="/" className="pp-brand">
              <span className="pp-logo">✚</span>
              <span>
                <span className="pp-brand-name">MeridianHealth</span>
                <span className="pp-brand-sub">Provider Portal</span>
              </span>
            </Link>
            <nav className="pp-nav">
              <Link href="/submit">Submit Request</Link>
              <Link href="/control">Operator Console</Link>
            </nav>
          </div>
        </header>
        <main className="pp-main">{children}</main>
        <footer className="pp-footer">
          MeridianHealth Inc. · Prior Authorization Services · For authorized providers only
        </footer>
      </body>
    </html>
  );
}
