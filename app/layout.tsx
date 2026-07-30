import type { Metadata, Viewport } from "next";
import "./globals.css";
import "../styles/businessTheme.css";
import { AppProviders } from "@/components/AppProviders";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${BRAND_NAME} — ${BRAND_TAGLINE}`,
  description:
    "Manage card inventory, sales, trades, and ledger workflows in one business workspace.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
