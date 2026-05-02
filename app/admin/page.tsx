import { redirect } from "next/navigation";
import Link from "next/link";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import { getAdminAuth, isOwner } from "@/lib/admin";

export default async function AdminHubPage() {
  const admin = await getAdminAuth();

  if (!admin.user) {
    redirect("/dashboard");
  }

  return (
    <AuthenticatedLayout>
      <main className="p-6 lg:p-10 text-white">
        <div className="max-w-3xl mx-auto space-y-8">
          <div>
            <h1 className="text-2xl font-bold">Admin</h1>
            <p className="text-sm text-gray-400 mt-1">
              Manage CardzCheck marketplace listings and platform announcements.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/admin/marketplace"
              className="group rounded-xl border border-gray-800 bg-gray-900 p-6 hover:border-cyan-500 transition-colors"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold group-hover:text-cyan-400 transition-colors">Marketplace</h2>
              </div>
              <p className="text-sm text-gray-400">
                Intake queue, flagged listings, vault inventory, and transactions for the fixed-price exchange.
              </p>
            </Link>

            <Link
              href="/admin/news"
              className="group rounded-xl border border-gray-800 bg-gray-900 p-6 hover:border-cyan-500 transition-colors"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold group-hover:text-cyan-400 transition-colors">News &amp; Announcements</h2>
              </div>
              <p className="text-sm text-gray-400">
                Post platform announcements and updates that appear in the News section for users.
              </p>
            </Link>

            {isOwner(admin.user) && (
              <Link
                href="/admin/access"
                className="group rounded-xl border border-gray-800 bg-gray-900 p-6 hover:border-cyan-500 transition-colors"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold group-hover:text-cyan-400 transition-colors">Admin Access</h2>
                </div>
                <p className="text-sm text-gray-400">
                  Grant or revoke admin roles for other users.
                </p>
              </Link>
            )}
          </div>
        </div>
      </main>
    </AuthenticatedLayout>
  );
}
