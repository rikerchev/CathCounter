import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/lib/i18n";

export default function TackleSelect({ icon: Icon, label, placeholder, items, value, onChange }) {
  const { t } = useLanguage();
  return (
    <div className="space-y-1">
      <Label className="text-xs text-white flex items-center gap-1">
        <Icon className="w-3 h-3" /> {label}
      </Label>
      <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-sm min-h-[40px]">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {items.length > 0 ? (
            items.map((b) => (
              <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
            ))
          ) : (
            <div className="px-2 py-1.5 text-xs text-slate-400">{t("rod.noTackle")}</div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}