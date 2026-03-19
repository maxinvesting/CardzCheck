import type { Metadata } from "next";
import "./globals.css";
import "../styles/businessTheme.css";
import { AuthProvider } from "@/contexts/AuthContext";

export const metadata: Metadata = {
  title: "CardzCheck — The Intelligence Platform for Sports Card Collectors and Businesses",
  description:
    "Grade probability, pricing estimates, collection tracking, and full business operations in one platform.",
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
