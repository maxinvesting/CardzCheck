import { redirect } from "next/navigation";
import Link from "next/link";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import { getAdminAuth } from "@/lib/admin";
import AdminNewsClient from "./AdminNewsClient";

export default async function AdminNewsPage() {
  const admin = await getAdminAuth();

  if (!admin.user) {
    redirect("/comps");
  }

  return (
    <AuthenticatedLayout>
      <main className="p-6 lg:p-10 text-white">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold">News &amp; Announcements</h1>
            <p className="text-sm text-gray-400 mt-1">
              Create and manage platform announcements that appear in the News section for users.
            </p>
            <Link
              href="/admin"
              className="mt-2 inline-block text-sm text-cyan-400 hover:text-cyan-300"
            >
              ← Back to admin
            </Link>
          </div>
          <AdminNewsClient />
        </div>
      </main>
    </AuthenticatedLayout>
  );
}
