export function GameGridSkeleton() {
  return (
    <div role="status" aria-label="Loading games" aria-busy="true">
      <span className="sr-only">Loading games...</span>
      <div aria-hidden="true" className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 12 }, (_, index) => (
          <div key={index} className="min-w-0 overflow-hidden rounded-xl border border-[#3a2470] bg-[#1b1038] motion-safe:animate-pulse">
            <div className="aspect-[1.2] bg-gradient-to-br from-[#3a2470] via-[#29194f] to-[#100a21]" />
            <div className="space-y-2 p-2">
              <div className="h-4 w-3/4 rounded bg-[#6d4ca3]/40" />
              <div className="h-3 w-1/2 rounded bg-[#6d4ca3]/25" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
