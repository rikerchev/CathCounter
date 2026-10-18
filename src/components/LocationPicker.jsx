import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, ChevronRight, Check } from "lucide-react";
import { placeFilterValue, spotFilterValue, describeFilter } from "@/lib/catchPlaces";

// v3.119 — two-level location picker: a place (usually a water body) that
// can be expanded to show its sub-locations. Picking the place selects every
// catch in it; picking a sub-location narrows to that one. `value` is the
// filter string produced by catchPlaces.js ("" = everything).
export default function LocationPicker({
  index,
  value,
  onChange,
  placeholder,
  allLabel,
  className = "",
  triggerClassName = "h-9 text-sm",
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState({});

  const select = (v) => {
    onChange(v);
    setOpen(false);
  };
  const toggle = (key) => setExpanded((e) => ({ ...e, [key]: !e[key] }));
  const label = describeFilter(index, value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`flex w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-left shadow-sm ${triggerClassName} ${className}`}
        >
          <span className={`truncate ${label ? "" : "text-muted-foreground"}`}>{label || placeholder}</span>
          <ChevronDown className="h-4 w-4 flex-shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] max-h-80 overflow-y-auto p-1">
        <button
          type="button"
          onClick={() => select("")}
          className="flex w-full items-center justify-between rounded-sm px-2 py-2 text-sm hover:bg-accent min-h-[40px]"
        >
          <span>{allLabel}</span>
          {!value && <Check className="h-4 w-4 text-cyan-600" />}
        </button>
        {index.places.map((place) => {
          const multi = place.spots.length > 1;
          const isOpen = !!expanded[place.key];
          const placeSelected = value === placeFilterValue(place.key);
          return (
            <div key={place.key}>
              <div className="flex items-center">
                {multi ? (
                  <button
                    type="button"
                    onClick={() => toggle(place.key)}
                    className="flex h-10 w-8 flex-shrink-0 items-center justify-center rounded-sm hover:bg-accent"
                    aria-label={place.name}
                    aria-expanded={isOpen}
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                ) : (
                  <span className="w-8 flex-shrink-0" />
                )}
                <button
                  type="button"
                  onClick={() => select(placeFilterValue(place.key))}
                  className="flex min-h-[40px] flex-1 items-center justify-between gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent"
                >
                  <span className="truncate font-medium">{place.name}</span>
                  <span className="flex flex-shrink-0 items-center gap-1.5">
                    <span className="text-xs text-slate-400">{place.count}</span>
                    {placeSelected && <Check className="h-4 w-4 text-cyan-600" />}
                  </span>
                </button>
              </div>
              {multi && isOpen && place.spots.map((spot) => {
                const v = spotFilterValue(place.key, spot.key);
                return (
                  <button
                    key={spot.key || "__unnamed"}
                    type="button"
                    onClick={() => select(v)}
                    className="flex min-h-[36px] w-full items-center justify-between gap-2 rounded-sm py-1.5 pl-10 pr-2 text-left text-sm text-slate-600 hover:bg-accent"
                  >
                    <span className="truncate">{spot.name}</span>
                    <span className="flex flex-shrink-0 items-center gap-1.5">
                      <span className="text-xs text-slate-400">{spot.count}</span>
                      {value === v && <Check className="h-4 w-4 text-cyan-600" />}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
