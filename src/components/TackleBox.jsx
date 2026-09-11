import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Boxes } from "lucide-react";

export default function TackleBox({ baits, onAdd, onRemove }) {
  const [name, setName] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({ name: name.trim() });
    setName("");
  };

  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Boxes className="w-4 h-4 text-cyan-600" />
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
          Tackle Box
        </h2>
      </div>
      <form onSubmit={submit} className="flex gap-2 mb-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add a bait or lure (e.g. Nightcrawler)"
          className="h-8 text-sm"
        />
        <Button type="submit" size="sm" className="bg-cyan-600 hover:bg-cyan-700">
          <Plus className="w-4 h-4" />
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {baits.map((b) => (
          <span
            key={b.id}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs"
          >
            {b.name}
            <button
              type="button"
              onClick={() => onRemove(b)}
              className="text-slate-400 hover:text-rose-500"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </span>
        ))}
        {baits.length === 0 && (
          <p className="text-xs text-slate-400">
            Add baits and lures here, then pick one when starting a timer.
          </p>
        )}
      </div>
    </div>
  );
}