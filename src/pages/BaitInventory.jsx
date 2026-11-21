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
import { findCatchesUsing, replaceInCatches } from "@/lib/tackleUsage";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

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
  const [deleteInfo, setDeleteInfo] = useState(null); // { item, count, alternatives }
  const [replacementId, setReplacementId] = useState("");
  const [busy, setBusy] = useState(false);
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
      // _synced:false — an edited item must be pushed again. Without it
      // saveBaitLocal kept the old _synced:true, the edit never reached the
      // server and the next pull overwrote the new name with the old one.
      await saveBait({ ...item, name: editName.trim(), category: editCategory, _synced: false });
      setItems((prev) =>
        prev
          .map((b) =>
            b.id === item.id ? { ...b, name: editName.trim(), category: editCategory } : b
          )
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingId(null);

      // v3.157 — catches store tackle by name, so a rename must be applied to
      // them too. Skipped if the category changed, or if another item with the
      // old name+category is still there (a duplicate — the catches still
      // point to a name that exists).
      const oldCat = item.category || "bait";
      const newName = editName.trim();
      const duplicateRemains = items.some(
        (b) => b.id !== item.id && (b.category || "bait") === oldCat && b.name === item.name
      );
      if (newName !== item.name && editCategory === oldCat && !duplicateRemains) {
        try {
          const n = await replaceInCatches(item.name, newName, oldCat);
          if (n > 0) {
            toast({ title: t("tackle.renamedInCatches").replace("{count}", String(n)) });
          }
        } catch (e) {
          console.error("Failed to apply inventory rename to catches:", e);
        }
      }
    } catch {
      toast({ title: t("tackle.couldNotUpdate"), variant: "destructive" });
    }
  };

  const doDelete = async (item) => {
    try {
      await deleteBait(item.id);
      setItems((prev) => prev.filter((b) => b.id !== item.id));
    } catch {
      toast({ title: t("tackle.couldNotRemove"), variant: "destructive" });
    }
  };

  // v3.157 — an item used by catches can't just disappear: ask for a
  // replacement of the same category and rewrite those catches first. If a
  // duplicate with the same name+category remains, nothing is orphaned.
  const removeItem = async (item) => {
    const cat = item.category || "bait";
    const duplicateRemains = items.some(
      (b) => b.id !== item.id && (b.category || "bait") === cat && b.name === item.name
    );
    if (!duplicateRemains) {
      let used = [];
      try {
        used = await findCatchesUsing(item.name, cat);
      } catch {
        used = [];
      }
      if (used.length > 0) {
        const alternatives = items.filter(
          (b) => b.id !== item.id && (b.category || "bait") === cat && b.name !== item.name
        );
        setReplacementId("");
        setDeleteInfo({ item, count: used.length, alternatives });
        return;
      }
    }
    await doDelete(item);
  };

  const confirmReplaceAndDelete = async () => {
    if (!deleteInfo) return;
    const replacement = deleteInfo.alternatives.find((b) => b.id === replacementId);
    if (!replacement) return;
    setBusy(true);
    try {
      await replaceInCatches(deleteInfo.item.name, replacement.name, deleteInfo.item.category || "bait");
      await doDelete(deleteInfo.item);
      setDeleteInfo(null);
    } catch {
      toast({ title: t("tackle.couldNotRemove"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const filtered = filter === "all" ? items : items.filter((it) => (it.category || "bait") === filter);
  const categories = ["rod", "groundbait", "bait", "hook", "line", "feeder", "other"];

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

      <Dialog open={!!deleteInfo} onOpenChange={(open) => { if (!open && !busy) setDeleteInfo(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("tackle.inUseTitle")}</DialogTitle>
          </DialogHeader>
          {deleteInfo && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                {t("tackle.inUseText")
                  .replace("{name}", deleteInfo.item.name)
                  .replace("{count}", String(deleteInfo.count))}
              </p>
              {deleteInfo.alternatives.length === 0 ? (
                <p className="text-sm text-amber-600">{t("tackle.inUseNoAlt")}</p>
              ) : (
                <Select value={replacementId} onValueChange={setReplacementId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder={t("tackle.replaceWith")} />
                  </SelectTrigger>
                  <SelectContent>
                    {deleteInfo.alternatives.map((alt) => (
                      <SelectItem key={alt.id} value={alt.id}>
                        {alt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteInfo(null)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            {deleteInfo && deleteInfo.alternatives.length > 0 && (
              <Button
                className="bg-rose-600 hover:bg-rose-700"
                disabled={!replacementId || busy}
                onClick={confirmReplaceAndDelete}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("tackle.replaceAndDelete")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}