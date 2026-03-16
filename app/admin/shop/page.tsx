import { redirect } from "next/navigation";
import Link from "next/link";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import { getAdminAuth, isOwner } from "@/lib/admin";
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
            <h1 className="text-2xl font-bold">Marketplace Manager</h1>
            <p className="text-sm text-gray-400 mt-1">
              Manage marketplace listings, sync from business inventory, and upload
              images.
            </p>
            <div className="mt-2 flex flex-wrap gap-4">
              <Link
                href="/admin/news"
                className="text-sm text-cyan-400 hover:text-cyan-300"
              >
                Manage news &amp; announcements
              </Link>
              {isOwner(admin.user) && (
                <Link
                  href="/admin/access"
                  className="text-sm text-cyan-400 hover:text-cyan-300"
                >
                  Manage admin access
                </Link>
              )}
            </div>
          </div>
          <AdminShopClient />
        </div>
      </main>
    </AuthenticatedLayout>
  );
}
