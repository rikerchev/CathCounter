import React, { useState } from "react";
import { base44, apiUrl } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, Link2, Search } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

// v3.170 — "Несвързани" снимки: качени от потребителя (има ги в базата, със
// собственик и час на качване), но нито един улов не сочи към тях. Сървърът
// предлага за всяка улова на СЪЩИЯ потребител, който още няма снимка, най-близък
// по време (уловът е направен преди качването). Админът вижда снимката и избира /
// потвърждава — нищо не се свързва без потвърждение.

function fmtTime(ms) {
  try {
    return new Date(ms).toLocaleString("bg-BG", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return String(ms);
  }
}

function catchLabel(c) {
  const parts = [fmtTime(c.t)];
  if (c.species) parts.push(String(c.species));
  if (c.weight) parts.push(`${c.weight} кг`);
  if (c.rod) parts.push(`въдица ${c.rod}`);
  if (c.location) parts.push(String(c.location).slice(0, 30));
  return parts.join(" · ");
}

export default function UnlinkedPhotosPanel({ disabled }) {
  const { toast } = useToast();
  const [rows, setRows] = useState(null);
  const [choice, setChoice] = useState({}); // photoId -> catchId ("" = none)
  const [checked, setChecked] = useState({}); // photoId -> bool
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { photos } = await base44.admin.backup.unlinkedPhotos();
      const ch = {};
      const ck = {};
      for (const p of photos) {
        ch[p.id] = p.proposal || "";
        ck[p.id] = !!p.proposal && p.confident;
      }
      setChoice(ch);
      setChecked(ck);
      setRows(photos);
      if (photos.length === 0) toast({ title: "Няма несвързани снимки" });
    } catch (e) {
      toast({ title: "Грешка при търсене", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const selectedLinks = () =>
    (rows || [])
      .filter((p) => checked[p.id] && choice[p.id])
      .map((p) => ({ photo_id: p.id, catch_id: choice[p.id] }));

  const apply = async () => {
    const links = selectedLinks();
    if (links.length === 0) return;
    const used = new Set();
    for (const l of links) {
      if (used.has(l.catch_id)) {
        toast({ title: "Два избора сочат към един и същи улов", description: "Променете единия, преди да свържете.", variant: "destructive" });
        return;
      }
      used.add(l.catch_id);
    }
    if (!window.confirm(`Ще бъдат свързани ${links.length} снимки с избраните улови. Продължавате ли?`)) return;
    setApplying(true);
    try {
      const { linked, skipped } = await base44.admin.backup.linkUnlinkedPhotos(links);
      toast({
        title: `Свързани ${linked} снимки`,
        description: skipped?.length ? `Пропуснати: ${skipped.length} (${skipped[0].reason})` : undefined,
      });
      await load();
    } catch (e) {
      toast({ title: "Грешка при свързване", description: e.message, variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  const count = selectedLinks().length;

  return (
    <div className="mt-3 pt-3 border-t border-cyan-200 dark:border-border">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-slate-400 max-w-md">
          Снимки, качени от потребители, към които не сочи нито един улов („несвързани“ в бекъпа) —
          предлага се свързване с улов на същия потребител по време
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={load}
          disabled={loading || applying || disabled}
          className="min-h-[44px]"
        >
          {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Search className="w-4 h-4 mr-1" />}
          Търси несвързани снимки
        </Button>
      </div>

      {rows && rows.length > 0 && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-slate-500">
            Намерени: {rows.length}. Маркирани по подразбиране са само предложенията с разлика до 15 минути —
            останалите проверете по снимката.
          </p>
          {rows.map((p) => (
            <div
              key={p.id}
              className="flex gap-3 p-2 rounded-lg bg-white dark:bg-card border border-slate-100 dark:border-border"
            >
              <a href={apiUrl(`/api/catch-photos/${p.id}`)} target="_blank" rel="noreferrer" className="shrink-0">
                <img
                  src={apiUrl(`/api/catch-photos/${p.id}`)}
                  alt=""
                  loading="lazy"
                  className="w-20 h-20 object-cover rounded-md bg-slate-100"
                />
              </a>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs text-slate-600 dark:text-foreground truncate">
                  {p.owner ? p.owner.label : "без собственик"} · качена {fmtTime(new Date(p.created_at).getTime())}
                </p>
                {p.owner && p.candidates.length > 0 ? (
                  <>
                    <select
                      value={choice[p.id] || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setChoice((s) => ({ ...s, [p.id]: v }));
                        setChecked((s) => ({ ...s, [p.id]: !!v }));
                      }}
                      className="w-full text-xs border border-slate-200 dark:border-border rounded-md px-2 py-2 bg-white dark:bg-card"
                    >
                      <option value="">— не свързвай —</option>
                      {p.candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {catchLabel(c)}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-2 text-xs text-slate-500">
                      <input
                        type="checkbox"
                        checked={!!checked[p.id] && !!choice[p.id]}
                        disabled={!choice[p.id]}
                        onChange={(e) => setChecked((s) => ({ ...s, [p.id]: e.target.checked }))}
                      />
                      Свържи
                      {p.proposal && choice[p.id] === p.proposal && (
                        <span className={p.confident ? "text-emerald-600" : "text-amber-600"}>
                          · предложение, разлика {p.diff_min} мин
                        </span>
                      )}
                    </label>
                  </>
                ) : (
                  <p className="text-xs text-amber-600">
                    Няма подходящ улов без снимка на този потребител (преди качването).
                  </p>
                )}
              </div>
            </div>
          ))}
          <Button size="sm" onClick={apply} disabled={applying || count === 0 || disabled} className="min-h-[44px]">
            {applying ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Link2 className="w-4 h-4 mr-1" />}
            Свържи избраните ({count})
          </Button>
        </div>
      )}
    </div>
  );
}
