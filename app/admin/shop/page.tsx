import { redirect } from "next/navigation";
import Link from "next/link";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import { getAdminAuth } from "@/lib/admin";
import AdminShopClient from "@/app/admin/shop/AdminShopClient";

export default async function AdminShopPage() {
  const admin = await getAdminAuth();

  if (!admin.user) {
    redirect("/comps");
  }

  return (
    <AuthenticatedLayout>
      <main className="p-6 lg:p-10 text-white">
        <div className="max-w-6xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Shop Manager</h1>
            <p className="text-sm text-gray-400 mt-1">
              Manage shop listings, sync from business inventory, and upload
              images.
            </p>
            {admin.user.appRole === "owner" && (
              <Link
                href="/admin/access"
                className="mt-2 inline-block text-sm text-cyan-400 hover:text-cyan-300"
              >
                Manage admin access
              </Link>
            )}
          </div>
          <AdminShopClient />
        </div>
      </main>
    </AuthenticatedLayout>
  );
}
