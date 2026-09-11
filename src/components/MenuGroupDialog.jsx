import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { useLanguage } from "@/lib/i18n";
import { ALL_MENU_ITEMS, parseMenuItems } from "@/lib/menuItems";

export default function MenuGroupDialog({ open, onClose, onSave, group }) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPaths, setSelectedPaths] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (group) {
      setName(group.name || "");
      setDescription(group.description || "");
      setSelectedPaths(parseMenuItems(group.menu_items));
    } else {
      setName("");
      setDescription("");
      setSelectedPaths([]);
    }
  }, [group, open]);

  const togglePath = (path) => {
    setSelectedPaths((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    );
  };

  const toggleAll = () => {
    if (selectedPaths.length === ALL_MENU_ITEMS.length) {
      setSelectedPaths([]);
    } else {
      setSelectedPaths(ALL_MENU_ITEMS.map((m) => m.path));
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        menu_items: selectedPaths.join(", "),
        status: "active",
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{group ? t("menuGroup.edit") : t("menuGroup.create")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>{t("menuGroup.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("menuGroup.namePlaceholder")} />
          </div>
          <div className="space-y-1">
            <Label>{t("menuGroup.description")}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("menuGroup.descPlaceholder")} rows={2} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("menuGroup.menuAccess")}</Label>
              <button onClick={toggleAll} className="text-xs text-cyan-600 font-medium hover:underline">
                {selectedPaths.length === ALL_MENU_ITEMS.length ? t("menuGroup.deselectAll") : t("menuGroup.selectAll")}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-64 overflow-y-auto border border-slate-100 dark:border-border rounded-lg p-2">
              {ALL_MENU_ITEMS.map((item) => {
                const checked = selectedPaths.includes(item.path);
                return (
                  <label
                    key={item.path}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer text-xs transition-colors ${
                      checked
                        ? "bg-cyan-50 dark:bg-accent text-cyan-700 dark:text-cyan-400 font-medium"
                        : "text-slate-500 dark:text-muted-foreground hover:bg-slate-50 dark:hover:bg-accent"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePath(item.path)}
                      className="w-3.5 h-3.5 accent-cyan-600"
                    />
                    {t(item.labelKey)}
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-slate-400">{selectedPaths.length} / {ALL_MENU_ITEMS.length}</p>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("ca.cancel")}</Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={saving || !name.trim()} className="bg-cyan-600 hover:bg-cyan-700">
            {saving ? "..." : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}