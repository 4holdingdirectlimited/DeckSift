import { DeckSiftMark } from "@/components/decksift-mark";
import { UPSTREAM_URL } from "@/lib/links";
import { Link } from "react-router-dom";

export function BuildFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row">
        <Link to="/" className="flex items-center gap-2">
          <DeckSiftMark className="size-6 rounded-md" />
          <span className="font-heading text-xs font-semibold">
            DeckSift
          </span>
        </Link>

        <nav className="flex items-center gap-5 text-xs text-muted-foreground">
          <Link to="/#open-source" className="transition-colors hover:text-foreground">
            Open source
          </Link>
          <a
            href="https://github.com/4holdingdirectlimited/DeckSift/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            Report an issue
          </a>
          <Link to="/app" className="transition-colors hover:text-foreground">
            Open app
          </Link>
        </nav>

        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} DeckSift by 4holdingdirectlimited
        </p>
      </div>
      <p className="mx-auto max-w-4xl px-4 pb-6 text-center text-[11px] text-muted-foreground/70">
        The v1 machine's Fusion 3D design, build photos, parts list, and
        firmware base are from the original{" "}
        <a
          href={UPSTREAM_URL}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 transition-colors hover:text-foreground"
        >
          MAULT
        </a>{" "}
        project by dishwasher-detergent (MIT) — the sorter we built from.
        DeckSift adds a revised Bambu Lab quantity kit with print-optimized
        part organization, plus the local software stack and firmware changes.
      </p>
    </footer>
  );
}
