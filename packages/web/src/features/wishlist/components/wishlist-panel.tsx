import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  DynamicDialog,
  useDialogClose,
} from "@/components/ui/responsive-dialog";
import { useWishlist } from "@/features/wishlist/api/use-wishlist";
import { useCollections } from "@/features/collections/api/use-collections";
import { cn } from "@/lib/utils";
import {
  IconHeart,
  IconLoader2,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useState } from "react";

function CreateWishlistDialog({
  open,
  onOpenChange,
  defaultGameKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultGameKey: string;
}) {
  const { createList } = useWishlist();
  const [name, setName] = useState("");
  const [binNumber, setBinNumber] = useState(5);
  const [saving, setSaving] = useState(false);
  const close = useDialogClose();

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    await createList({ name: name.trim(), gameKey: defaultGameKey, binNumber });
    setSaving(false);
    setName("");
    close();
  }

  return (
    <DynamicDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New wishlist"
      description="Wanted cards route to this bin instead of their normal rule bin."
      className="sm:max-w-sm"
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving && <IconLoader2 className="size-3 animate-spin" />}
            Create
          </Button>
        </>
      }
    >
      <Field>
        <FieldLabel>Name</FieldLabel>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Wanted singles"
        />
      </Field>
      <Field>
        <FieldLabel>Bin number</FieldLabel>
        <Input
          type="number"
          min={1}
          value={binNumber}
          onChange={(e) => setBinNumber(parseInt(e.target.value, 10) || 1)}
        />
      </Field>
    </DynamicDialog>
  );
}

export function WishlistPanel() {
  const { wishlists, addItem, removeItem, deleteList, updateList } =
    useWishlist();
  const { activeCollection } = useCollections();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [patterns, setPatterns] = useState<Record<string, string>>({});

  const gameKey = activeCollection?.game?.key ?? "";
  const lists = wishlists.filter((w) => w.gameKey === gameKey);

  if (!gameKey) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Wishlist
          </span>
        </div>
        <p className="text-xs text-muted-foreground rounded-lg border p-2">
          Select a collection to manage wishlists.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Wishlist
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-xs"
          onClick={() => setDialogOpen(true)}
        >
          <IconPlus className="size-3" /> New
        </Button>
      </div>

      {lists.length === 0 ? (
        <p className="text-xs text-muted-foreground rounded-lg border p-2">
          Add a wishlist to route wanted cards (by exact card or name pattern)
          into a bin.
        </p>
      ) : (
        lists.map((list) => (
          <div key={list.guid} className="rounded-lg border p-2 flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <IconHeart
                  className={cn(
                    "size-3.5 shrink-0",
                    list.isActive ? "text-red-400" : "text-muted-foreground/40",
                  )}
                />
                <span className="text-sm font-medium truncate">{list.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  → bin {list.binNumber}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "size-6",
                    list.isActive
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}
                  title={list.isActive ? "Active (click to disable)" : "Disabled (click to enable)"}
                  onClick={() =>
                    void updateList(list.guid, { isActive: !list.isActive })
                  }
                >
                  {list.isActive ? (
                    <IconHeart className="size-3.5" />
                  ) : (
                    <IconHeart className="size-3.5 opacity-40" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 text-muted-foreground"
                  title="Delete wishlist"
                  onClick={() => void deleteList(list.guid)}
                >
                  <IconTrash className="size-3.5" />
                </Button>
              </div>
            </div>

            {list.items.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {list.items.map((item) => (
                  <span
                    key={item.guid}
                    className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px]"
                  >
                    {item.cardId ? `id: ${item.cardId.slice(0, 8)}…` : item.namePattern}
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => void removeItem(list.guid, item.guid)}
                    >
                      <IconX className="size-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-1">
              <Input
                className="h-7 text-xs"
                placeholder="Add by name, e.g. Lightning Bolt"
                value={patterns[list.guid] ?? ""}
                onChange={(e) =>
                  setPatterns((prev) => ({ ...prev, [list.guid]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = (patterns[list.guid] ?? "").trim();
                    if (v) {
                      void addItem(list.guid, { namePattern: v });
                      setPatterns((prev) => ({ ...prev, [list.guid]: "" }));
                    }
                  }
                }}
              />
              <Button
                variant="outline"
                size="icon"
                className="size-7 shrink-0"
                onClick={() => {
                  const v = (patterns[list.guid] ?? "").trim();
                  if (v) {
                    void addItem(list.guid, { namePattern: v });
                    setPatterns((prev) => ({ ...prev, [list.guid]: "" }));
                  }
                }}
              >
                <IconPlus className="size-3.5" />
              </Button>
            </div>
          </div>
        ))
      )}

      <CreateWishlistDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultGameKey={gameKey}
      />
    </div>
  );
}
