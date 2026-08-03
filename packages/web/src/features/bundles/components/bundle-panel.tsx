import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  DynamicDialog,
  useDialogClose,
} from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  useBundles,
} from "@/features/bundles/api/use-bundles";
import type { BundleConfigWithRun } from "@/features/bundles/api/bundles";
import {
  bundleTargetKey,
  type BundleTarget,
  type FoilFilter,
} from "@magic-vault/shared";
import { cn } from "@/lib/utils";
import {
  IconEdit,
  IconLoader2,
  IconPlayerPlay,
  IconPlayerStop,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const DEFAULT_TARGETS: BundleTarget[] = [
  { rarity: "common", count: 15, binNumber: 1 },
  { rarity: "uncommon", count: 15, binNumber: 2 },
  { rarity: "rare", count: 5, binNumber: 3 },
  { rarity: "mythic", count: 5, binNumber: 4 },
];

function titleCase(rarity: string): string {
  return rarity
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─── Config editor dialog ─────────────────────────────────────────────────────

function BundleConfigDialog({
  open,
  onOpenChange,
  config,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config?: BundleConfigWithRun | null;
}) {
  const { createConfig, updateConfig } = useBundles();
  const [name, setName] = useState(config?.name ?? "");
  const [targets, setTargets] = useState<BundleTarget[]>(
    config?.targets?.length ? config.targets : DEFAULT_TARGETS,
  );
  const [rejectBinNumber, setRejectBinNumber] = useState(
    config?.rejectBinNumber ?? 7,
  );
  const [allowDuplicates, setAllowDuplicates] = useState(
    config?.allowDuplicates ?? false,
  );
  const [holoDetection, setHoloDetection] = useState(
    config?.holoDetection ?? false,
  );
  const [saving, setSaving] = useState(false);
  const close = useDialogClose();

  // Re-seed the form every time the dialog opens (the component stays mounted,
  // so the initial useState values above would otherwise go stale).
  useEffect(() => {
    if (open) {
      setName(config?.name ?? "");
      setTargets(config?.targets?.length ? config.targets : DEFAULT_TARGETS);
      setRejectBinNumber(config?.rejectBinNumber ?? 7);
      setAllowDuplicates(config?.allowDuplicates ?? false);
      setHoloDetection(config?.holoDetection ?? false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const valid = name.trim().length > 0 && targets.length > 0;

  function updateTarget(index: number, patch: Partial<BundleTarget>) {
    setTargets((prev) =>
      prev.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    );
  }

  async function handleSave() {
    const cleaned = targets
      .filter((t) => t.rarity.trim() && t.count > 0)
      .map((t) => ({
        rarity: t.rarity.trim().toLowerCase(),
        count: Math.max(1, Math.floor(t.count)),
        binNumber: Math.max(1, Math.floor(t.binNumber)),
        ...(t.foil && t.foil !== "any" ? { foil: t.foil } : {}),
      }));
    if (cleaned.length === 0) {
      toast.error("Add at least one rarity target");
      return;
    }
    setSaving(true);
    const payload = {
      name: name.trim(),
      targets: cleaned,
      rejectBinNumber: Math.max(1, Math.floor(rejectBinNumber)),
      allowDuplicates,
      holoDetection,
    };
    if (config) {
      await updateConfig(config.guid, payload);
    } else {
      await createConfig(payload);
    }
    setSaving(false);
    close();
  }

  return (
    <DynamicDialog
      open={open}
      onOpenChange={onOpenChange}
      title={config ? "Edit bundle" : "New bundle"}
      description="Each rarity target fills one bin. Rejects (duplicates, full slots, foil mismatches) go to the reject bin."
      className="sm:max-w-xl"
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!valid || saving}>
            {saving && <IconLoader2 className="size-3 animate-spin" />}
            {config ? "Save changes" : "Create bundle"}
          </Button>
        </>
      }
    >
      <Field>
        <FieldLabel>Name</FieldLabel>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Standard Bundle (15/15/5/5)"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center justify-between rounded-lg border px-3 py-2">
          <div className="flex flex-col">
            <span className="text-xs font-medium">Allow duplicates</span>
            <span className="text-[11px] text-muted-foreground">
              Same card can be placed more than once
            </span>
          </div>
          <Switch
            checked={allowDuplicates}
            onCheckedChange={setAllowDuplicates}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border px-3 py-2">
          <div className="flex flex-col">
            <span className="text-xs font-medium">Holo detection</span>
            <span className="text-[11px] text-muted-foreground">
              Use the scan light to filter foil cards
            </span>
          </div>
          <Switch
            checked={holoDetection}
            onCheckedChange={setHoloDetection}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel>Rarity targets</FieldLabel>
        <div
          className={cn(
            "grid gap-2 items-center text-xs text-muted-foreground px-1",
            holoDetection
              ? "grid-cols-[1fr_6rem_4rem_4rem_2rem]"
              : "grid-cols-[1fr_4rem_4rem_2rem]",
          )}
        >
          <span>Rarity</span>
          <span className="text-center">Foil</span>
          <span className="text-center">Count</span>
          <span className="text-center">Bin</span>
          <span />
        </div>
        {targets.map((target, i) => (
          <div
            key={i}
            className={cn(
              "grid gap-2 items-center",
              holoDetection
                ? "grid-cols-[1fr_6rem_4rem_4rem_2rem]"
                : "grid-cols-[1fr_4rem_4rem_2rem]",
            )}
          >
            <Input
              value={target.rarity}
              onChange={(e) => updateTarget(i, { rarity: e.target.value })}
              placeholder="common"
            />
            {holoDetection && (
              <Select
                value={target.foil ?? "any"}
                onValueChange={(v) =>
                  updateTarget(i, { foil: (v ?? "any") as FoilFilter })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="nonfoil">Non-foil</SelectItem>
                  <SelectItem value="foil">Foil</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Input
              type="number"
              min={1}
              value={target.count}
              onChange={(e) =>
                updateTarget(i, { count: parseInt(e.target.value, 10) || 0 })
              }
            />
            <Input
              type="number"
              min={1}
              value={target.binNumber}
              onChange={(e) =>
                updateTarget(i, {
                  binNumber: parseInt(e.target.value, 10) || 0,
                })
              }
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground"
              onClick={() =>
                setTargets((prev) => prev.filter((_, idx) => idx !== i))
              }
            >
              <IconTrash className="size-4" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            setTargets((prev) => [
              ...prev,
              {
                rarity: "",
                count: 5,
                binNumber: Math.min(7, prev.length + 1),
                ...(holoDetection ? { foil: "any" as FoilFilter } : {}),
              },
            ])
          }
        >
          <IconPlus className="size-3" /> Add rarity
        </Button>
      </div>

      <Field>
        <FieldLabel>Reject bin number</FieldLabel>
        <Input
          type="number"
          min={1}
          value={rejectBinNumber}
          onChange={(e) =>
            setRejectBinNumber(parseInt(e.target.value, 10) || 1)
          }
        />
      </Field>
    </DynamicDialog>
  );
}

// ─── Active run progress ──────────────────────────────────────────────────────

function BundleProgress() {
  const { configs, activeRun, abortRun } = useBundles();
  const config = useMemo(
    () => configs.find((c) => c.guid === activeRun?.configGuid),
    [configs, activeRun],
  );
  if (!activeRun || !config) return null;

  const totalTarget = config.targets.reduce((n, t) => n + t.count, 0);
  const totalPlaced = Math.min(
    config.targets.reduce(
      (n, t) => n + (activeRun.counts[bundleTargetKey(t)] ?? 0),
      0,
    ),
    totalTarget,
  );

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold truncate">{config.name}</span>
        <span className="flex items-center gap-2 shrink-0">
          {(activeRun.totalValueUsd ?? 0) > 0 && (
            <span className="text-xs font-semibold text-emerald-500 tabular-nums">
              ${(activeRun.totalValueUsd ?? 0).toFixed(2)}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {totalPlaced}/{totalTarget}
          </span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-all"
          style={{
            width: `${totalTarget > 0 ? (totalPlaced / totalTarget) * 100 : 0}%`,
          }}
        />
      </div>
      <div className="flex flex-col gap-1">
        {config.targets.map((target) => {
          const count = activeRun.counts[bundleTargetKey(target)] ?? 0;
          const done = count >= target.count;
          return (
            <div
              key={bundleTargetKey(target)}
              className="flex items-center justify-between text-xs"
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <span
                  className={cn(
                    "size-1.5 rounded-full shrink-0",
                    done ? "bg-emerald-500" : "bg-muted-foreground/40",
                  )}
                />
                <span className="truncate">{titleCase(target.rarity)}</span>
                {target.foil && target.foil !== "any" && (
                  <span className="text-[10px] text-muted-foreground">
                    {target.foil === "foil" ? "(foil)" : "(non-foil)"}
                  </span>
                )}
                <span className="text-muted-foreground">
                  → bin {target.binNumber}
                </span>
              </span>
              <span className={cn("shrink-0", done && "text-emerald-500")}>
                {count}/{target.count}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          Reject → bin {config.rejectBinNumber}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void abortRun(config.guid)}
        >
          <IconPlayerStop className="size-3" /> Abort
        </Button>
      </div>
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function BundlePanel() {
  const { configs, isBundleActive, startRun, deleteConfig } = useBundles();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BundleConfigWithRun | null>(null);

  if (isBundleActive) {
    return (
      <Field>
        <FieldLabel>Bundle Mode</FieldLabel>
        <BundleProgress />
      </Field>
    );
  }

  return (
    <Field>
      <FieldLabel>Bundle Mode</FieldLabel>
      {configs.length === 0 ? (
        <p className="text-xs text-muted-foreground rounded-lg border p-2">
          No bundle configs yet. Create one to assemble fixed-composition
          bundles (e.g. 15/15/5/5) with no duplicate cards.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {configs.map((config) => (
            <div
              key={config.guid}
              className="flex items-center gap-1.5 rounded-lg border px-2 py-1.5"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{config.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {config.targets
                    .map((t) => `${t.count} ${t.rarity}`)
                    .join(", ")}{" "}
                  · reject bin {config.rejectBinNumber}
                </p>
              </div>
              <Button
                variant="secondary"
                size="icon"
                className="size-8 shrink-0"
                title="Start run"
                onClick={() => void startRun(config.guid)}
              >
                <IconPlayerPlay className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-muted-foreground"
                title="Edit"
                onClick={() => {
                  setEditing(config);
                  setDialogOpen(true);
                }}
              >
                <IconEdit className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-muted-foreground"
                title="Delete"
                onClick={() => void deleteConfig(config.guid)}
              >
                <IconTrash className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <Button
        variant="outline"
        size="sm"
        className="self-start mt-1"
        onClick={() => {
          setEditing(null);
          setDialogOpen(true);
        }}
      >
        <IconPlus className="size-3" /> New bundle
      </Button>
      <BundleConfigDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        config={editing}
      />
    </Field>
  );
}
