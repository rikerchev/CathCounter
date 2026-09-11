import { EXPORT_GROUPS } from "@/lib/exportSchemas";
import { ALL_MENU_ITEMS } from "@/lib/menuItems";

/**
 * Builds two reference-only sheets appended to the "global export" file:
 * one documenting every entity's fields (sourced from EXPORT_GROUPS, the
 * same schema definitions the import/export forms already use), and one
 * listing every app route. Purely informational — importing this file back
 * in does nothing, it's there so whoever opens the export understands the
 * shape of the data around it.
 */
export async function getStructureSheets() {
  const entityRows = [];
  for (const [groupKey, group] of Object.entries(EXPORT_GROUPS)) {
    for (const sheetDef of group.sheets || []) {
      for (const col of sheetDef.columns || []) {
        entityRows.push({
          group: group.title || groupKey,
          entity: group.entity || "",
          field_key: col.key,
          field_label: col.label,
          type: col.type || "string",
          hint: col.hint || "",
        });
      }
    }
  }

  const entitiesSheet = {
    sheetName: "App - Entities",
    columns: [
      { key: "group", label: "Група" },
      { key: "entity", label: "Entity" },
      { key: "field_key", label: "Поле (key)" },
      { key: "field_label", label: "Етикет" },
      { key: "type", label: "Тип" },
      { key: "hint", label: "Пояснение" },
    ],
    data: entityRows,
  };

  const routesSheet = {
    sheetName: "App - Routes",
    columns: [
      { key: "path", label: "Път (URL)" },
      { key: "labelKey", label: "Translation key" },
    ],
    data: ALL_MENU_ITEMS.map((item) => ({ path: item.path, labelKey: item.labelKey })),
  };

  return [entitiesSheet, routesSheet];
}
