// v3.157 — links inventory items (baits table) to the catches that use them.
// Catches store tackle by NAME (not id), in different fields depending on the
// screen that wrote them (timer, LogCatch, EditCatch), so each inventory
// category maps to every catch field it can end up in.
import { getAllCatches, saveCatchLocal } from "@/lib/localDb";
import { pushOnly } from "@/lib/syncEngine";

export const CATEGORY_CATCH_FIELDS = {
  groundbait: ["feeder", "feeder2", "bait"],
  bait: ["bait"],
  hook: ["hook_size"],
  line: ["line"],
  rod: ["rod_model", "feeder"],
  other: ["rig_details", "feeder"],
  feeder: ["feeder_basket", "feeder"],
};

const fieldsFor = (category) => CATEGORY_CATCH_FIELDS[category || "bait"] || [];
const same = (value, name) => typeof value === "string" && value.trim() === String(name).trim();

export async function findCatchesUsing(name, category) {
  const fields = fieldsFor(category);
  if (!name || fields.length === 0) return [];
  const all = await getAllCatches();
  return all.filter((c) => fields.some((f) => same(c[f], name)));
}

// Rewrites every catch that uses `oldName` so it uses `newName` instead and
// queues those catches for upload. Returns how many catches were changed.
export async function replaceInCatches(oldName, newName, category) {
  const fields = fieldsFor(category);
  const affected = await findCatchesUsing(oldName, category);
  for (const c of affected) {
    const next = { ...c };
    fields.forEach((f) => {
      if (same(next[f], oldName)) next[f] = newName;
    });
    await saveCatchLocal({ ...next, _synced: false });
  }
  if (affected.length > 0) {
    try {
      pushOnly();
    } catch {
      // best-effort — the unsynced flag makes the next sync push them anyway
    }
  }
  return affected.length;
}
