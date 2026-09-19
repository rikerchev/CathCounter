import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Loader2 } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

// v3.21 — shown right before every brochure download (WaterBodyManagement.jsx,
// TraderVenues.jsx, AdminTraders.jsx — the three screens where a water-body
// owner, a merchant, or an admin acting on either's behalf downloads the
// printable brochure) so they can add one line of free contact text to the
// brochure before it's generated: a phone number, a website, a Facebook
// page, or a custom label like "За резервация тел.: ...".
//
// Deliberately a plain free-text field, not a "phone number" field — the
// value is drawn as-is with no icon and no forced format by
// src/lib/brochure.js's drawContactText(), since the owner/merchant may
// want something other than a phone number there. `defaultValue` lets each
// caller prefill from the venue's own contact_phone when it has one, but
// the field stays fully editable either way.
//
// v3.22 — also the download-format picker (PDF / JPG / PNG), so this one
// dialog now fronts every brochure download in the app, including the
// venue-independent "generic" brochure in AdminSetup.jsx (which has no
// `defaultValue` to prefill from). `onConfirm(text, format)` gets both.
//
// v3.25 — reused (not just for the brochure itself) by the "Списък
// участници" and "Изтегли жребий (снимка)" image exports in
// WaterBodyManagement.jsx: both of those already embed this water body's
// actual brochure at the bottom of the exported image (see
// src/lib/standingsImage.js's renderRowsPage), so the same optional contact
// line applies there too. Those two exports are always PNG (canvas-drawn,
// not routed through downloadInviteBrochure's format branches), so
// `showFormat = false` hides the format picker for them — passing `format`
// to their onConfirm would be meaningless. `title`/`confirmLabel` let those
// callers relabel the dialog/button for what's actually being exported
// ("Списък участници" / "Изтегли жребий (снимка)") instead of the brochure
// wording, without needing new translation keys — both reuse existing ones.
const FORMATS = ["pdf", "jpg", "png"];

export default function BrochureContactDialog({
  open, onOpenChange, defaultValue, downloading, onConfirm,
  showFormat = true, title, confirmLabel,
}) {
  const { t } = useLanguage();
  const [text, setText] = useState(defaultValue || "");
  const [format, setFormat] = useState("pdf");

  useEffect(() => {
    if (open) {
      setText(defaultValue || "");
      setFormat("pdf");
    }
  }, [open, defaultValue]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!downloading) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title || t("brochure.contactTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("brochure.contactLabel")}</Label>
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("brochure.contactPlaceholder")}
              className="min-h-[44px]"
              autoFocus
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">{t("brochure.contactHint")}</p>
          </div>
          {showFormat && (
            <div className="space-y-1.5">
              <Label>{t("brochure.formatLabel")}</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMATS.map((f) => (
                    <SelectItem key={f} value={f}>{t(`brochure.format.${f}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={downloading}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => onConfirm(text.trim(), format)} disabled={downloading}>
            {downloading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
            {confirmLabel || t("tv.downloadBrochure")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
