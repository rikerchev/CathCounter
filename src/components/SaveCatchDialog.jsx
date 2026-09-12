import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Camera, Fish, Loader2, Thermometer, Cloud, Wind } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { fetchWeather } from "@/lib/weather";
import { saveCatch } from "@/lib/catchRepository";
import { savePendingPhoto } from "@/lib/pendingPhotos";
import { syncAll } from "@/lib/syncEngine";
import SpeciesSelector from "@/components/SpeciesSelector";

const formatDuration = (s) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec}s`;
};

export default function SaveCatchDialog({ open, onOpenChange, catchData, onSave }) {
  const { t } = useLanguage();
  const [species, setSpecies] = useState("");
  const [customSpecies, setCustomSpecies] = useState("");
  const [notes, setNotes] = useState("");
  const [weight, setWeight] = useState("");
  const [airTemp, setAirTemp] = useState("");
  const [cloudiness, setCloudiness] = useState("");
  const [windSpeed, setWindSpeed] = useState("");
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchingWeather, setFetchingWeather] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setSpecies("");
      setCustomSpecies("");
      setNotes("");
      setWeight("0.5");
      setAirTemp("");
      setCloudiness("");
      setWindSpeed("");
      setPhotoPreview(null);
      setPhotoFile(null);
    }
  }, [open]);

  useEffect(() => {
    if (open && catchData?.lat && catchData?.lng) {
      setFetchingWeather(true);
      fetchWeather(catchData.lat, catchData.lng)
        .then((w) => {
          setAirTemp(String(w.air_temperature));
          setCloudiness(w.cloudiness);
          setWindSpeed(String(w.wind_speed));
        })
        .catch(() => {})
        .finally(() => setFetchingWeather(false));
    }
  }, [open, catchData]);

  const handlePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Show the local preview immediately — no network involved at all. The
    // photo itself is only compressed and written to the local pending-
    // photos gallery (see handleSave), then uploaded in the background by
    // the sync engine (src/lib/syncEngine.js) whenever the device has a
    // connection — never something the "Save" tap has to wait on.
    setPhotoPreview(URL.createObjectURL(file));
    setProcessingPhoto(true);
    try {
      const { compressImage } = await import("@/lib/imageCompression");
      setPhotoFile(await compressImage(file));
    } catch {
      setPhotoFile(file); // never lose the photo — fall back to the original
    } finally {
      setProcessingPhoto(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...catchData,
        species: species === "other" ? (customSpecies.trim() || undefined) : (species || undefined),
        notes: notes.trim() || undefined,
        weight: weight ? parseFloat(weight) : undefined,
        air_temperature: airTemp ? parseFloat(airTemp) : undefined,
        cloudiness: cloudiness || undefined,
        wind_speed: windSpeed ? parseFloat(windSpeed) : undefined,
        // photo_url intentionally left unset — the photo (if any) is saved
        // locally below, linked to the catch's id, and gets its photo_url
        // filled in once the background upload completes.
        latitude: catchData.lat != null ? catchData.lat : undefined,
        longitude: catchData.lng != null ? catchData.lng : undefined,
        date: new Date().toISOString(),
      };

      const created = onSave ? await onSave(payload) : await saveCatch(payload);

      if (photoFile && created?.id) {
        // Local write only (IndexedDB) — fast and works offline. Never
        // awaited past this point, so it can't slow down or block Save. The
        // background sync wakes up right after and picks up the upload
        // whenever there's a connection.
        savePendingPhoto(photoFile, null, created.id)
          .then(() => syncAll())
          .catch(() => {});
      }

      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  if (!catchData) return null;

  const cloudOptions = ["clear", "partly_cloudy", "cloudy", "overcast"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Fish className="w-5 h-5 text-cyan-600" /> {t("saveCatch.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-slate-50 p-2">
              <div className="text-slate-400 text-xs">{t("saveCatch.rod")}</div>
              <div className="font-semibold">{t("rod.rod")} {catchData.rod}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <div className="text-slate-400 text-xs">{t("saveCatch.fightTime")}</div>
              <div className="font-semibold">{formatDuration(catchData.duration || 0)}</div>
            </div>
            {catchData.bait && (
              <div className="rounded-lg bg-slate-50 p-2">
                <div className="text-slate-400 text-xs">{t("saveCatch.bait")}</div>
                <div className="font-semibold">{catchData.bait}</div>
              </div>
            )}
            {catchData.distance && (
              <div className="rounded-lg bg-slate-50 p-2">
                <div className="text-slate-400 text-xs">{t("saveCatch.distance")}</div>
                <div className="font-semibold">{catchData.distance}</div>
              </div>
            )}
            {catchData.location && (
              <div className="rounded-lg bg-slate-50 p-2 col-span-2">
                <div className="text-slate-400 text-xs">{t("saveCatch.location")}</div>
                <div className="font-semibold">{catchData.location}</div>
              </div>
            )}
          </div>

          {/* Photo */}
          <div className="space-y-2">
            <Label className="text-sm">{t("saveCatch.photo")}</Label>
            <button
              type="button"
              onClick={handlePhotoClick}
              className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-4 cursor-pointer hover:border-cyan-400 transition-colors w-full"
            >
              {photoPreview ? (
                <img src={photoPreview} alt="catch" className="max-h-40 rounded-lg" />
              ) : (
                <div className="text-center text-slate-400">
                  <Camera className="w-8 h-8 mx-auto mb-1" />
                  <span className="text-xs">
                    {processingPhoto ? t("saveCatch.uploading") : t("saveCatch.tapToUpload")}
                  </span>
                </div>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="absolute opacity-0 w-0 h-0 overflow-hidden"
              onChange={handlePhoto}
            />
          </div>

          {/* Weight + Species */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="weight" className="text-xs text-slate-500">
                {t("saveCatch.weight")}
              </Label>
              <Input
                id="weight"
                type="number"
                step="0.01"
                min="0"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="0.5"
                className="h-9 text-sm"
              />
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setWeight("0.2")}
                  className="flex-1 text-xs px-1.5 py-1 rounded-md bg-slate-100 hover:bg-cyan-50 text-slate-600 min-h-[36px]"
                >
                  {t("saveCatch.feederCompare")}
                </button>
                <button
                  type="button"
                  onClick={() => setWeight("1")}
                  className="flex-1 text-xs px-1.5 py-1 rounded-md bg-slate-100 hover:bg-cyan-50 text-slate-600 min-h-[36px]"
                >
                  {t("saveCatch.palmCompare")}
                </button>
                <button
                  type="button"
                  onClick={() => setWeight("0.5")}
                  className="flex-1 text-xs px-1.5 py-1 rounded-md bg-slate-100 hover:bg-cyan-50 text-slate-600 min-h-[36px]"
                >
                  {t("saveCatch.defaultWeight")}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="species" className="text-xs text-slate-500">
                {t("saveCatch.species")}
              </Label>
              <SpeciesSelector
                value={species}
                customValue={customSpecies}
                onChange={setSpecies}
                onCustomChange={setCustomSpecies}
              />
            </div>
          </div>

          {/* Weather */}
          <div className="rounded-xl bg-sky-50/50 border border-sky-100 p-3 space-y-2">
            <Label className="text-sm font-medium text-sky-700">{t("saveCatch.weather")}</Label>
            {fetchingWeather && (
              <div className="flex items-center gap-1 text-xs text-sky-500">
                <Loader2 className="w-3 h-3 animate-spin" /> {t("saveCatch.fetchingWeather")}
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-slate-500 flex items-center gap-1">
                  <Thermometer className="w-3 h-3" /> {t("saveCatch.airTemp")}
                </Label>
                <Input
                  type="number"
                  step="0.1"
                  value={airTemp}
                  onChange={(e) => setAirTemp(e.target.value)}
                  placeholder="22"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500 flex items-center gap-1">
                  <Cloud className="w-3 h-3" /> {t("saveCatch.cloudiness")}
                </Label>
                <Select value={cloudiness} onValueChange={setCloudiness}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder={t("weather.selectCloudiness")} />
                  </SelectTrigger>
                  <SelectContent>
                    {cloudOptions.map((c) => (
                      <SelectItem key={c} value={c}>{t(`cloudiness.${c}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500 flex items-center gap-1">
                  <Wind className="w-3 h-3" /> {t("saveCatch.windSpeed")}
                </Label>
                <Input
                  type="number"
                  step="0.1"
                  value={windSpeed}
                  onChange={(e) => setWindSpeed(e.target.value)}
                  placeholder="3.5"
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t("saveCatch.notes")}</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("saveCatch.notesPlaceholder")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleSave}
            disabled={saving || processingPhoto}
            className="w-full bg-cyan-600 hover:bg-cyan-700 h-11"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t("saveCatch.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}