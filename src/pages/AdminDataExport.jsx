import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Download, Upload, Loader2, Database } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { exportWithHints, parseMultiSheetExcel, rowToEntity } from "@/lib/excelUtils";
import { ALL_COUNTRIES } from "@/lib/countries";
import { EXPORT_GROUPS } from "@/lib/exportSchemas";
import { calculateCountryPrice } from "@/lib/pricing";
import { getStructureSheets } from "@/lib/appStructure";

export default function AdminDataExport() {
  const { toast } = useToast();
  const [exporting, setExporting] = useState("");
  const [importing, setImporting] = useState("");
  const fileInputRef = useRef(null);
  const pendingGroup = useRef(null);

  const safeList = async (entity, limit = 500) => {
    try {
      return await base44.entities[entity].list("-created_date", limit);
    } catch {
      return [];
    }
  };

  // ── Export ──────────────────────────────────────────────

  const handleExport = async (groupKey) => {
    const group = EXPORT_GROUPS[groupKey];
    setExporting(groupKey);
    try {
      const sheets = [];

      for (const sheetDef of group.sheets) {
        const entityName = sheetDef.entity || group.entity;
        const rawData = await safeList(entityName);
        let columns = [...sheetDef.columns];
        let data = rawData;

        // Users: resolve menu_group_id to group name
        if (groupKey === "users") {
          const menuGroups = await safeList("MenuGroup");
          data = rawData.map(u => ({
            ...u,
            menu_group_name: menuGroups.find(g => g.id === u.menu_group_id)?.name || "",
          }));
        }

        // Prices: auto-calculated country prices from base price
        if (group.isPrices) {
          const countryCols = ALL_COUNTRIES.map(c => ({
            key: `__country_${c.code}`,
            label: c.name,
            hint: `Авто-изчислена цена за ${c.name} (не редактирайте — зависи от базовата цена)`,
            type: "number",
          }));
          columns = [...columns, ...countryCols];

          data = rawData.map(s => {
            const base = s.price_per_month || 0;
            const row = { ...s };
            for (const c of ALL_COUNTRIES) {
              row[`__country_${c.code}`] = calculateCountryPrice(base, c.code);
            }
            return row;
          });
        }

        sheets.push({ sheetName: sheetDef.sheetName, columns, data });
      }

      const filename = `${groupKey}.xlsx`;
      exportWithHints(sheets, filename);
      toast({ title: "Експортът е готов" });
    } catch (e) {
      toast({ title: "Грешка при експорт", description: e.message, variant: "destructive" });
    } finally {
      setExporting("");
    }
  };

  // ── Import ──────────────────────────────────────────────

  const handleImportClick = (groupKey) => {
    pendingGroup.current = groupKey;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !pendingGroup.current) return;

    const groupKey = pendingGroup.current;

    if (groupKey === "global") {
      await handleGlobalImport(file);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const group = EXPORT_GROUPS[groupKey];
    setImporting(groupKey);
    try {
      const sheets = await parseMultiSheetExcel(file);
      let updated = 0;
      let created = 0;

      // Users: fetch menu groups for name → id resolution
      let userMenuGroups = null;
      if (groupKey === "users") {
        userMenuGroups = await safeList("MenuGroup");
      }

      for (const sheetDef of group.sheets) {
        const entityName = sheetDef.entity || group.entity;
        const rows = sheets[sheetDef.sheetName] || [];
        const columns = sheetDef.columns;

        // For prices: build country name → code lookup
        const countryByName = {};
        if (group.isPrices) {
          for (const c of ALL_COUNTRIES) countryByName[c.name] = c.code;
        }

        for (const row of rows) {
          const entity = rowToEntity(row, columns);

          // Users: resolve group name to menu_group_id
          if (groupKey === "users" && userMenuGroups) {
            const groupName = entity.menu_group_name;
            entity.menu_group_id = groupName
              ? (userMenuGroups.find(g => g.name === groupName)?.id || null)
              : null;
            delete entity.menu_group_name;
          }

          // Prices: country columns are auto-calculated, ignore on import
          // Only the base price (price_per_month) is editable

          const hasId = entity.id && entity.id !== "";

          if (hasId) {
            // Update existing record
            if (group.canCreate === false && group.updatableFields) {
              const updateData = {};
              for (const f of group.updatableFields) {
                if (entity[f] !== undefined) updateData[f] = entity[f];
              }
              if (group.isPrices) updateData.country_pricing = entity.country_pricing;
              if (Object.keys(updateData).length > 0) {
                await base44.entities[entityName].update(entity.id, updateData);
                updated++;
              }
            } else {
              const { id, ...rest } = entity;
              await base44.entities[entityName].update(id, rest);
              updated++;
            }
          } else {
            // Create new record (if allowed)
            if (group.canCreate === false) continue;
            delete entity.id;
            const clean = {};
            for (const [k, v] of Object.entries(entity)) {
              if (v !== "" && v !== null && v !== undefined) clean[k] = v;
            }
            if (Object.keys(clean).length > 0) {
              await base44.entities[entityName].create(clean);
              created++;
            }
          }
        }
      }

      toast({ title: `Импорт готов: ${updated} обновени, ${created} създадени` });
    } catch (e) {
      toast({ title: "Грешка при импорт", description: e.message, variant: "destructive" });
    } finally {
      setImporting("");
      pendingGroup.current = null;
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── Global Export (all groups in one file) ───────────────

  const handleGlobalExport = async () => {
    setExporting("global");
    try {
      const allSheets = [];
      for (const groupKey of Object.keys(EXPORT_GROUPS)) {
        const group = EXPORT_GROUPS[groupKey];
        for (const sheetDef of group.sheets) {
          const entityName = sheetDef.entity || group.entity;
          const rawData = await safeList(entityName);
          let columns = [...sheetDef.columns];
          let data = rawData;

          if (groupKey === "users") {
            const menuGroups = await safeList("MenuGroup");
            data = rawData.map(u => ({
              ...u,
              menu_group_name: menuGroups.find(g => g.id === u.menu_group_id)?.name || "",
            }));
          }

          if (group.isPrices) {
            const countryCols = ALL_COUNTRIES.map(c => ({
              key: `__country_${c.code}`,
              label: c.name,
              hint: `Авто-изчислена цена за ${c.name}`,
              type: "number",
            }));
            columns = [...columns, ...countryCols];
            data = rawData.map(s => {
              const base = s.price_per_month || 0;
              const row = { ...s };
              for (const c of ALL_COUNTRIES) {
                row[`__country_${c.code}`] = calculateCountryPrice(base, c.code);
              }
              return row;
            });
          }

          allSheets.push({ sheetName: sheetDef.sheetName, columns, data });
        }
      }

      // Add app structure sheets (entity schemas + routes)
      const structureSheets = await getStructureSheets();
      allSheets.push(...structureSheets);

      exportWithHints(allSheets, "global-export.xlsx");
      toast({ title: "Глобалният експорт е готов" });
    } catch (e) {
      toast({ title: "Грешка при глобален експорт", description: e.message, variant: "destructive" });
    } finally {
      setExporting("");
    }
  };

  // ── Global Import (all sheets from one file) ────────────

  const handleGlobalImportClick = () => {
    pendingGroup.current = "global";
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleGlobalImport = async (file) => {
    setImporting("global");
    try {
      const sheets = await parseMultiSheetExcel(file);
      let updated = 0;
      let created = 0;

      let userMenuGroups = null;

      for (const groupKey of Object.keys(EXPORT_GROUPS)) {
        const group = EXPORT_GROUPS[groupKey];
        if (groupKey === "users") {
          userMenuGroups = await safeList("MenuGroup");
        }
        for (const sheetDef of group.sheets) {
          const entityName = sheetDef.entity || group.entity;
          const rows = sheets[sheetDef.sheetName] || [];
          const columns = sheetDef.columns;

          const countryByName = {};
          if (group.isPrices) {
            for (const c of ALL_COUNTRIES) countryByName[c.name] = c.code;
          }

          for (const row of rows) {
            const entity = rowToEntity(row, columns);

            if (groupKey === "users" && userMenuGroups) {
              const groupName = entity.menu_group_name;
              entity.menu_group_id = groupName
                ? (userMenuGroups.find(g => g.name === groupName)?.id || null)
                : null;
              delete entity.menu_group_name;
            }

            const hasId = entity.id && entity.id !== "";

            if (hasId) {
              if (group.canCreate === false && group.updatableFields) {
                const updateData = {};
                for (const f of group.updatableFields) {
                  if (entity[f] !== undefined) updateData[f] = entity[f];
                }
                if (group.isPrices) updateData.country_pricing = entity.country_pricing;
                if (Object.keys(updateData).length > 0) {
                  await base44.entities[entityName].update(entity.id, updateData);
                  updated++;
                }
              } else {
                const { id, ...rest } = entity;
                await base44.entities[entityName].update(id, rest);
                updated++;
              }
            } else {
              if (group.canCreate === false) continue;
              delete entity.id;
              const clean = {};
              for (const [k, v] of Object.entries(entity)) {
                if (v !== "" && v !== null && v !== undefined) clean[k] = v;
              }
              if (Object.keys(clean).length > 0) {
                await base44.entities[entityName].create(clean);
                created++;
              }
            }
          }
        }
      }

      toast({ title: `Глобален импорт готов: ${updated} обновени, ${created} създадени` });
    } catch (e) {
      toast({ title: "Грешка при глобален импорт", description: e.message, variant: "destructive" });
    } finally {
      setImporting("");
      pendingGroup.current = null;
    }
  };

  const groupKeys = Object.keys(EXPORT_GROUPS);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-foreground">Експорт / Импорт</h1>
        <p className="text-sm text-slate-400">
          Експортирайте данните в Excel файл с подсказки. Редактирайте и импортирайте обратно, за да обновите записите.
        </p>
      </div>

      {/* Global Export / Import */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-card dark:to-card border border-cyan-200 dark:border-border shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-100 dark:bg-accent flex items-center justify-center">
              <Database className="w-5 h-5 text-cyan-700 dark:text-foreground" />
            </div>
            <div>
              <p className="font-medium text-slate-700 dark:text-foreground">Глобален експорт / импорт</p>
              <p className="text-xs text-slate-400">Експортирай или импортирай всички данни в един файл</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={handleGlobalExport}
              disabled={exporting !== "" || importing !== ""}
              className="min-h-[44px]"
            >
              {exporting === "global" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
              Глобален експорт
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleGlobalImportClick}
              disabled={exporting !== "" || importing !== ""}
              className="min-h-[44px]"
            >
              {importing === "global" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
              Глобален импорт
            </Button>
          </div>
        </div>
      </div>

      {/* Source-code ZIP export was a Base44-hosting convenience (it recreated
          the app's package.json/vite.config.js/etc. as a downloadable zip —
          this literal zip is how this project got exported in the first
          place). Self-hosted, the source lives in your own repo, so this
          button and src/lib/codeExport.js were removed rather than ported. */}

      <div className="grid grid-cols-1 gap-3">
        {groupKeys.map((key) => {
          const card = EXPORT_GROUPS[key];
          const isExporting = exporting === key;
          const isImporting = importing === key;
          return (
            <div
              key={key}
              className="p-4 rounded-xl bg-white border border-slate-100 dark:bg-card dark:border-border shadow-sm flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-cyan-50 flex items-center justify-center">
                  <Database className="w-5 h-5 text-cyan-600" />
                </div>
                <div>
                  <p className="font-medium text-slate-700 dark:text-foreground">{card.title}</p>
                  <p className="text-xs text-slate-400">{card.desc}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport(key)}
                  disabled={isExporting || isImporting}
                  className="min-h-[44px]"
                >
                  {isExporting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
                  Експорт
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleImportClick(key)}
                  disabled={isExporting || isImporting}
                  className="min-h-[44px]"
                >
                  {isImporting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                  Импорт
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Hidden file input shared by all import buttons */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}