"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";

function SearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Redirect to comps page, preserving all search params
    const params = new URLSearchParams(searchParams.toString());
    router.replace(`/comps?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <AuthenticatedLayout>
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    </AuthenticatedLayout>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <AuthenticatedLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </AuthenticatedLayout>
    }>
      <SearchPageContent />
    </Suspense>
  );
}
