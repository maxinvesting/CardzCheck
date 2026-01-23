import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CardzCheck - Sports Card Price Comps",
  description: "Find sports card prices and track your collection. Card Ladder charges $200/year. We charge $20.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 dark:bg-gray-950">
        {children}
      </body>
    </html>
  );
}
