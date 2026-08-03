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
import { useChase } from "@/features/chase/api/use-chase";
import type { ChaseConfigWithRun } from "@/features/chase/api/chase";
import { browseLibrary } from "@/features/library/api/library";
import { useCollections } from "@/features/collections/api/use-collections";
import { useQuery } from "@tanstack/react-query";
import {
  IconEdit,
  IconLoader2,
  IconPlayerPlay,
  IconPlayerStop,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";

const GAMES = [
  { key: "mtg", label: "Magic" },
  { key: "pokemon", label: "Pokémon" },
  { key: "yugioh", label: "Yu-Gi-Oh!" },
  { key: "digimon", label: "Digimon" },
  { key: "gundam", label: "Gundam" },
];

function ChaseConfigDialog({
  open,
  onOpenChange,
  config,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config?: ChaseConfigWithRun | null;
}) {
  const { createConfig, updateConfig } = useChase();
  const { collections } = useCollections();
  const [name, setName] = useState(config?.name ?? "");
  const [gameKey, setGameKey] = useState(config?.gameKey ?? "mtg");
  const [setCode, setSetCode] = useState(config?.setCode ?? "");
  const [binNumber, setBinNumber] = useState(config?.binNumber ?? 3);
  const [rejectBinNumber, setRejectBinNumber] = useState(
    config?.rejectBinNumber ?? 7,
  );
  const [collectionGuid, setCollectionGuid] = useState(
    config?.collectionGuid ?? "",
  );
  const [saving, setSaving] = useState(false);
  const close = useDialogClose();

  useEffect(() => {
    if (open) {
      setName(config?.name ?? "");
      setGameKey(config?.gameKey ?? "mtg");
      setSetCode(config?.setCode ?? "");
      setBinNumber(config?.binNumber ?? 3);
      setRejectBinNumber(config?.rejectBinNumber ?? 7);
      setCollectionGuid(config?.collectionGuid ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const valid = name.trim() && gameKey && setCode.trim();

  async function handleSave() {
    if (!valid) return;
    setSaving(true);
    const payload = {
      name: name.trim(),
      gameKey,
      setCode: setCode.trim().toUpperCase(),
      binNumber,
      rejectBinNumber,
      ...(collectionGuid ? { collectionGuid } : {}),
    };
    if (config) await updateConfig(config.guid, payload);
    else await createConfig(payload);
    setSaving(false);
    close();
  }

  return (
    <DynamicDialog
      open={open}
      onOpenChange={onOpenChange}
      title={config ? "Edit set chase" : "New set chase"}
      description="Cards from this set that you don't own yet route to the chase bin; everything else goes to the reject bin."
      className="sm:max-w-lg"
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!valid || saving}>
            {saving && <IconLoader2 className="size-3 animate-spin" />}
            {config ? "Save changes" : "Create chase"}
          </Button>
        </>
      }
    >
      <Field>
        <FieldLabel>Name</FieldLabel>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Finish the Bloomburrow set"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel>Game</FieldLabel>
          <Select value={gameKey} onValueChange={(v) => setGameKey(v ?? "mtg")}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GAMES.map((g) => (
                <SelectItem key={g.key} value={g.key}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Set code</FieldLabel>
          <Input
            value={setCode}
            onChange={(e) => setSetCode(e.target.value)}
            placeholder="blb"
          />
        </Field>
        <Field>
          <FieldLabel>Chase bin</FieldLabel>
          <Input
            type="number"
            min={1}
            value={binNumber}
            onChange={(e) => setBinNumber(parseInt(e.target.value, 10) || 1)}
          />
        </Field>
        <Field>
          <FieldLabel>Reject bin</FieldLabel>
          <Input
            type="number"
            min={1}
            value={rejectBinNumber}
            onChange={(e) =>
              setRejectBinNumber(parseInt(e.target.value, 10) || 1)
            }
          />
        </Field>
      </div>
      <Field>
        <FieldLabel>
          Collection (optional — cards already in it count as owned)
        </FieldLabel>
        <Select
          value={collectionGuid}
          onValueChange={(v) => setCollectionGuid(v ?? "")}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="No collection (everything is missing)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">No collection</SelectItem>
            {collections.map((c) => (
              <SelectItem key={c.guid} value={c.guid}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </DynamicDialog>
  );
}

export function ChasePanel() {
  const { configs, activeRun, isChaseActive, startRun, abortRun, deleteConfig } =
    useChase();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ChaseConfigWithRun | null>(null);

  // Set size for the active chase (for the missing-count progress).
  const { data: setInfo } = useQuery({
    queryKey: ["library", "set-total", activeRun?.configGuid],
    queryFn: () => {
      const cfg = configs.find((c) => c.guid === activeRun?.configGuid);
      if (!cfg) return null;
      return browseLibrary({
        gameKey: cfg.gameKey,
        set: cfg.setCode,
        page: 1,
        limit: 1,
      });
    },
    enabled: !!activeRun,
    staleTime: 60_000,
  });

  if (isChaseActive && activeRun) {
    const found = activeRun.foundCardIds.length;
    const total = setInfo?.total ?? null;
    return (
      <div className="flex flex-col gap-2 rounded-lg border p-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold truncate">
            {activeRun.configName}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">
            {found}
            {total != null ? `/${total}` : ""} found
          </span>
        </div>
        {total != null && total > 0 && (
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.min(100, (found / total) * 100)}%` }}
            />
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            Reject → bin {configs.find((c) => c.guid === activeRun.configGuid)?.rejectBinNumber}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void abortRun(activeRun.configGuid)}
          >
            <IconPlayerStop className="size-3" /> Stop
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Set Chase
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          complete a set from bulk
        </span>
      </div>
      {configs.length === 0 ? (
        <p className="text-xs text-muted-foreground rounded-lg border p-2">
          No set chases yet. Create one to pull the cards you're missing from a
          set into a bin while everything else goes to the reject bin.
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
                  {config.gameKey} · {config.setCode} → bin {config.binNumber}
                </p>
              </div>
              <Button
                variant="secondary"
                size="icon"
                className="size-7 shrink-0"
                title="Start chase"
                onClick={() => void startRun(config.guid)}
              >
                <IconPlayerPlay className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground"
                title="Edit"
                onClick={() => {
                  setEditing(config);
                  setDialogOpen(true);
                }}
              >
                <IconEdit className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground"
                title="Delete"
                onClick={() => void deleteConfig(config.guid)}
              >
                <IconTrash className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => {
          setEditing(null);
          setDialogOpen(true);
        }}
      >
        <IconPlus className="size-3" /> New set chase
      </Button>
      <ChaseConfigDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        config={editing}
      />
    </div>
  );
}
