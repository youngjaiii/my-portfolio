export function StoreLoadingState({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={`store-skel-${i}`} className="rounded-2xl bg-white p-3 shadow-sm">
          <div className="aspect-square w-full animate-pulse rounded-xl bg-gray-200" />
          <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-gray-200" />
          <div className="mt-1 h-4 w-1/2 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}




