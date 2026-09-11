import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Pencil, Check, X, Boxes, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useLanguage } from "@/lib/i18n";
import { listBait, saveBait, deleteBait } from "@/lib/baitRepository";

export default function BaitInventory() {
  const { t } = useLanguage();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("bait");
  const [filter, setFilter] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("bait");
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setItems(await listBait());
    } catch {
      toast({ title: t("tackle.couldNotLoad"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    load();
  }, [load]);

  const categoryLabel = (cat) => t(`tackle.cat.${cat}`);

  const addItem = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const created = await saveBait({
        name: newName.trim(),
        category: newCategory,
      });
      setItems((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
    } catch {
      toast({ title: t("tackle.couldNotAdd"), variant: "destructive" });
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditCategory(item.category || "bait");
  };

  const saveEdit = async (item) => {
    if (!editName.trim()) return;
    try {
      await saveBait({ ...item, name: editName.trim(), category: editCategory });
      setItems((prev) =>
        prev
          .map((b) =>
            b.id === item.id ? { ...b, name: editName.trim(), category: editCategory } : b
          )
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingId(null);
    } catch {
      toast({ title: t("tackle.couldNotUpdate"), variant: "destructive" });
    }
  };

  const removeItem = async (item) => {
    try {
      await deleteBait(item.id);
      setItems((prev) => prev.filter((b) => b.id !== item.id));
    } catch {
      toast({ title: t("tackle.couldNotRemove"), variant: "destructive" });
    }
  };

  const filtered = filter === "all" ? items : items.filter((it) => (it.category || "bait") === filter);
  const categories = ["rod", "groundbait", "bait", "hook", "line", "other"];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t("tackle.title")}</h1>
        <p className="text-sm text-slate-400">{t("tackle.subtitle")}</p>
      </div>

      {/* Add form */}
      <form onSubmit={addItem} className="space-y-2">
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("tackle.addPlaceholder")}
            className="h-9"
          />
          <Select value={newCategory} onValueChange={setNewCategory}>
            <SelectTrigger className="h-9 w-32 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {categoryLabel(cat)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" className="bg-cyan-600 hover:bg-cyan-700">
            <Plus className="w-4 h-4 mr-1" /> {t("common.add")}
          </Button>
        </div>
      </form>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1 rounded-full text-xs font-medium ${
            filter === "all" ? "bg-cyan-100 text-cyan-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {t("tackle.all")}
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              filter === cat ? "bg-cyan-100 text-cyan-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            {categoryLabel(cat)}
          </button>
        ))}
      </div>

      {/* Items list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Boxes className="w-12 h-12 text-slate-200 mb-3" />
          <p className="text-slate-400 font-medium">{t("tackle.empty")}</p>
          <p className="text-slate-300 text-sm mt-1">{t("tackle.emptyHint")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 p-3 rounded-xl bg-white border border-slate-100 shadow-sm"
            >
              {editingId === item.id ? (
                <>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-8 text-sm"
                    autoFocus
                  />
                  <Select value={editCategory} onValueChange={setEditCategory}>
                    <SelectTrigger className="h-8 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {categoryLabel(cat)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600" onClick={() => saveEdit(item)}>
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400" onClick={() => setEditingId(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 font-medium text-slate-700">{item.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                    {categoryLabel(item.category || "bait")}
                  </span>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-slate-700" onClick={() => startEdit(item)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-400 hover:text-rose-600" onClick={() => removeItem(item)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}