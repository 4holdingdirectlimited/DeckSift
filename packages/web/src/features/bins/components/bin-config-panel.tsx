import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBinConfigs } from "@/features/bins/api/use-bin-configs";
import { RuleGroupEditor } from "@/features/bins/components/rule-group-editor";
import {
  binConfigSchema,
  type BinConfigFormValues,
} from "@/schemas/sort-bins.schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { BinRuleGroup } from "@magic-vault/shared";
import { IconLoader2 } from "@tabler/icons-react";
import { useCallback, useEffect } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";

function emptyRuleGroup(): BinRuleGroup {
  return { id: crypto.randomUUID(), combinator: "and", conditions: [] };
}

export function BinConfigPanel() {
  const {
    selectedConfig: config,
    save,
    clear,
    configs,
    isPending,
  } = useBinConfigs();

  const form = useForm<BinConfigFormValues>({
    resolver: zodResolver(binConfigSchema) as Resolver<BinConfigFormValues>,
    defaultValues: {
      isCatchAll: false,
      rules: emptyRuleGroup(),
      maxCapacity: 0,
    },
  });

  useEffect(() => {
    form.reset({
      isCatchAll: config.isCatchAll ?? false,
      rules:
        config.rules.conditions.length > 0 ? config.rules : emptyRuleGroup(),
      maxCapacity: config.maxCapacity ?? 0,
    });
  }, [config, form]);

  const isOnlyCatchAll =
    config.isCatchAll &&
    configs.filter((c) => c.isCatchAll && c.binNumber !== config.binNumber)
      .length === 0;

  const handleSave = useCallback(
    (values: BinConfigFormValues) => {
      if (!values.isCatchAll && isOnlyCatchAll) {
        form.setError("isCatchAll", {
          message: "At least one bin must be catch-all.",
        });
        return;
      }
      save(config.binNumber, values.rules as BinRuleGroup, values.isCatchAll, values.maxCapacity);
    },
    [config, save, isOnlyCatchAll, form],
  );

  const handleClear = useCallback(() => {
    if (isOnlyCatchAll) {
      form.setError("isCatchAll", {
        message: "At least one bin must be catch-all.",
      });
      return;
    }
    form.reset({
      isCatchAll: false,
      rules: emptyRuleGroup(),
      maxCapacity: 0,
    });
    clear(config.binNumber);
  }, [config, clear, form, isOnlyCatchAll]);

  const isCatchAll = form.watch("isCatchAll");

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-4 mb-4">
        <h2 className="font-semibold font-heading">Bin {config.binNumber}</h2>
        <Controller
          name="isCatchAll"
          control={form.control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={field.value ? "default" : "outline"}
                size="sm"
                onClick={() => field.onChange(!field.value)}
              >
                {field.value ? "Catch-all enabled" : "Set as catch-all"}
              </Button>
              {field.value && (
                <p className="text-xs text-muted-foreground">
                  Cards that don&apos;t match any other bin will go here.
                </p>
              )}
            </div>
          )}
        />
      </div>
      {!isCatchAll && (
        <ScrollArea>
          <Label className="mb-2">Rules</Label>
          <Controller
            name="rules"
            control={form.control}
            render={({ field }) => (
              <RuleGroupEditor
                group={field.value as BinRuleGroup}
                onChange={field.onChange}
              />
            )}
          />
        </ScrollArea>
      )}
      <div className="mb-4 flex items-center gap-2">
        <Label htmlFor="maxCapacity" className="mb-0">
          Max capacity per run
        </Label>
        <Controller
          name="maxCapacity"
          control={form.control}
          render={({ field }) => (
            <Input
              id="maxCapacity"
              type="number"
              min={0}
              value={field.value ?? 0}
              onChange={(e) => field.onChange(Number(e.target.value) || 0)}
              className="w-24"
            />
          )}
        />
        <p className="text-xs text-muted-foreground">
          0 = unlimited. Routing pauses when the bin reaches this many cards.
        </p>
      </div>
      {form.formState.errors.isCatchAll && (
        <FieldError errors={[form.formState.errors.isCatchAll]} />
      )}
      {form.formState.errors.rules && (
        <FieldError errors={[form.formState.errors.rules]} />
      )}
      <div className="flex gap-2 mt-2 justify-end">
        <Button
          type="button"
          variant="destructive"
          onClick={handleClear}
          disabled={isPending}
        >
          Clear
        </Button>
        <Button
          type="button"
          onClick={form.handleSubmit(handleSave)}
          disabled={isPending}
        >
          {isPending && <IconLoader2 className="size-4 animate-spin" />}
          Save
        </Button>
      </div>
    </div>
  );
}
