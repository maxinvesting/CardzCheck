import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Providers } from "./providers";
import { WalletButton } from "@/components/WalletButton";

export const metadata: Metadata = {
  title: "CardzCheck Pegged Market (Prototype)",
  description: "Hard-peg prototype marketplace for card SKUs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="min-h-screen">
            <header className="border-b border-slate-200 bg-white">
              <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
                <div className="flex items-center gap-4">
                  <Link href="/" className="text-lg font-semibold text-brand-900">
                    CardzCheck Pegged Market
                  </Link>
                  <nav className="flex items-center gap-3 text-sm text-slate-600">
                    <Link href="/" className="hover:text-slate-900">
                      Marketplace
                    </Link>
                    <Link href="/admin" className="hover:text-slate-900">
                      Admin
                    </Link>
                  </nav>
                </div>
                <WalletButton />
              </div>
            </header>
            <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
