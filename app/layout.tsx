import type { Metadata, Viewport } from "next";
import "./globals.css";
import "../styles/businessTheme.css";
import { AppProviders } from "@/components/AppProviders";

export const metadata: Metadata = {
  title: "CardzCheck - Inventory and Sales Software for Card Businesses",
  description:
    "Manage sports card inventory, listings, sales, teams, and ledger workflows in one business workspace.",
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
