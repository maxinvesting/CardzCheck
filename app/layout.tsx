import type { Metadata } from "next";
import "./globals.css";
import "../styles/businessTheme.css";
import { AuthProvider } from "@/contexts/AuthContext";

export const metadata: Metadata = {
  title: "CardzCheck - Card Pricing and Portfolio Workspace",
  description:
    "CardzCheck gives collectors and sellers live comps, grading probability insights, and collection or inventory tracking in one workspace.",
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
