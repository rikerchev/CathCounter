import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Waves, Loader2, Plus } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function GroundbaitMixer({ open, onOpenChange, onAddGroundbait, existingNames = [] }) {
  const { toast } = useToast();
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [grams, setGrams] = useState("");
  const [customName, setCustomName] = useState("");
  const [useCustom, setUseCustom] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    base44.entities.UserInventory.list("-created_date", 500)
      .then((data) => {
        setInventory((data || []).filter((it) => it.category === "groundbait"));
      })
      .catch(() => {
        setInventory([]);
      })
      .finally(() => setLoading(false));
  }, [open]);

  const selected = inventory.find((it) => it.id === selectedId);

  const handleAdd = async () => {
    let name = "";
    let amount = 0;
    let invItem = null;

    if (useCustom) {
      name = customName.trim();
      amount = parseFloat(grams) || 0;
    } else {
      if (!selected) return;
      name = selected.item_name;
      amount = parseFloat(grams) || 0;
      invItem = selected;
    }

    if (!name) return;

    // Deduct from inventory if using existing item
    if (invItem && amount > 0) {
      const newQty = Math.max(0, (invItem.quantity || 0) - amount);
      try {
        await base44.entities.UserInventory.update(invItem.id, { quantity: newQty });
        setInventory((prev) =>
          prev.map((it) => (it.id === invItem.id ? { ...it, quantity: newQty } : it))
        );
      } catch {
        toast({ title: "Грешка при изваждане от наличност", variant: "destructive" });
        return;
      }
    }

    onAddGroundbait({ name, grams: amount });
    toast({ title: `Добавена захранка: ${name}` });
    setSelectedId("");
    setGrams("");
    setCustomName("");
    setUseCustom(false);
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
      <div className="relative w-full sm:max-w-md bg-white dark:bg-card rounded-t-2xl sm:rounded-xl shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-2">
          <Waves className="w-5 h-5 text-cyan-600" />
          <h2 className="font-bold text-slate-800">Забъркана захранка</h2>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <button
                onClick={() => setUseCustom(false)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium ${!useCustom ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-500"}`}
              >
                От наличност
              </button>
              <button
                onClick={() => setUseCustom(true)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium ${useCustom ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-500"}`}
              >
                Ръчно
              </button>
            </div>

            {!useCustom ? (
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Захранка от наличност</Label>
                {inventory.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4 text-center">Няма захранка в наличността. Добавете от меню Наличност.</p>
                ) : (
                  <Select value={selectedId} onValueChange={setSelectedId}>
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue placeholder="Избери захранка..." />
                    </SelectTrigger>
                    <SelectContent>
                      {inventory.map((it) => (
                        <SelectItem key={it.id} value={it.id}>
                          {it.item_name} ({it.brand || "—"}) — {it.quantity || 0}{it.unit || "g"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {selected && (
                  <p className="text-xs text-slate-400">Налично: {selected.quantity || 0}{selected.unit || "g"}</p>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Име на захранката</Label>
                <Input
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="напр. Метод микс с бяла рибена каша"
                  className="h-9 text-sm"
                />
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Количество (грама)</Label>
              <Input
                type="number"
                min="0"
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
                placeholder="напр. 500"
                className="h-9 text-sm"
              />
            </div>

            {existingNames.length > 0 && (
              <div className="text-xs text-slate-400">
                <p className="font-medium">Вече добавени:</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {existingNames.map((n, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{n}</span>
                  ))}
                </div>
              </div>
            )}

            <Button
              onClick={handleAdd}
              className="w-full bg-cyan-600 hover:bg-cyan-700 min-h-[44px]"
              disabled={!useCustom && !selected}
            >
              <Plus className="w-4 h-4 mr-1" /> Добави захранка
            </Button>
          </>
        )}
      </div>
    </div>
  );
}