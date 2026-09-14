import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Download, Upload, Loader2, Database, Fish, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { exportWithHints, parseMultiSheetExcel, rowToEntity } from "@/lib/excelUtils";
import { ALL_COUNTRIES } from "@/lib/countries";
import { EXPORT_GROUPS } from "@/lib/exportSchemas";
import { calculateCountryPrice } from "@/lib/pricing";
import { useAuth } from "@/lib/AuthContext";
import { exportUserData, importUserData } from "@/lib/dataPortability";
import { exportGlobalBackup, importGlobalBackup, readGlobalBackupManifest } from "@/lib/globalBackup";

export default function AdminDataExport() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [exporting, setExporting] = useState("");
  const [importing, setImporting] = useState("");
  const [globalProgress, setGlobalProgress] = useState("");
  const [cleaningPhotos, setCleaningPhotos] = useState(false);
  const [exportingCatches, setExportingCatches] = useState(false);
  const [importingCatches, setImportingCatches] = useState(false);
  const fileInputRef = useRef(null);
  const catchesFileInputRef = useRef(null);
  const globalFileInputRef = useRef(null);
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

  // ── Catches & Photos (personal export/import) ────────────
  // Separate from the admin bulk-entity export above: every user's own
  // fishing catches (their "sessions" reappear automatically once catches
  // are re-imported — see src/pages/Sessions.jsx, sessions have no
  // separate stored record) together with attached photos, as a single
  // .zip via src/lib/dataPortability.js. Reuses the same saveCatch() /
  // savePendingPhoto() / syncAll() primitives the rest of the app uses, so
  // imported data behaves exactly like normally-logged catches.

  const handleExportCatches = async () => {
    setExportingCatches(true);
    try {
      const result = await exportUserData(user);
      if (result.catchesCount === 0) {
        toast({ title: "Нямате улови за експортиране" });
      } else {
        toast({ title: `Готово — изтеглени ${result.catchesCount} улова и ${result.photosCount} снимки` });
      }
    } catch (e) {
      toast({ title: "Грешка при експорт", description: e.message, variant: "destructive" });
    } finally {
      setExportingCatches(false);
    }
  };

  const handleImportCatchesClick = () => {
    if (catchesFileInputRef.current) {
      catchesFileInputRef.current.value = "";
      catchesFileInputRef.current.click();
    }
  };

  const handleImportCatchesFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingCatches(true);
    try {
      const result = await importUserData(file, {
        onConfirm: ({ catchesCount, photosCount }) =>
          window.confirm(
            `Файлът съдържа ${catchesCount} улова и ${photosCount} снимки. Ще бъдат добавени като нови записи (повторен импорт на същия файл ще създаде дубликати). Продължавате ли?`
          ),
      });
      if (result) {
        toast({ title: `Готово — добавени ${result.catchesCount} улова и ${result.photosCount} снимки` });
      }
    } catch (e) {
      toast({ title: "Грешка при импорт", description: e.message, variant: "destructive" });
    } finally {
      setImportingCatches(false);
      if (catchesFileInputRef.current) catchesFileInputRef.current.value = "";
    }
  };

  // ── Global backup (ALL tables + ALL catch photos in one .zip) ──────────
  // A real database backup, not just the admin-editable entity groups below:
  // every table (including users with their password hashes, app settings
  // with any saved integration credentials, and every catch photo) so the
  // file alone is enough to fully restore the app. See src/lib/globalBackup.js
  // for why this is a .zip of many small requests rather than one big file
  // (Vercel's 4.5MB request/response cap).

  const handleGlobalExport = async () => {
    setExporting("global");
    setGlobalProgress("");
    try {
      const result = await exportGlobalBackup(setGlobalProgress);
      const tableRows = Object.values(result.tables).reduce((a, b) => a + b, 0);
      toast({
        title: "Резервното копие е готово",
        description: `${tableRows} записа във всички таблици и ${result.photosCount} снимки.`,
      });
    } catch (e) {
      toast({ title: "Грешка при резервно копие", description: e.message, variant: "destructive" });
    } finally {
      setExporting("");
      setGlobalProgress("");
    }
  };

  // ── Global restore — DESTRUCTIVE: replaces every table's current data ──

  const handleGlobalImportClick = () => {
    if (globalFileInputRef.current) {
      globalFileInputRef.current.value = "";
      globalFileInputRef.current.click();
    }
  };

  const handleGlobalFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const manifest = await readGlobalBackupManifest(file);
      const tableRows = Object.values(manifest.tables || {}).reduce((a, b) => a + b, 0);
      const summary =
        `Файлът съдържа ${tableRows} записа във всички таблици и ${manifest.photos || 0} снимки ` +
        `(от ${manifest.exported_at ? new Date(manifest.exported_at).toLocaleString("bg-BG") : "неизвестна дата"}).\n\n` +
        `ВНИМАНИЕ: Възстановяването ще ИЗТРИЕ всички текущи данни в приложението ` +
        `(потребители, улови, снимки, обяви, настройки и т.н.) и ще ги замени с тези от файла. ` +
        `Това действие е НЕОБРАТИМО.\n\nПродължавате ли?`;
      if (!window.confirm(summary)) return;

      const typed = window.prompt('За да потвърдите, напишете точно думата "ИЗТРИЙ" (с главни букви):');
      if (typed !== "ИЗТРИЙ") {
        toast({ title: "Възстановяването е отказано" });
        return;
      }

      setImporting("global");
      setGlobalProgress("");
      const result = await importGlobalBackup(file, { onProgress: setGlobalProgress });
      toast({
        title: "Възстановяването завърши",
        description: `${result.rowsRestored} записа и ${result.photosCount} снимки.`,
      });
    } catch (e) {
      toast({ title: "Грешка при възстановяване", description: e.message, variant: "destructive" });
    } finally {
      setImporting("");
      setGlobalProgress("");
      if (globalFileInputRef.current) globalFileInputRef.current.value = "";
    }
  };

  // ── Cleanup: unused catch photos left behind by replaced/deleted catches ──
  // (Going forward, replacing or deleting a catch's photo cleans up after
  // itself automatically — see server/routes/entities.ts. This button is
  // for the backlog that piled up before that existed.)

  const handleCleanupOrphanedPhotos = async () => {
    setCleaningPhotos(true);
    try {
      const { count } = await base44.admin.backup.orphanedPhotosCount();
      if (count === 0) {
        toast({ title: "Няма неизползвани снимки" });
        return;
      }
      const proceed = window.confirm(
        `Намерени са ${count} неизползвани снимки в базата (снимки на подменени или изтрити улови, ` +
        `които вече не се показват никъде). Ще бъдат изтрити от базата. Продължавате ли?`
      );
      if (!proceed) return;
      const { deleted } = await base44.admin.backup.cleanupOrphanedPhotos();
      toast({ title: `Изтрити ${deleted} неизползвани снимки` });
    } catch (e) {
      toast({ title: "Грешка при почистване", description: e.message, variant: "destructive" });
    } finally {
      setCleaningPhotos(false);
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
              <p className="font-medium text-slate-700 dark:text-foreground">Глобален бекъп (пълен)</p>
              <p className="text-xs text-slate-400">
                Пълно резервно копие на цялата база данни — всички потребители, улови, снимки, обяви,
                водоеми, настройки и др. — в един .zip файл. Файлът съдържа чувствителни данни
                (пароли, настройки на интеграции) — пазете го на сигурно място.
              </p>
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
              Изтегли бекъп
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleGlobalImportClick}
              disabled={exporting !== "" || importing !== ""}
              className="min-h-[44px]"
            >
              {importing === "global" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
              Възстанови от бекъп
            </Button>
          </div>
        </div>
        {(exporting === "global" || importing === "global") && globalProgress && (
          <p className="text-xs text-cyan-700 dark:text-cyan-300 mt-2">{globalProgress}</p>
        )}
        <div className="mt-3 pt-3 border-t border-cyan-200 dark:border-border flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-slate-400">
            Снимки на подменени или изтрити улови, останали неизползвани в базата
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCleanupOrphanedPhotos}
            disabled={cleaningPhotos || exporting !== "" || importing !== ""}
            className="min-h-[44px]"
          >
            {cleaningPhotos ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
            Изчисти неизползвани снимки
          </Button>
        </div>
        <input
          ref={globalFileInputRef}
          type="file"
          accept=".zip"
          onChange={handleGlobalFileChange}
          className="hidden"
        />
      </div>

      {/* Catches & Photos — personal backup (own catches + attached photos) */}
      <div className="p-4 rounded-xl bg-white border border-slate-100 dark:bg-card dark:border-border shadow-sm flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-cyan-50 flex items-center justify-center">
            <Fish className="w-5 h-5 text-cyan-600" />
          </div>
          <div>
            <p className="font-medium text-slate-700 dark:text-foreground">Улови и снимки</p>
            <p className="text-xs text-slate-400">Резервно копие на вашите улови и прикачените снимки (сесиите се виждат автоматично от тях)</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCatches}
            disabled={exportingCatches || importingCatches}
            className="min-h-[44px]"
          >
            {exportingCatches ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
            Експорт
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleImportCatchesClick}
            disabled={exportingCatches || importingCatches}
            className="min-h-[44px]"
          >
            {importingCatches ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
            Импорт
          </Button>
        </div>
      </div>
      <input
        ref={catchesFileInputRef}
        type="file"
        accept=".zip"
        onChange={handleImportCatchesFileChange}
        className="hidden"
      />

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