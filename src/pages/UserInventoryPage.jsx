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
import { Plus, Trash2, Pencil, Check, X, Boxes, Loader2, ExternalLink, Download, Upload } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { exportToExcel, parseExcelFile } from "@/lib/excelUtils";

const CATEGORY_LABELS = {
  groundbait: "Захранка",
  bait: "Стръв",
  rod: "Въдица",
  hook: "Кука",
  line: "Влакно",
  feeder: "Хранилка",
  other: "Друго",
};

const UNITS = ["g", "kg", "pcs", "ml", "l"];

export default function UserInventoryPage() {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [newForm, setNewForm] = useState({
    item_name: "",
    category: "groundbait",
    brand: "",
    quantity: 0,
    unit: "g",
    description: "",
    shop_url: "",
  });
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await base44.entities.UserInventory.list("-created_date", 500);
      setItems(data || []);
    } catch {
      toast({ title: "Грешка при зареждане", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const addItem = async (e) => {
    e.preventDefault();
    if (!newForm.item_name.trim()) return;
    try {
      const created = await base44.entities.UserInventory.create(newForm);
      setItems((prev) => [created, ...prev]);
      setNewForm({
        item_name: "",
        category: "groundbait",
        brand: "",
        quantity: 0,
        unit: "g",
        description: "",
        shop_url: "",
      });
      toast({ title: "Добавено в наличност" });
    } catch {
      toast({ title: "Грешка при добавяне", variant: "destructive" });
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditForm({
      item_name: item.item_name,
      category: item.category || "bait",
      brand: item.brand || "",
      quantity: item.quantity ?? 0,
      unit: item.unit || "g",
      description: item.description || "",
      shop_url: item.shop_url || "",
    });
  };

  const saveEdit = async (item) => {
    if (!editForm.item_name.trim()) return;
    try {
      const updated = await base44.entities.UserInventory.update(item.id, editForm);
      setItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
      setEditingId(null);
      toast({ title: "Запазено" });
    } catch {
      toast({ title: "Грешка при запис", variant: "destructive" });
    }
  };

  const removeItem = async (item) => {
    if (!window.confirm("Изтрий от наличността?")) return;
    try {
      await base44.entities.UserInventory.delete(item.id);
      setItems((prev) => prev.filter((it) => it.id !== item.id));
    } catch {
      toast({ title: "Грешка при изтриване", variant: "destructive" });
    }
  };

  const handleExport = () => {
    const rows = items.map((it) => ({
      Име: it.item_name || "",
      Категория: CATEGORY_LABELS[it.category] || it.category || "",
      Бранд: it.brand || "",
      Количество: it.quantity ?? 0,
      "Мерна единица": it.unit || "",
      Описание: it.description || "",
      "Линк към търговеца": it.shop_url || "",
    }));
    exportToExcel(rows, "moia-nalichnost.xlsx", "Наличност");
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const rows = await parseExcelFile(file);
      const created = [];
      for (const row of rows) {
        const name = row["Име"] || row["item_name"] || "";
        if (!name) continue;
        const cat = row["Категория"] || row["category"] || "bait";
        const category = Object.keys(CATEGORY_LABELS).find(
          (k) => CATEGORY_LABELS[k] === cat || k === cat
        ) || "bait";
        const item = await base44.entities.UserInventory.create({
          item_name: name,
          category,
          brand: row["Бранд"] || row["brand"] || "",
          quantity: Number(row["Количество"] ?? row["quantity"] ?? 0),
          unit: row["Мерна единица"] || row["unit"] || "g",
          description: row["Описание"] || row["description"] || "",
          shop_url: row["Линк към търговеца"] || row["shop_url"] || "",
        });
        created.push(item);
      }
      setItems((prev) => [...prev, ...created]);
      toast({ title: `Импортирани ${created.length} артикула` });
    } catch {
      toast({ title: "Грешка при импорт", variant: "destructive" });
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const filtered = filter === "all" ? items : items.filter((it) => (it.category || "bait") === filter);
  const categories = Object.keys(CATEGORY_LABELS);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Моята наличност</h1>
          <p className="text-sm text-slate-400">Описание на целия инвентар, с който разполагате</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={items.length === 0} className="min-h-[44px]">
            <Download className="w-4 h-4 mr-1" /> Експорт
          </Button>
          <label className="inline-flex">
            <Button variant="outline" size="sm" disabled={importing} className="min-h-[44px] cursor-pointer">
              {importing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
              Импорт
            </Button>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} className="hidden" />
          </label>
        </div>
      </div>

      {/* Add form */}
      <form onSubmit={addItem} className="space-y-3 p-4 rounded-xl bg-white border border-slate-100 shadow-sm">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Име *</Label>
            <Input
              value={newForm.item_name}
              onChange={(e) => setNewForm({ ...newForm, item_name: e.target.value })}
              placeholder="напр. Метод Микс 1кг"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Бранд</Label>
            <Input
              value={newForm.brand}
              onChange={(e) => setNewForm({ ...newForm, brand: e.target.value })}
              placeholder="напр. Sonubaits"
              className="h-9 text-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Категория</Label>
            <Select value={newForm.category} onValueChange={(v) => setNewForm({ ...newForm, category: v })}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Количество</Label>
            <Input
              type="number"
              step="0.001"
              value={newForm.quantity}
              onChange={(e) => setNewForm({ ...newForm, quantity: parseFloat(e.target.value) || 0 })}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Мерна ед.</Label>
            <Select value={newForm.unit} onValueChange={(v) => setNewForm({ ...newForm, unit: v })}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((u) => (
                  <SelectItem key={u} value={u}>{u}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Линк към търговеца</Label>
          <Input
            value={newForm.shop_url}
            onChange={(e) => setNewForm({ ...newForm, shop_url: e.target.value })}
            placeholder="https://..."
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Описание</Label>
          <Textarea
            value={newForm.description}
            onChange={(e) => setNewForm({ ...newForm, description: e.target.value })}
            placeholder="Допълнително описание..."
            className="text-sm min-h-[50px]"
          />
        </div>
        <Button type="submit" className="bg-cyan-600 hover:bg-cyan-700 min-h-[44px]">
          <Plus className="w-4 h-4 mr-1" /> Добави
        </Button>
      </form>

      {/* Filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1 rounded-full text-xs font-medium ${filter === "all" ? "bg-cyan-100 text-cyan-700" : "bg-slate-100 text-slate-500"}`}
        >
          Всички
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-3 py-1 rounded-full text-xs font-medium ${filter === cat ? "bg-cyan-100 text-cyan-700" : "bg-slate-100 text-slate-500"}`}
          >
            {CATEGORY_LABELS[cat]}
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
          <Boxes className="w-12 h-12 text-slate-200 mb-3" />
          <p className="text-slate-400 font-medium">Няма артикули</p>
          <p className="text-slate-300 text-sm mt-1">Добавете инвентар, с който разполагате</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <div key={item.id} className="p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
              {editingId === item.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={editForm.item_name}
                      onChange={(e) => setEditForm({ ...editForm, item_name: e.target.value })}
                      className="h-8 text-sm"
                      autoFocus
                    />
                    <Input
                      value={editForm.brand}
                      onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                      className="h-8 text-sm"
                      placeholder="Бранд"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Select value={editForm.category} onValueChange={(v) => setEditForm({ ...editForm, category: v })}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat} value={cat}>{CATEGORY_LABELS[cat]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      step="0.001"
                      value={editForm.quantity}
                      onChange={(e) => setEditForm({ ...editForm, quantity: parseFloat(e.target.value) || 0 })}
                      className="h-8 text-xs"
                    />
                    <Select value={editForm.unit} onValueChange={(v) => setEditForm({ ...editForm, unit: v })}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UNITS.map((u) => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    value={editForm.shop_url}
                    onChange={(e) => setEditForm({ ...editForm, shop_url: e.target.value })}
                    className="h-8 text-xs"
                    placeholder="Линк"
                  />
                  <Textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="text-xs min-h-[40px]"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 min-h-[36px]" onClick={() => saveEdit(item)}>
                      <Check className="w-4 h-4 mr-1" /> Запази
                    </Button>
                    <Button size="sm" variant="outline" className="min-h-[36px]" onClick={() => setEditingId(null)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-700">{item.item_name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                        {CATEGORY_LABELS[item.category] || item.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-sm text-slate-500">{item.brand || "—"}</span>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-sm font-medium text-slate-600">
                        {item.quantity ?? 0} {item.unit || ""}
                      </span>
                    </div>
                    {item.description && <p className="text-xs text-slate-400 mt-1">{item.description}</p>}
                    {item.shop_url && (
                      <a
                        href={item.shop_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-cyan-600 hover:underline mt-1"
                      >
                        <ExternalLink className="w-3 h-3" /> Поръчай
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