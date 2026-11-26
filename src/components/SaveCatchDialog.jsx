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
import { Camera, Fish, Loader2, Thermometer, Cloud, Wind, Gauge, Droplets, Compass } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { getWeatherForCatch, getLastKnownWeather, setManualWaterTemp } from "@/lib/weather";
import { COMPASS, nearestOctant } from "@/lib/fishActivity";
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
  const [airPressure, setAirPressure] = useState("");
  // v3.174 — water temperature (estimated or measured), wind direction (degrees of the
  // nearest of 8 compass points) and the 3 h pressure change (from the reading).
  const [waterTemp, setWaterTemp] = useState("");
  const [windDir, setWindDir] = useState("");
  const weatherExtrasRef = useRef({});
  const prefilledWaterRef = useRef("");
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
      setAirPressure("");
      setWaterTemp("");
      setWindDir("");
      weatherExtrasRef.current = {};
      prefilledWaterRef.current = "";
      setPhotoPreview(null);
      setPhotoFile(null);
    }
  }, [open]);

  // v3.171 — live weather when online; when the device is offline (or the
  // request fails / is slow) the last known reading, from the moment the device
  // was last online. Never overwrites something the user already typed.
  useEffect(() => {
    if (!open) return;
    const lat = catchData?.lat ?? null;
    const lng = catchData?.lng ?? null;
    let cancelled = false;
    setFetchingWeather(true);
    getWeatherForCatch(lat, lng)
      .then((w) => {
        if (cancelled || !w) return;
        setAirTemp((v) => v || String(w.air_temperature));
        setCloudiness((v) => v || w.cloudiness);
        setWindSpeed((v) => v || String(w.wind_speed));
        if (w.air_pressure != null) setAirPressure((v) => v || String(w.air_pressure));
        weatherExtrasRef.current = { pressure_trend: w.pressure_trend };
        if (w.water_temperature != null) {
          prefilledWaterRef.current = String(w.water_temperature);
          setWaterTemp((v) => v || String(w.water_temperature));
        }
        const oct = nearestOctant(w.wind_direction);
        if (oct != null) setWindDir((v) => v || String(oct));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setFetchingWeather(false); });
    return () => { cancelled = true; };
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
      // v3.171 — Save tapped before the weather arrived (slow/no connection):
      // use the last known reading instead of saving the catch without weather.
      let airTempV = airTemp;
      let cloudinessV = cloudiness;
      let windSpeedV = windSpeed;
      let airPressureV = airPressure;
      let waterTempV = waterTemp;
      let windDirV = windDir;
      let pressureTrendV = weatherExtrasRef.current.pressure_trend;
      if (!airTempV && !cloudinessV && !windSpeedV && !airPressureV) {
        const known = getLastKnownWeather(catchData?.lat ?? null, catchData?.lng ?? null);
        if (known) {
          airTempV = String(known.air_temperature);
          cloudinessV = known.cloudiness;
          windSpeedV = String(known.wind_speed);
          if (known.air_pressure != null) airPressureV = String(known.air_pressure);
          if (known.water_temperature != null && !waterTempV) waterTempV = String(known.water_temperature);
          if (nearestOctant(known.wind_direction) != null && !windDirV) windDirV = String(nearestOctant(known.wind_direction));
          if (pressureTrendV == null) pressureTrendV = known.pressure_trend;
        }
      }
      // a water temperature the angler typed in himself (differs from the estimate
      // that was filled in) is remembered for 12 h: it replaces the estimate in the
      // next readings and advice.
      if (waterTempV && waterTempV !== prefilledWaterRef.current && !Number.isNaN(parseFloat(waterTempV))) {
        setManualWaterTemp(parseFloat(waterTempV));
      }
      const payload = {
        ...catchData,
        species: species === "other" ? (customSpecies.trim() || undefined) : (species || undefined),
        notes: notes.trim() || undefined,
        weight: weight ? parseFloat(weight) : undefined,
        air_temperature: airTempV ? parseFloat(airTempV) : undefined,
        cloudiness: cloudinessV || undefined,
        wind_speed: windSpeedV ? parseFloat(windSpeedV) : undefined,
        air_pressure: airPressureV ? parseFloat(airPressureV) : undefined,
        water_temperature: waterTempV ? parseFloat(waterTempV) : undefined,
        wind_direction: windDirV !== "" ? parseInt(windDirV, 10) : undefined,
        pressure_trend: pressureTrendV != null ? pressureTrendV : undefined,
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
            <div className="grid grid-cols-2 gap-2">
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
              <div className="space-y-1">
                <Label className="text-xs text-slate-500 flex items-center gap-1">
                  <Gauge className="w-3 h-3" /> {t("weather.airPressure")} (hPa)
                </Label>
                <Input
                  type="number"
                  step="0.1"
                  value={airPressure}
                  onChange={(e) => setAirPressure(e.target.value)}
                  placeholder="1013"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500 flex items-center gap-1">
                  <Droplets className="w-3 h-3" /> {t("weather.waterTemp")}
                </Label>
                <Input
                  type="number"
                  step="0.5"
                  value={waterTemp}
                  onChange={(e) => setWaterTemp(e.target.value)}
                  placeholder="18"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500 flex items-center gap-1">
                  <Compass className="w-3 h-3" /> {t("weather.windDirection")}
                </Label>
                <Select value={windDir} onValueChange={setWindDir}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder={t("weather.windDirection")} />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPASS.map((k, i) => (
                      <SelectItem key={k} value={String(i * 45)}>{t(`compass.${k}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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