import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Pencil, Check, X, Package, Loader2, ExternalLink, Download, Upload } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useLanguage } from "@/lib/i18n";
import { exportToExcel, parseExcelFile } from "@/lib/excelUtils";

const CATEGORY_LABELS = {
  groundbait: "tackle.cat.groundbait",
  bait: "tackle.cat.bait",
};

export default function BaseItems() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const catLabel = (cat) => t(CATEGORY_LABELS[cat] || cat);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [newForm, setNewForm] = useState({
    name: "",
    category: "groundbait",
    brand: "",
    shop_url: "",
    description: "",
    is_active: true,
  });
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await base44.entities.BaseItem.list("sort_order", 500);
      setItems(data || []);
    } catch {
      toast({ title: t("tackle.couldNotLoad"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const addItem = async (e) => {
    e.preventDefault();
    if (!newForm.name.trim() || !newForm.brand.trim()) return;
    try {
      const created = await base44.entities.BaseItem.create(newForm);
      setItems((prev) => [...prev, created]);
      setNewForm({
        name: "",
        category: "groundbait",
        brand: "",
        shop_url: "",
        description: "",
        is_active: true,
      });
      toast({ title: t("bi.itemAdded") });
    } catch {
      toast({ title: t("tackle.couldNotAdd"), variant: "destructive" });
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditForm({
      name: item.name,
      category: item.category,
      brand: item.brand,
      shop_url: item.shop_url || "",
      description: item.description || "",
      is_active: item.is_active !== false,
    });
  };

  const saveEdit = async (item) => {
    if (!editForm.name.trim() || !editForm.brand.trim()) return;
    try {
      const updated = await base44.entities.BaseItem.update(item.id, editForm);
      setItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
      setEditingId(null);
      toast({ title: t("common.save") });
    } catch {
      toast({ title: t("tackle.couldNotUpdate"), variant: "destructive" });
    }
  };

  const removeItem = async (item) => {
    if (!window.confirm(t("bi.deleteConfirm"))) return;
    try {
      await base44.entities.BaseItem.delete(item.id);
      setItems((prev) => prev.filter((it) => it.id !== item.id));
    } catch {
      toast({ title: t("tackle.couldNotRemove"), variant: "destructive" });
    }
  };

  const handleExport = () => {
    const rows = items.map((it) => ({
      [t("bi.name")]: it.name || "",
      [t("tackle.category")]: catLabel(it.category),
      [t("bi.brand")]: it.brand || "",
      [t("bi.shopUrl")]: it.shop_url || "",
      [t("bi.description")]: it.description || "",
      [t("bi.active")]: it.is_active !== false ? t("bi.yes") : t("bi.no"),
    }));
    exportToExcel(rows, "bazovi-artikuli.xlsx", t("bi.title"));
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const rows = await parseExcelFile(file);
      const created = [];
      for (const row of rows) {
        const name = row[t("bi.name")] || row["name"] || "";
        const brand = row[t("bi.brand")] || row["brand"] || "";
        if (!name || !brand) continue;
        const category =
          (row[t("tackle.category")] === t("tackle.cat.bait") || row["category"] === "bait") ? "bait" : "groundbait";
        const item = await base44.entities.BaseItem.create({
          name,
          brand,
          category,
          shop_url: row[t("bi.shopUrl")] || row["shop_url"] || "",
          description: row[t("bi.description")] || row["description"] || "",
          is_active: (row[t("bi.active")] === t("bi.yes") || row["is_active"] === true),
        });
        created.push(item);
      }
      setItems((prev) => [...prev, ...created]);
      toast({ title: t("bi.importedCount", { count: created.length }) });
    } catch {
      toast({ title: t("bi.importError"), variant: "destructive" });
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const filtered = filter === "all" ? items : items.filter((it) => it.category === filter);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{t("bi.title")}</h1>
          <p className="text-sm text-slate-400">{t("bi.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={items.length === 0} className="min-h-[44px]">
            <Download className="w-4 h-4 mr-1" /> {t("bi.export")}
          </Button>
          <label className="inline-flex">
            <Button variant="outline" size="sm" disabled={importing} className="min-h-[44px] cursor-pointer">
              {importing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
              {t("bi.import")}
            </Button>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} className="hidden" />
          </label>
        </div>
      </div>

      {/* Add form */}
      <form onSubmit={addItem} className="space-y-3 p-4 rounded-xl bg-white border border-slate-100 shadow-sm">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">{t("bi.name")} *</Label>
            <Input
              value={newForm.name}
              onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
              placeholder={t("bi.namePlaceholder")}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">{t("bi.brand")} *</Label>
            <Input
              value={newForm.brand}
              onChange={(e) => setNewForm({ ...newForm, brand: e.target.value })}
              placeholder={t("bi.brandPlaceholder")}
              className="h-9 text-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">{t("tackle.category")}</Label>
            <Select value={newForm.category} onValueChange={(v) => setNewForm({ ...newForm, category: v })}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="groundbait">{t("tackle.cat.groundbait")}</SelectItem>
                <SelectItem value="bait">{t("tackle.cat.bait")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">{t("bi.shopUrl")}</Label>
            <Input
              value={newForm.shop_url}
              onChange={(e) => setNewForm({ ...newForm, shop_url: e.target.value })}
              placeholder="https://..."
              className="h-9 text-sm"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">{t("bi.description")}</Label>
          <Textarea
            value={newForm.description}
            onChange={(e) => setNewForm({ ...newForm, description: e.target.value })}
            placeholder={t("bi.descriptionPlaceholder")}
            className="text-sm min-h-[60px]"
          />
        </div>
        <Button type="submit" className="bg-cyan-600 hover:bg-cyan-700 min-h-[44px]">
          <Plus className="w-4 h-4 mr-1" /> {t("common.add")}
        </Button>
      </form>

      {/* Filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1 rounded-full text-xs font-medium ${filter === "all" ? "bg-cyan-100 text-cyan-700" : "bg-slate-100 text-slate-500"}`}
        >
          {t("tackle.all")}
        </button>
        {Object.entries(CATEGORY_LABELS).map(([key, labelKey]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1 rounded-full text-xs font-medium ${filter === key ? "bg-cyan-100 text-cyan-700" : "bg-slate-100 text-slate-500"}`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Package className="w-12 h-12 text-slate-200 mb-3" />
          <p className="text-slate-400 font-medium">{t("bi.noItems")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <div key={item.id} className="p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
              {editingId === item.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="h-8 text-sm"
                      autoFocus
                    />
                    <Input
                      value={editForm.brand}
                      onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={editForm.category} onValueChange={(v) => setEditForm({ ...editForm, category: v })}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="groundbait">{t("tackle.cat.groundbait")}</SelectItem>
                        <SelectItem value="bait">{t("tackle.cat.bait")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={editForm.shop_url}
                      onChange={(e) => setEditForm({ ...editForm, shop_url: e.target.value })}
                      className="h-8 text-xs"
                      placeholder={t("bi.shopUrl")}
                    />
                  </div>
                  <Textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="text-xs min-h-[40px]"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 min-h-[36px]" onClick={() => saveEdit(item)}>
                      <Check className="w-4 h-4 mr-1" /> {t("common.save")}
                    </Button>
                    <Button size="sm" variant="outline" className="min-h-[36px]" onClick={() => setEditingId(null)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-700">{item.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                        {catLabel(item.category)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500">{item.brand}</p>
                    {item.description && <p className="text-xs text-slate-400 mt-1">{item.description}</p>}
                    {item.shop_url && (
                      <a
                        href={item.shop_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-cyan-600 hover:underline mt-1"
                      >
                        <ExternalLink className="w-3 h-3" /> {t("bi.order")}
                      </a>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-slate-700" onClick={() => startEdit(item)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-400 hover:text-rose-600" onClick={() => removeItem(item)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}