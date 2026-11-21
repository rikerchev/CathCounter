import React, { useState, useEffect, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Pencil, Check, X, Waves, Loader2, ExternalLink } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { hasRole } from "@/lib/roles";

// v3.153 — TEST screen, administrators only (menu Инвентар → „Хранилка (тест)“).
// A separate group of inventory items of the "feeder" (хранилка) kind. It uses
// the existing UserInventory entity with category = "feeder" (that category is
// already allowed by the database), so no migration is needed; every
// administrator sees and manages their own feeder items here.
const CATEGORY = "feeder";
const EMPTY = { item_name: "", brand: "", description: "", shop_url: "" };

export default function FeederInventory() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = hasRole(user, "admin");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newForm, setNewForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await base44.entities.UserInventory.list("-created_date", 500);
      setItems((data || []).filter((it) => it.category === CATEGORY && (!user || !it.created_by_id || it.created_by_id === user.id)));
    } catch {
      toast({ title: "Грешка при зареждане", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, user]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  // Not an administrator (or not loaded yet): nothing to show here.
  if (user && !isAdmin) return <Navigate to="/" replace />;
  if (!user) return null;

  const addItem = async (e) => {
    e.preventDefault();
    if (!newForm.item_name.trim()) return;
    try {
      const created = await base44.entities.UserInventory.create({ ...newForm, category: CATEGORY, quantity: 0, unit: "pcs" });
      setItems((prev) => [created, ...prev]);
      setNewForm(EMPTY);
      toast({ title: "Добавено" });
    } catch {
      toast({ title: "Грешка при добавяне", variant: "destructive" });
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditForm({
      item_name: item.item_name || "",
      brand: item.brand || "",
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
    if (!window.confirm("Изтрий хранилката?")) return;
    try {
      await base44.entities.UserInventory.delete(item.id);
      setItems((prev) => prev.filter((it) => it.id !== item.id));
    } catch {
      toast({ title: "Грешка при изтриване", variant: "destructive" });
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Waves className="w-5 h-5 text-cyan-600" /> Хранилка
          <span className="text-xs font-semibold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">тест · само администратори</span>
        </h1>
        <p className="text-sm text-slate-400">Група от инвентара за хранилки. Виждат я само администраторите.</p>
      </div>

      <form onSubmit={addItem} className="space-y-3 p-4 rounded-xl bg-white border border-slate-100 shadow-sm">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Име *</Label>
            <Input value={newForm.item_name} onChange={(e) => setNewForm({ ...newForm, item_name: e.target.value })} placeholder="напр. Метод хранилка 40 г" className="h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Марка</Label>
            <Input value={newForm.brand} onChange={(e) => setNewForm({ ...newForm, brand: e.target.value })} className="h-9 text-sm" />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Линк към търговеца</Label>
          <Input value={newForm.shop_url} onChange={(e) => setNewForm({ ...newForm, shop_url: e.target.value })} placeholder="https://..." className="h-9 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Описание</Label>
          <Textarea value={newForm.description} onChange={(e) => setNewForm({ ...newForm, description: e.target.value })} className="text-sm min-h-[60px]" />
        </div>
        <Button type="submit" className="w-full min-h-[44px]" disabled={!newForm.item_name.trim()}>
          <Plus className="w-4 h-4 mr-1" /> Добави
        </Button>
      </form>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-cyan-500" /></div>
      ) : items.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">Още няма добавени хранилки.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) =>
            editingId === item.id ? (
              <div key={item.id} className="p-3 rounded-xl bg-white border border-cyan-200 shadow-sm space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Input value={editForm.item_name} onChange={(e) => setEditForm({ ...editForm, item_name: e.target.value })} className="h-9 text-sm" placeholder="Име" />
                  <Input value={editForm.brand} onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })} className="h-9 text-sm" placeholder="Марка" />
                </div>
                <Input value={editForm.shop_url} onChange={(e) => setEditForm({ ...editForm, shop_url: e.target.value })} className="h-9 text-sm" placeholder="Линк към търговеца" />
                <Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className="text-sm min-h-[60px]" placeholder="Описание" />
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" onClick={() => setEditingId(null)} className="min-h-[40px]"><X className="w-4 h-4 mr-1" /> Отказ</Button>
                  <Button size="sm" onClick={() => saveEdit(item)} className="min-h-[40px]"><Check className="w-4 h-4 mr-1" /> Запази</Button>
                </div>
              </div>
            ) : (
              <div key={item.id} className="flex items-start gap-3 p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 truncate">{item.item_name}</div>
                  {item.brand && <div className="text-xs text-slate-500">{item.brand}</div>}
                  {item.description && <div className="text-xs text-slate-400 mt-0.5 whitespace-pre-line">{item.description}</div>}
                  {item.shop_url && (
                    <a href={item.shop_url} target="_blank" rel="noopener noreferrer" className="text-xs text-cyan-600 inline-flex items-center gap-1 mt-1">
                      <ExternalLink className="w-3 h-3" /> Към търговеца
                    </a>
                  )}
                </div>
                <Button size="icon" variant="ghost" onClick={() => startEdit(item)} className="h-9 w-9"><Pencil className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => removeItem(item)} className="h-9 w-9 text-red-500"><Trash2 className="w-4 h-4" /></Button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
