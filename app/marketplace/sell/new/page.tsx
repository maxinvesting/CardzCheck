import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SellNewClient from "./SellNewClient";

export const dynamic = "force-dynamic";

export default async function SellNewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/marketplace/sell/new");

  return (
    <>
      <main className="p-6 lg:p-10 text-white">
        <div className="max-w-2xl mx-auto space-y-6">
          <div>
            <Link
              href="/marketplace/sell/listings"
              className="text-sm text-gray-400 hover:text-white"
            >
              ← My listings
            </Link>
            <h1 className="text-2xl font-bold mt-2">List a card</h1>
            <p className="text-sm text-gray-400 mt-1">
              Submit your card for intake, then choose self-serve or full-service.
            </p>
          </div>
          <SellNewClient />
        </div>
      </main>
    </>
  );
}
