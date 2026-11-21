// Rod card colors — shared by RodTimer and the competition panel (v3.158).
export const ROD_COLORS = [
  { bar: "bg-blue-500", text: "text-blue-600", nameKey: "rod.colorBlue" },
  { bar: "bg-rose-500", text: "text-rose-600", nameKey: "rod.colorRed" },
  { bar: "bg-emerald-500", text: "text-emerald-600", nameKey: "rod.colorGreen" },
  { bar: "bg-amber-500", text: "text-amber-600", nameKey: "rod.colorOrange" },
  { bar: "bg-violet-500", text: "text-violet-600", nameKey: "rod.colorPurple" },
  { bar: "bg-cyan-500", text: "text-cyan-600", nameKey: "rod.colorCyan" },
];

// Same rule RodTimer uses: the angler's own pick, else by rod number.
export function rodColorIndex(rod) {
  return rod?.config?.rodColor ?? ((rod?.id || 1) - 1) % ROD_COLORS.length;
}
