import { UPSTREAM_URL } from "@/lib/links";
import { IconPigFilled } from "@tabler/icons-react";
import { Link } from "react-router-dom";

export function BuildFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
            <IconPigFilled className="size-3.5" />
          </span>
          <span className="font-heading text-xs font-semibold">
            Magic Vault
          </span>
        </Link>

        <nav className="flex items-center gap-5 text-xs text-muted-foreground">
          <Link to="/#open-source" className="transition-colors hover:text-foreground">
            Open source
          </Link>
          <a
            href="https://github.com/dishwasher-detergent/mault/issues/new"
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
          © {new Date().getFullYear()} Magic Vault
        </p>
      </div>
      <p className="mx-auto max-w-4xl px-4 pb-6 text-center text-[11px] text-muted-foreground/70">
        Build photos, parts list, and the 3D model are from the original{" "}
        <a
          href={UPSTREAM_URL}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 transition-colors hover:text-foreground"
        >
          MAULT
        </a>{" "}
        project by dishwasher-detergent (MIT).
      </p>
    </footer>
  );
}
