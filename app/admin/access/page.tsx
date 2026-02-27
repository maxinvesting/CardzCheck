import { redirect } from "next/navigation";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import { getOwnerAuth } from "@/lib/admin";
import AdminAccessClient from "@/app/admin/access/AdminAccessClient";

export default async function AdminAccessPage() {
  const owner = await getOwnerAuth();

  if (!owner.user) {
    redirect("/comps");
  }

  return (
    <AuthenticatedLayout>
      <main className="p-6 text-white lg:p-10">
        <div className="mx-auto max-w-4xl space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Access Control</h1>
            <p className="mt-1 text-sm text-gray-400">
              Assign app roles for owner and admin access.
            </p>
          </div>

          <AdminAccessClient />
        </div>
      </main>
    </AuthenticatedLayout>
  );
}
