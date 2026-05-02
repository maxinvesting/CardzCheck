import { redirect } from "next/navigation";
import Link from "next/link";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import { getAdminAuth } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";
import IntakeQueueClient, { type IntakeRow } from "./IntakeQueueClient";

export const dynamic = "force-dynamic";

export default async function IntakeQueuePage() {
  const admin = await getAdminAuth();
  if (!admin.user) redirect("/");

  const service = await createServiceClient();
  const { data, error } = await service
    .from("marketplace_cards")
    .select(
      "id, title, player, year, manufacturer, grade, grading_service, estimated_value_cents, created_at"
    )
    .eq("intake_approved", false)
    .order("created_at", { ascending: false });

  const rows = ((data ?? []) as IntakeRow[]) ?? [];

  return (
    <AuthenticatedLayout>
      <main className="p-6 lg:p-10 text-white">
        <div className="max-w-5xl mx-auto space-y-6">
          <div>
            <Link
              href="/admin/marketplace"
              className="text-sm text-gray-400 hover:text-white"
            >
              ← Marketplace
            </Link>
            <h1 className="text-2xl font-bold mt-2">Intake queue</h1>
            <p className="text-sm text-gray-400 mt-1">
              Cards awaiting approval. Approve into a pipeline or reject.
            </p>
          </div>
          {error ? (
            <p className="text-sm text-red-400">{error.message}</p>
          ) : (
            <IntakeQueueClient rows={rows} />
          )}
        </div>
      </main>
    </AuthenticatedLayout>
  );
}
