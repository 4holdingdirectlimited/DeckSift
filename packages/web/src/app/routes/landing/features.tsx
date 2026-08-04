import {
  IconAdjustments,
  IconChartBar,
  IconDeviceDesktop,
  IconFolders,
  IconScan,
  IconStack2,
} from "@tabler/icons-react";

const FEATURES = [
  {
    icon: IconScan,
    title: "Instant recognition",
    description:
      "No typing card names, no barcodes. Just show the card and DeckSift knows what it is.",
  },
  {
    icon: IconAdjustments,
    title: "Rules you control",
    description:
      "Mix and match conditions - rarity, color, set, type, value and more - to route cards exactly where you want.",
  },
  {
    icon: IconFolders,
    title: "Multiple collections",
    description:
      "Keep separate collections for trade binders, decks, or storage boxes, and switch between them freely.",
  },
  {
    icon: IconChartBar,
    title: "Know what you own",
    description:
      "See counts, rarities, sets, and value across your whole library - no more guessing what's in the box.",
  },
  {
    icon: IconStack2,
    title: "Bundles & chase sets",
    description:
      "Assemble fixed-composition bundles with no duplicates, or route every missing card from a set into one pile.",
  },
  {
    icon: IconDeviceDesktop,
    title: "Built for the table",
    description:
      "Pairs with a physical sorter, so cards land in real bins - not just another spreadsheet.",
  },
];

export function LandingFeatures() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-primary">
          Features
        </span>
        <h2 className="mt-2 font-heading text-2xl font-semibold tracking-tight md:text-3xl">
          Everything you need to get organized
        </h2>
        <p className="mt-3 text-sm/relaxed text-muted-foreground md:text-base/relaxed">
          DeckSift handles the sorting so you can spend more time playing and
          less time digging through boxes.
        </p>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="group flex flex-col gap-3 rounded-xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary/20 via-primary/10 to-transparent text-primary ring-1 ring-primary/20">
              <feature.icon size={18} />
            </span>
            <div>
              <p className="font-heading text-sm font-semibold">
                {feature.title}
              </p>
              <p className="mt-1 text-xs/relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
