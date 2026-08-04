import { buttonVariants } from "@/components/ui/button";
import {
  DISCORD_URL,
  FORK_REPO_URL,
  MODEL_URL,
  UPSTREAM_URL,
} from "@/lib/links";
import { cn } from "@/lib/utils";
import {
  IconBrandDiscord,
  IconBrandGithub,
  IconCube,
  IconDownload,
} from "@tabler/icons-react";
import { Link } from "react-router-dom";

export function LandingOpenSource() {
  return (
    <section id="open-source" className="mx-auto max-w-6xl px-4 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
          Open source, free for personal use
        </h2>
        <p className="mt-3 text-sm/relaxed text-muted-foreground md:text-base/relaxed">
          DeckSift is free to build, inspect, and modify for personal use.
          Commercial use is by license from the DeckSift team — we sell an
          upgraded version with more features for shops and small production.
        </p>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-6">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <IconBrandGithub size={18} />
          </span>
          <div>
            <p className="font-heading text-sm font-semibold">Source code</p>
            <p className="mt-1 text-xs/relaxed text-muted-foreground">
              The web app, API, and Arduino firmware are all in one repo.
              Free for personal use; commercial use needs a license.
            </p>
          </div>
          <a
            href={FORK_REPO_URL}
            target="_blank"
            rel="noreferrer"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "mt-2 self-start",
            )}
          >
            <IconBrandGithub size={16} />
            View on GitHub
          </a>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border bg-card p-6">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <IconBrandGithub size={18} />
          </span>
          <div>
            <p className="font-heading text-sm font-semibold">
              Built on MAULT
            </p>
            <p className="mt-1 text-xs/relaxed text-muted-foreground">
              The v1 machine's Fusion 3D design, build photos, and firmware
              base come from MAULT by dishwasher-detergent (MIT) — the
              original sorter we built from. Thanks for making it open.
            </p>
          </div>
          <a
            href={UPSTREAM_URL}
            target="_blank"
            rel="noreferrer"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "mt-2 self-start",
            )}
          >
            <IconBrandGithub size={16} />
            Visit the original
          </a>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border bg-card p-6">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <IconCube size={18} />
          </span>
          <div>
            <p className="font-heading text-sm font-semibold">
              3D printable sorter
            </p>
            <p className="mt-1 text-xs/relaxed text-muted-foreground">
              Print the card sorter yourself. The Fusion 360 design is the
              original MAULT file; DeckSift adds a revised Bambu Lab quantity
              kit with print-optimized part organization.
            </p>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href={MODEL_URL}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <IconDownload size={16} />
              Get the 3D model
            </a>
            <Link
              to="/build"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              Read the build guide
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border bg-card p-6">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <IconBrandDiscord size={18} />
          </span>
          <div>
            <p className="font-heading text-sm font-semibold">Community</p>
            <p className="mt-1 text-xs/relaxed text-muted-foreground">
              Join the Discord to share builds, get help, and talk to other
              people running their own sorter.
            </p>
          </div>
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noreferrer"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "mt-2 self-start",
            )}
          >
            <IconBrandDiscord size={16} />
            Join the Discord
          </a>
        </div>
      </div>
    </section>
  );
}
