import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";

export const metadata: Metadata = {
  title: "CardzCheck - Sports Card Price Comps",
  description: "The all-in-one card tool. AI grade analysis, an analyst that knows your collection, estimated CMV, and tracking.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
