import {
  IconCamera,
  IconLayoutGrid,
  IconRoute,
  IconSparkles,
} from "@tabler/icons-react";

const STEPS = [
  {
    icon: IconCamera,
    title: "Show it a card",
    description:
      "The feeder drops a card into the scan region - no phone apps or handheld scanners needed.",
  },
  {
    icon: IconSparkles,
    title: "It's recognized instantly",
    description:
      "DeckSift matches it against the full local card database in a moment, rarity, set and all.",
  },
  {
    icon: IconRoute,
    title: "Sorted by your rules",
    description:
      "Set up rules once - by rarity, color, set, type, value, or anything else - and every card routes itself.",
  },
  {
    icon: IconLayoutGrid,
    title: "Always organized",
    description:
      "Every card is logged and searchable, across as many collections as you keep.",
  },
];

export function LandingPipeline() {
  return (
    <section id="how-it-works" className="relative overflow-hidden bg-secondary/30 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-primary">
            How it works
          </span>
          <h2 className="mt-2 font-heading text-2xl font-semibold tracking-tight md:text-3xl">
            From loose pile to organized collection
          </h2>
          <p className="mt-3 text-sm/relaxed text-muted-foreground md:text-base/relaxed">
            Four steps, all on your own machine.
          </p>
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-4">
          {STEPS.map((step, i) => (
            <div
              key={step.title}
              className="relative flex flex-col items-start gap-3"
            >
              {/* connector line */}
              {i < STEPS.length - 1 && (
                <span className="absolute top-5 left-[3.25rem] hidden h-px w-[calc(100%-3.25rem)] bg-gradient-to-r from-primary/40 to-transparent md:block" />
              )}
              <div className="flex items-center gap-2.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-linear-to-br from-primary/20 via-primary/10 to-transparent text-primary ring-1 ring-primary/20">
                  <step.icon size={18} />
                </span>
                <span className="font-mono text-xs font-semibold text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <p className="font-heading text-sm font-semibold">{step.title}</p>
              <p className="text-xs/relaxed text-muted-foreground">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
