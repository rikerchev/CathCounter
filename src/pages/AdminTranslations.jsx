import React, { useState, useEffect, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { translations } from "@/lib/i18n";
import { DEFAULT_LANGUAGES, getLanguageName, getLanguageNativeName } from "@/lib/languages";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Languages, Plus, Trash2, Save, Search, X, KeyRound, Sparkles, Download, Upload } from "lucide-react";
import { exportTranslationsToExcel, parseTranslationExcel } from "@/lib/translationExcel";

export default function AdminTranslations() {
  const { t, reloadTranslations } = useLanguage();
  const { toast } = useToast();
  const [dbRecords, setDbRecords] = useState([]);
  const [appLanguages, setAppLanguages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLang, setSelectedLang] = useState("de");
  const [search, setSearch] = useState("");
  const [showLangMgmt, setShowLangMgmt] = useState(false);
  const [newLang, setNewLang] = useState({ code: "", name: "", native_name: "" });
  const [editValues, setEditValues] = useState({});
  const [savingKeys, setSavingKeys] = useState({});
  const [showAddKey, setShowAddKey] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [autoTranslating, setAutoTranslating] = useState(false);
  const [translatingKeys, setTranslatingKeys] = useState({});
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  // All keys from static translations (en is the master) + custom DB keys
  const staticKeys = useMemo(() => Object.keys(translations.en || {}), []);
  const customDbKeys = useMemo(() => dbRecords.filter(r => !staticKeys.includes(r.key)).map(r => r.key), [dbRecords, staticKeys]);
  const allKeys = useMemo(() => [...staticKeys, ...customDbKeys], [staticKeys, customDbKeys]);

  // Map of key -> DB record
  const dbMap = useMemo(() => {
    const m = {};
    dbRecords.forEach((r) => { m[r.key] = r; });
    return m;
  }, [dbRecords]);

  // All available languages (DB + defaults, merged)
  const availableLanguages = useMemo(() => {
    if (appLanguages.length === 0) return DEFAULT_LANGUAGES;
    return appLanguages;
  }, [appLanguages]);

  // Languages that can be selected for editing (not bg or en, those are always shown)
  const editableLanguages = useMemo(() => {
    return availableLanguages.filter((l) => l.code !== "bg" && l.code !== "en");
  }, [availableLanguages]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [trans, langs] = await Promise.all([
        base44.entities.Translation.list("-updated_date", 500),
        base44.entities.AppLanguage.list("sort_order", 50),
      ]);
      setDbRecords(trans);
      setAppLanguages(langs);
    } catch (e) {
      // entities might not exist yet
    }
    setLoading(false);
  }

  // Get value for a key in a specific language
  function getValue(key, langCode) {
    // Check editValues first (unsaved edits)
    if (editValues[key] && editValues[key][langCode] !== undefined) {
      return editValues[key][langCode];
    }
    // Check DB overrides
    const rec = dbMap[key];
    if (rec) {
      try {
        const vals = JSON.parse(rec.values || "{}");
        if (vals[langCode]) return vals[langCode];
      } catch {}
    }
    // Fall back to static translations
    return translations[langCode]?.[key] || translations.en[key] || "";
  }

  // Handle editing a translation value
  function handleEdit(key, langCode, value) {
    setEditValues((prev) => {
      const next = { ...prev };
      if (!next[key]) next[key] = {};
      next[key][langCode] = value;
      return next;
    });
  }

  // Save a single key's edits
  async function saveKey(key) {
    setSavingKeys((prev) => ({ ...prev, [key]: true }));
    try {
      const edits = editValues[key] || {};
      // Build the full values object: merge DB record + static + edits
      const existingRec = dbMap[key];
      let valuesObj = {};
      if (existingRec) {
        try { valuesObj = JSON.parse(existingRec.values || "{}"); } catch {}
      }
      // Merge static translations for all languages
      Object.keys(translations).forEach((lang) => {
        if (translations[lang] && translations[lang][key] && !valuesObj[lang]) {
          valuesObj[lang] = translations[lang][key];
        }
      });
      // Apply edits
      Object.keys(edits).forEach((lang) => {
        valuesObj[lang] = edits[lang];
      });

      const valuesStr = JSON.stringify(valuesObj);
      if (existingRec) {
        await base44.entities.Translation.update(existingRec.id, { values: valuesStr });
        setDbRecords((prev) => prev.map(r => r.id === existingRec.id ? { ...r, values: valuesStr } : r));
      } else {
        const created = await base44.entities.Translation.create({ key, values: valuesStr });
        setDbRecords((prev) => [created, ...prev]);
      }
      // Clear edits for this key
      setEditValues((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      await reloadTranslations();
      toast({ title: t("tr.saved") });
    } catch (e) {
      toast({ title: t("tr.saveError"), variant: "destructive" });
    }
    setSavingKeys((prev) => ({ ...prev, [key]: false }));
  }

  // Add a new language
  async function addLanguage() {
    if (!newLang.code || !newLang.name) return;
    try {
      const created = await base44.entities.AppLanguage.create({
        code: newLang.code,
        name: newLang.name,
        native_name: newLang.native_name || newLang.name,
        is_active: true,
        sort_order: appLanguages.length,
      });
      setAppLanguages((prev) => [...prev, created]);
      setNewLang({ code: "", name: "", native_name: "" });
      toast({ title: t("tr.langAdded") });
    } catch (e) {
      toast({ title: t("tr.langAddError"), variant: "destructive" });
    }
  }

  // Remove a language
  async function removeLanguage(langCode) {
    try {
      const rec = appLanguages.find((l) => l.code === langCode);
      if (rec) {
        await base44.entities.AppLanguage.delete(rec.id);
        setAppLanguages((prev) => prev.filter((l) => l.code !== langCode));
      }
      toast({ title: t("tr.langRemoved") });
    } catch (e) {
      toast({ title: t("tr.langRemoveError"), variant: "destructive" });
    }
  }

  // Filtered keys based on search
  const filteredKeys = useMemo(() => {
    if (!search) return allKeys;
    const s = search.toLowerCase();
    return allKeys.filter((k) => {
      if (k.toLowerCase().includes(s)) return true;
      if ((translations.bg?.[k] || "").toLowerCase().includes(s)) return true;
      if ((translations.en?.[k] || "").toLowerCase().includes(s)) return true;
      const rec = dbMap[k];
      if (rec) {
        try {
          const vals = JSON.parse(rec.values || "{}");
          if (vals[selectedLang] && vals[selectedLang].toLowerCase().includes(s)) return true;
        } catch {}
      }
      return false;
    });
  }, [allKeys, search, selectedLang, dbMap]);

  // Create a new custom translation key
  async function createNewKey() {
    const key = newKey.trim();
    if (!key) return;
    if (allKeys.includes(key)) {
      toast({ title: t("tr.keyExists"), variant: "destructive" });
      return;
    }
    try {
      const created = await base44.entities.Translation.create({ key, values: JSON.stringify({}) });
      setDbRecords((prev) => [created, ...prev]);
      setNewKey("");
      setShowAddKey(false);
      toast({ title: t("tr.keyCreated") });
    } catch (e) {
      toast({ title: t("tr.saveError"), variant: "destructive" });
    }
  }

  // Auto-translate all English terms to the selected language using LLM
  async function autoTranslate() {
    if (!selectedLang || selectedLang === "en") return;
    setAutoTranslating(true);
    try {
      const langName = getLanguageName(selectedLang) || selectedLang;
      const batchSize = 40;
      const allKeysList = [...allKeys];
      const updatedValues = {};

      for (let i = 0; i < allKeysList.length; i += batchSize) {
        const batch = allKeysList.slice(i, i + batchSize);
        const termsToTranslate = {};
        batch.forEach((k) => {
          const enVal = translations.en?.[k] || getValue(k, "en");
          if (enVal && enVal.trim()) termsToTranslate[k] = enVal;
        });
        if (Object.keys(termsToTranslate).length === 0) continue;

        const prompt = `Translate the following JSON object of English UI strings to ${langName}. 
Return ONLY a valid JSON object with the same keys and translated values.
Keep variables like {count}, {email}, {role}, {price}, {totalPrice}, {months}, {slotName}, {checkoutUrl} unchanged.
Do not translate keys, only values.

JSON to translate:
${JSON.stringify(termsToTranslate, null, 2)}`;

        const res = await base44.integrations.Core.InvokeLLM({
          prompt,
          response_json_schema: {
            type: "object",
            additionalProperties: { type: "string" },
          },
        });

        if (res && typeof res === "object") {
          Object.keys(res).forEach((k) => {
            if (batch.includes(k) && res[k] && res[k].trim()) {
              if (!updatedValues[k]) updatedValues[k] = {};
              updatedValues[k][selectedLang] = res[k];
            }
          });
        }
      }

      // Save all translations to DB
      const keysToUpdate = Object.keys(updatedValues);
      for (const key of keysToUpdate) {
        const existingRec = dbMap[key];
        let valuesObj = {};
        if (existingRec) {
          try { valuesObj = JSON.parse(existingRec.values || "{}"); } catch {}
        }
        // Merge static translations for all languages
        Object.keys(translations).forEach((lang) => {
          if (translations[lang] && translations[lang][key] && !valuesObj[lang]) {
            valuesObj[lang] = translations[lang][key];
          }
        });
        // Apply auto-translated values
        valuesObj[selectedLang] = updatedValues[key][selectedLang];

        const valuesStr = JSON.stringify(valuesObj);
        if (existingRec) {
          await base44.entities.Translation.update(existingRec.id, { values: valuesStr });
        } else {
          const created = await base44.entities.Translation.create({ key, values: valuesStr });
          setDbRecords((prev) => [created, ...prev]);
        }
      }

      // Reload DB records
      await loadData();
      await reloadTranslations();
      toast({ title: t("tr.autoTranslateDone") });
    } catch (e) {
      toast({ title: t("tr.autoTranslateError"), variant: "destructive" });
    }
    setAutoTranslating(false);
  }

  // Translate a single key to the selected language using LLM
  async function translateSingleKey(key) {
    if (!selectedLang || selectedLang === "en") return;
    setTranslatingKeys((prev) => ({ ...prev, [key]: true }));
    try {
      const langName = getLanguageName(selectedLang) || selectedLang;
      const enVal = translations.en?.[key] || getValue(key, "en");
      if (!enVal || !enVal.trim()) {
        toast({ title: t("tr.translateKeyError"), variant: "destructive" });
        return;
      }

      const prompt = `You are a professional translator. Translate the following English text into ${langName} (${selectedLang}).

CRITICAL RULES:
- The output MUST be in ${langName}, NOT in English.
- Do NOT copy or echo the English text. You MUST translate it.
- Keep variables like {count}, {email}, {role}, {price}, {totalPrice}, {months}, {slotName}, {checkoutUrl} unchanged.
- Return ONLY a JSON object: {"translation": "<${langName} translation here>"}.

English text to translate:
"${enVal}"

Your ${langName} translation:`;

      const res = await base44.integrations.Core.InvokeLLM({
        prompt,
        model: "gemini_3_flash",
        response_json_schema: {
          type: "object",
          properties: { translation: { type: "string" } },
        },
      });

      let translatedValue = res?.translation?.trim();
      if (!translatedValue) {
        toast({ title: t("tr.translateKeyError"), variant: "destructive" });
        return;
      }
      // Reject if LLM returned the English text unchanged
      if (translatedValue === enVal) {
        toast({ title: t("tr.translateKeyError"), variant: "destructive" });
        return;
      }

      // Save to DB
      const existingRec = dbMap[key];
      let valuesObj = {};
      if (existingRec) {
        try { valuesObj = JSON.parse(existingRec.values || "{}"); } catch {}
      }
      Object.keys(translations).forEach((lang) => {
        if (translations[lang] && translations[lang][key] && !valuesObj[lang]) {
          valuesObj[lang] = translations[lang][key];
        }
      });
      valuesObj[selectedLang] = translatedValue;

      const valuesStr = JSON.stringify(valuesObj);
      if (existingRec) {
        await base44.entities.Translation.update(existingRec.id, { values: valuesStr });
      } else {
        const created = await base44.entities.Translation.create({ key, values: valuesStr });
        setDbRecords((prev) => [created, ...prev]);
      }

      // Clear any pending edits for this key in the selected language
      setEditValues((prev) => {
        const next = { ...prev };
        if (next[key]) {
          delete next[key][selectedLang];
          if (Object.keys(next[key]).length === 0) delete next[key];
        }
        return next;
      });

      await loadData();
      await reloadTranslations();
      toast({ title: t("tr.translateKeyDone") });
    } catch (e) {
      toast({ title: t("tr.translateKeyError"), variant: "destructive" });
    }
    setTranslatingKeys((prev) => ({ ...prev, [key]: false }));
  }

  // Export all translations to Excel
  function handleExport() {
    exportTranslationsToExcel(allKeys, translations, dbMap);
    toast({ title: t("tr.exportDone") });
  }

  // Import translations from Excel
  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const { importedData, fileLangCodes, langCodeByColIdx, fileLangNames } =
        await parseTranslationExcel(file);

      const existingCodes = availableLanguages.map((l) => l.code);
      const toAdd = [];
      const newLangInfo = {};
      fileLangNames.forEach((name, colIdx) => {
        const code = langCodeByColIdx[colIdx];
        if (!existingCodes.includes(code)) {
          toAdd.push(code);
          newLangInfo[code] = { name, native_name: name };
        }
      });
      const toRemove = existingCodes.filter((c) => !fileLangCodes.includes(c));

      // Add new languages
      for (const code of toAdd) {
        const info = newLangInfo[code];
        const created = await base44.entities.AppLanguage.create({
          code,
          name: info.name,
          native_name: info.native_name,
          is_active: true,
          sort_order: appLanguages.length,
        });
        setAppLanguages((prev) => [...prev, created]);
      }

      // Remove languages not in file
      for (const code of toRemove) {
        const rec = appLanguages.find((l) => l.code === code);
        if (rec) await base44.entities.AppLanguage.delete(rec.id);
      }
      setAppLanguages((prev) => prev.filter((l) => !toRemove.includes(l.code)));

      // Update translations using bulk operations to avoid rate limiting
      const keysToUpdate = Object.keys(importedData);
      const bulkUpdates = [];
      const bulkCreates = [];
      for (const key of keysToUpdate) {
        const existingRec = dbMap[key];
        let valuesObj = {};
        if (existingRec) {
          try { valuesObj = JSON.parse(existingRec.values || "{}"); } catch {}
        }
        Object.keys(translations).forEach((lang) => {
          if (translations[lang] && translations[lang][key] && !valuesObj[lang]) {
            valuesObj[lang] = translations[lang][key];
          }
        });
        Object.keys(importedData[key]).forEach((lang) => {
          valuesObj[lang] = importedData[key][lang];
        });
        toRemove.forEach((lang) => delete valuesObj[lang]);

        const valuesStr = JSON.stringify(valuesObj);
        if (existingRec) {
          bulkUpdates.push({ id: existingRec.id, values: valuesStr });
        } else {
          bulkCreates.push({ key, values: valuesStr });
        }
      }
      if (bulkUpdates.length > 0) {
        await base44.entities.Translation.bulkUpdate(bulkUpdates);
      }
      if (bulkCreates.length > 0) {
        const createdRecords = await base44.entities.Translation.bulkCreate(bulkCreates);
        setDbRecords((prev) => [...createdRecords, ...prev]);
      }

      await loadData();
      await reloadTranslations();
      toast({ title: t("tr.importSuccess") });
      // Force a full page reload to ensure all components pick up the new translations
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      toast({ title: t("tr.importError"), description: e?.message || String(e), variant: "destructive" });
    }
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Delete a custom key (only DB-only keys, not static ones)
  async function deleteCustomKey(key) {
    const rec = dbMap[key];
    if (!rec) return;
    try {
      await base44.entities.Translation.delete(rec.id);
      setDbRecords((prev) => prev.filter(r => r.id !== rec.id));
      toast({ title: t("tr.keyDeleted") });
    } catch (e) {
      toast({ title: t("tr.saveError"), variant: "destructive" });
    }
  }

  const selectedLangName = getLanguageNativeName(selectedLang);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-foreground">{t("tr.title")}</h1>
          <p className="text-sm text-slate-500">{t("tr.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
           <Button
             variant="outline"
             size="sm"
             onClick={() => setShowAddKey(!showAddKey)}
             className="min-h-[44px]"
           >
             <KeyRound className="w-4 h-4 mr-1" />
             {t("tr.addKey")}
           </Button>
           <Button
             variant="outline"
             size="sm"
             onClick={() => setShowLangMgmt(!showLangMgmt)}
             className="min-h-[44px]"
           >
             <Languages className="w-4 h-4 mr-1" />
             {t("tr.manageLanguages")}
           </Button>
           <Button
             variant="default"
             size="sm"
             onClick={autoTranslate}
             disabled={autoTranslating || !selectedLang || selectedLang === "en"}
             className="min-h-[44px]"
           >
             <Sparkles className="w-4 h-4 mr-1" />
             {autoTranslating ? t("tr.autoTranslating") : t("tr.autoTranslate")}
           </Button>
           <Button
             variant="outline"
             size="sm"
             onClick={handleExport}
             className="min-h-[44px]"
           >
             <Download className="w-4 h-4 mr-1" />
             {t("tr.export")}
           </Button>
           <Button
             variant="outline"
             size="sm"
             onClick={() => fileInputRef.current?.click()}
             disabled={importing}
             className="min-h-[44px]"
           >
             <Upload className="w-4 h-4 mr-1" />
             {importing ? t("tr.importing") : t("tr.import")}
           </Button>
           <input
             ref={fileInputRef}
             type="file"
             accept=".xlsx,.xls"
             onChange={handleImportFile}
             className="hidden"
           />
           </div>
           </div>

      {/* Add new key section */}
      {showAddKey && (
        <div className="bg-white dark:bg-card rounded-xl border border-slate-200 dark:border-border p-4 space-y-3">
          <h2 className="font-semibold text-slate-700 dark:text-foreground">{t("tr.createNewKey")}</h2>
          <p className="text-xs text-slate-500">{t("tr.newKeyDesc")}</p>
          <div className="flex gap-2">
            <Input
              placeholder={t("tr.newKeyPlaceholder")}
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createNewKey(); }}
              className="min-h-[44px] flex-1"
            />
            <Button onClick={createNewKey} className="min-h-[44px]">
              <Plus className="w-4 h-4 mr-1" />
              {t("tr.create")}
            </Button>
          </div>
        </div>
      )}

      {/* Language Management Section */}
      {showLangMgmt && (
        <div className="bg-white dark:bg-card rounded-xl border border-slate-200 dark:border-border p-4 space-y-3">
          <h2 className="font-semibold text-slate-700 dark:text-foreground">{t("tr.activeLanguages")}</h2>
          <div className="flex flex-wrap gap-2">
            {availableLanguages.map((l) => (
              <div
                key={l.code}
                className="flex items-center gap-1 bg-slate-100 dark:bg-accent rounded-lg px-3 py-1.5 text-sm"
              >
                <span className="font-medium">{l.native_name || l.name}</span>
                <span className="text-slate-400 text-xs">({l.code})</span>
                <button
                  onClick={() => removeLanguage(l.code)}
                  className="ml-1 text-red-500 hover:text-red-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-100 dark:border-border pt-3">
            <h3 className="font-medium text-sm text-slate-600 mb-2">{t("tr.addLanguage")}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <Input
                placeholder="code (e.g. de)"
                value={newLang.code}
                onChange={(e) => setNewLang({ ...newLang, code: e.target.value })}
                className="min-h-[44px]"
              />
              <Input
                placeholder="Name (English)"
                value={newLang.name}
                onChange={(e) => setNewLang({ ...newLang, name: e.target.value })}
                className="min-h-[44px]"
              />
              <Input
                placeholder="Native name"
                value={newLang.native_name}
                onChange={(e) => setNewLang({ ...newLang, native_name: e.target.value })}
                className="min-h-[44px]"
              />
              <Button onClick={addLanguage} className="min-h-[44px]">
                <Plus className="w-4 h-4 mr-1" />
                {t("tr.add")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Language Selector + Search */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <Label className="text-xs text-slate-500 mb-1">{t("tr.editLanguage")}</Label>
          <select
            value={selectedLang}
            onChange={(e) => setSelectedLang(e.target.value)}
            className="w-full rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card px-3 py-2.5 text-sm min-h-[44px]"
          >
            {editableLanguages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.native_name || l.name} ({l.code})
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <Label className="text-xs text-slate-500 mb-1">{t("tr.search")}</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder={t("tr.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 min-h-[44px]"
            />
          </div>
        </div>
      </div>

      {/* Translation Table Header */}
      <div className="hidden sm:grid grid-cols-12 gap-2 px-2 text-xs font-semibold text-slate-500 uppercase">
        <div className="col-span-3">{t("tr.key")}</div>
        <div className="col-span-3">Български</div>
        <div className="col-span-3">English</div>
        <div className="col-span-3">{selectedLangName}</div>
      </div>

      {/* Translation Rows */}
      <div className="space-y-2">
        {filteredKeys.map((key) => {
          const hasEdits = editValues[key] && Object.keys(editValues[key]).length > 0;
          const bgValue = getValue(key, "bg");
          const enValue = getValue(key, "en");
          const langValue = getValue(key, selectedLang);
          return (
            <div
              key={key}
              className="bg-white dark:bg-card rounded-lg border border-slate-200 dark:border-border p-3"
            >
              {/* Desktop layout */}
              <div className="hidden sm:grid grid-cols-12 gap-2 items-start">
                <div className="col-span-3">
                  <div className="text-xs font-mono text-slate-400 break-all">{key}</div>
                </div>
                <div className="col-span-3">
                  <Textarea
                    value={bgValue}
                    onChange={(e) => handleEdit(key, "bg", e.target.value)}
                    className="min-h-[44px] text-sm resize-none"
                    rows={2}
                  />
                </div>
                <div className="col-span-3">
                  <Textarea
                    value={enValue}
                    onChange={(e) => handleEdit(key, "en", e.target.value)}
                    className="min-h-[44px] text-sm resize-none"
                    rows={2}
                  />
                </div>
                <div className="col-span-3">
                  <Textarea
                    value={langValue}
                    onChange={(e) => handleEdit(key, selectedLang, e.target.value)}
                    className="min-h-[44px] text-sm resize-none"
                    rows={2}
                  />
                </div>
              </div>

              {/* Mobile layout */}
              <div className="sm:hidden space-y-2">
                <div className="text-xs font-mono text-slate-400 break-all">{key}</div>
                <div>
                  <Label className="text-xs text-slate-400">Български</Label>
                  <Textarea
                    value={bgValue}
                    onChange={(e) => handleEdit(key, "bg", e.target.value)}
                    className="min-h-[44px] text-sm resize-none"
                    rows={2}
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-400">English</Label>
                  <Textarea
                    value={enValue}
                    onChange={(e) => handleEdit(key, "en", e.target.value)}
                    className="min-h-[44px] text-sm resize-none"
                    rows={2}
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-400">{selectedLangName}</Label>
                  <Textarea
                    value={langValue}
                    onChange={(e) => handleEdit(key, selectedLang, e.target.value)}
                    className="min-h-[44px] text-sm resize-none"
                    rows={2}
                  />
                </div>
              </div>

              {/* Save + Translate + Delete buttons */}
              <div className="flex justify-end gap-2 mt-2">
                {customDbKeys.includes(key) && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteCustomKey(key)}
                    className="min-h-[44px]"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    {t("common.delete")}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => translateSingleKey(key)}
                  disabled={translatingKeys[key] || !selectedLang || selectedLang === "en"}
                  className="min-h-[44px]"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1" />
                  {translatingKeys[key] ? t("tr.translatingKey") : t("tr.translateKey")}
                </Button>
                {hasEdits && (
                  <Button
                    size="sm"
                    onClick={() => saveKey(key)}
                    disabled={savingKeys[key]}
                    className="min-h-[44px]"
                  >
                    <Save className="w-3.5 h-3.5 mr-1" />
                    {savingKeys[key] ? t("tr.saving") : t("common.save")}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredKeys.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          {t("tr.noKeys")}
        </div>
      )}

      <div className="text-xs text-slate-400 text-center pb-4">
        {filteredKeys.length} / {allKeys.length} {t("tr.keys")}
      </div>
    </div>
  );
}