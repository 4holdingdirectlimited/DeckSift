import { DISCORD_URL, UPSTREAM_URL } from "@/lib/links";
import { IconBrandDiscord, IconPigFilled } from "@tabler/icons-react";
import { Link } from "react-router-dom";

export function LandingFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
            <IconPigFilled className="size-3.5" />
          </span>
          <span className="font-heading text-xs font-semibold">
            Magic Vault
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
            © {new Date().getFullYear()} Magic Vault · v{__APP_VERSION__}
          </p>
        </div>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-6 text-center text-[11px] text-muted-foreground/70">
        A fork of{" "}
        <a
          href={UPSTREAM_URL}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 transition-colors hover:text-foreground"
        >
          MAULT
        </a>{" "}
        by dishwasher-detergent (MIT). Build photos and the 3D model come from the
        original project.
      </p>
    </footer>
  );
}
