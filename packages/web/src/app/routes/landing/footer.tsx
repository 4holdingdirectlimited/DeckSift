import { DeckSiftMark } from "@/components/decksift-mark";
import { DISCORD_URL, UPSTREAM_URL } from "@/lib/links";
import { IconBrandDiscord } from "@tabler/icons-react";
import { Link } from "react-router-dom";

export function LandingFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row">
        <Link to="/" className="flex items-center gap-2">
          <DeckSiftMark className="size-6 rounded-md" />
          <span className="font-heading text-xs font-semibold">
            DeckSift
          </span>
        </Link>

        <nav className="flex items-center gap-5 text-xs text-muted-foreground">
          <a
            href="#features"
            className="transition-colors hover:text-foreground"
          >
            Features
          </a>
          <a
            href="#how-it-works"
            className="transition-colors hover:text-foreground"
          >
            How it works
          </a>
          <a
            href="#open-source"
            className="transition-colors hover:text-foreground"
          >
            Open source
          </a>
          <Link to="/build" className="transition-colors hover:text-foreground">
            Build
          </Link>
          <Link to="/app" className="transition-colors hover:text-foreground">
            Open app
          </Link>
        </nav>

        <div className="flex items-center gap-4">
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Join the Discord"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <IconBrandDiscord size={18} />
          </a>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} DeckSift by 4holdingdirectlimited · v{__APP_VERSION__}
          </p>
        </div>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-6 text-center text-[11px] text-muted-foreground/70">
        DeckSift is a fork of{" "}
        <a
          href={UPSTREAM_URL}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 transition-colors hover:text-foreground"
        >
          MAULT
        </a>{" "}
        by dishwasher-detergent. The v1 machine's Fusion 3D design and build
        photos are his work (MIT); the DeckSift software stack, firmware
        changes, and revised print files are ours. Personal use of
        DeckSift is free; commercial use is by license from 4holdingdirectlimited.
      </p>
    </footer>
  );
}
