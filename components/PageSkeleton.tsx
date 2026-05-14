import AuthenticatedLayout from "./AuthenticatedLayout";

type Variant = "grid" | "list" | "detail";

export default function PageSkeleton({
  variant = "list",
  title,
}: {
  variant?: Variant;
  title?: string;
}) {
  return (
    <AuthenticatedLayout>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto w-full animate-pulse">
        <div className="mb-6">
          {title ? (
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 opacity-60">
              {title}
            </h1>
          ) : (
            <div className="h-7 w-48 rounded bg-gray-200 dark:bg-gray-800" />
          )}
          <div className="mt-2 h-4 w-72 rounded bg-gray-200 dark:bg-gray-800" />
        </div>

        {variant === "grid" ? <GridSkeleton /> : null}
        {variant === "list" ? <ListSkeleton /> : null}
        {variant === "detail" ? <DetailSkeleton /> : null}
      </div>
    </AuthenticatedLayout>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-3"
        >
          <div className="aspect-[3/4] w-full rounded bg-gray-200 dark:bg-gray-800" />
          <div className="mt-3 h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-800" />
          <div className="mt-2 h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-800" />
        </div>
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4"
        >
          <div className="h-12 w-12 rounded bg-gray-200 dark:bg-gray-800" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/3 rounded bg-gray-200 dark:bg-gray-800" />
            <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-800" />
          </div>
          <div className="h-6 w-20 rounded bg-gray-200 dark:bg-gray-800" />
        </div>
      ))}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 h-24"
          />
        ))}
      </div>
      <div className="rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-6 h-64" />
    </div>
  );
}
