import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { COUNTRY_NAME_BY_CODE } from "@/lib/countries";

export default function AdRequestEditDialog({ request, onClose, onSave }) {
  const [adTitle, setAdTitle] = useState(request.ad_title || "");
  const [adDescription, setAdDescription] = useState(request.ad_description || "");
  const [countryContent, setCountryContent] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try {
      setCountryContent(request.country_content ? JSON.parse(request.country_content) : {});
    } catch {
      setCountryContent({});
    }
  }, [request.id]);

  const countries =
    request.countries === "all" || !request.countries
      ? []
      : request.countries.split(",").filter(Boolean);

  const isMultiCountry = countries.length > 1;

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        ad_title: adTitle,
        ad_description: adDescription,
        country_content: JSON.stringify(countryContent),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="bg-white dark:bg-card w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-card border-b border-slate-100 dark:border-border p-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-foreground">Редактиране на реклама</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <Label>{isMultiCountry ? "Заглавие (English)" : "Заглавие"}</Label>
            <Input value={adTitle} onChange={(e) => setAdTitle(e.target.value)} placeholder="Заглавие на рекламата" className="min-h-[44px]" />
          </div>
          <div>
            <Label>{isMultiCountry ? "Описание (English)" : "Описание"}</Label>
            <Input value={adDescription} onChange={(e) => setAdDescription(e.target.value)} placeholder="Описание на рекламата" className="min-h-[44px]" />
          </div>

          {countries.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-border p-4 space-y-4">
              <p className="text-xs font-semibold text-slate-500 dark:text-muted-foreground">Заглавие и описание по държави</p>
              {countries.map((code) => {
                const countryName = COUNTRY_NAME_BY_CODE[code] || code;
                const content = countryContent[code] || { title: "", description: "" };
                return (
                  <div key={code} className="space-y-2 pb-3 border-b border-slate-100 dark:border-border last:border-0 last:pb-0">
                    <p className="text-xs font-medium text-slate-600 dark:text-muted-foreground">{countryName}</p>
                    <Input
                      value={content.title || ""}
                      onChange={(e) => setCountryContent((prev) => ({ ...prev, [code]: { ...content, title: e.target.value } }))}
                      placeholder="Заглавие за тази държава"
                      className="min-h-[44px]"
                    />
                    <Input
                      value={content.description || ""}
                      onChange={(e) => setCountryContent((prev) => ({ ...prev, [code]: { ...content, description: e.target.value } }))}
                      placeholder="Описание за тази държава"
                      className="min-h-[44px]"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white dark:bg-card border-t border-slate-100 dark:border-border p-4 flex gap-2">
          <Button variant="outline" onClick={onClose} className="min-h-[44px] flex-1">Отказ</Button>
          <Button onClick={handleSave} disabled={saving} className="min-h-[44px] flex-1 bg-cyan-600 hover:bg-cyan-700">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Запазване...</> : "Запази"}
          </Button>
        </div>
      </div>
    </div>
  );
}