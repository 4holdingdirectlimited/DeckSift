const STATS = [
  { value: "7", label: "sort bins per run" },
  { value: "5", label: "TCGs with built-in data" },
  { value: "∞", label: "collections, no limit" },
  { value: "~1s", label: "to identify a card, on-device" },
];

export function LandingStats() {
  return (
    <section className="border-y bg-secondary/30">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 md:grid-cols-4">
        {STATS.map((stat) => (
          <div key={stat.label} className="flex flex-col items-center text-center">
            <span className="font-heading text-2xl font-semibold text-primary md:text-3xl">
              {stat.value}
            </span>
            <span className="mt-1 text-xs/relaxed text-muted-foreground">
              {stat.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
