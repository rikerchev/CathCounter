import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Image } from "@/components/ui/image";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Camera, Loader2, Thermometer, Cloud, Wind, Fish, Navigation, ChevronLeft, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useLanguage } from "@/lib/i18n";
import { getCurrentLocation } from "@/lib/geolocation";
import { listBait, saveBait } from "@/lib/baitRepository";
import { getCatch, saveCatch } from "@/lib/catchRepository";
import { savePendingPhoto, getPendingPhotosByCatch, uploadPendingPhoto } from "@/lib/pendingPhotos";
import { syncAll } from "@/lib/syncEngine";
import SpeciesSelector from "@/components/SpeciesSelector";

const cloudOptions = ["clear", "partly_cloudy", "cloudy", "overcast"];
const SPECIES_LIST = ["Шаран", "Каракуда", "Амур", "Платика", "Есетра", "Сом"];

export default function EditCatch() {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  const id = new URLSearchParams(window.location.search).get("id");

  const [loading, setLoading] = useState(true);
  const [tackle, setTackle] = useState([]);
  const [rod, setRod] = useState("1");
  const [rodModel, setRodModel] = useState("");
  const [bait, setBait] = useState("");
  const [hookSize, setHookSize] = useState("");
  const [line, setLine] = useState("");
  const [feeder, setFeeder] = useState("");
  const [distance, setDistance] = useState("");
  const [location, setLocation] = useState("");
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [locating, setLocating] = useState(false);
  const [weight, setWeight] = useState("");
  const [duration, setDuration] = useState("");
  const [species, setSpecies] = useState("");
  const [customSpecies, setCustomSpecies] = useState("");
  const [airTemp, setAirTemp] = useState("");
  const [cloudiness, setCloudiness] = useState("");
  const [windSpeed, setWindSpeed] = useState("");
  const [notes, setNotes] = useState("");
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);
  const pendingPhotoIdRef = useRef(null);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    (async () => {
      try {
        const c = await getCatch(id);
        setRod(String(c.rod || 1));
        setRodModel(c.rod_model || "");
        setBait(c.bait || "");
        setHookSize(c.hook_size || "");
        setLine(c.line || "");
        setFeeder(c.feeder || "");
        setDistance(c.distance || "");
        setLocation(c.location || "");
        setLat(c.latitude ?? null);
        setLng(c.longitude ?? null);
        setWeight(c.weight != null ? String(c.weight) : "");
        setDuration(c.duration != null ? String(c.duration) : "");
        const sp = c.species || "";
        if (SPECIES_LIST.includes(sp)) {
          setSpecies(sp);
        } else if (sp) {
          setSpecies("other");
          setCustomSpecies(sp);
        }
        setAirTemp(c.air_temperature != null ? String(c.air_temperature) : "");
        setCloudiness(c.cloudiness || "");
        setWindSpeed(c.wind_speed != null ? String(c.wind_speed) : "");
        setNotes(c.notes || "");
        setPhotoUrl(c.photo_url || null);
        setPhotoPreview(c.photo_url || null);

        if (!c.photo_url) {
          // The photo may still be sitting locally, waiting for the
          // background sync to upload it (src/lib/pendingPhotos.js) — show
          // it from the local copy right away and finish the upload
          // automatically here, no extra tap needed.
          const pending = await getPendingPhotosByCatch(id);
          if (pending.length > 0) {
            setPhotoPreview(URL.createObjectURL(pending[0].blob));
            setUploading(true);
            for (const p of pending) {
              const url = await uploadPendingPhoto(p);
              if (url) {
                setPhotoUrl(url);
                setPhotoPreview(url);
              }
            }
            setUploading(false);
          }
        }
      } catch {
        toast({ title: t("editCatch.notFound"), variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [id, toast, t]);

  const loadTackle = useCallback(async () => {
    try {
      setTackle(await listBait());
    } catch {
      // non-blocking
    }
  }, []);

  useEffect(() => { loadTackle(); }, [loadTackle]);

  const baits = tackle.filter((b) => b.category === "bait" || b.category === "groundbait");
  const hooks = tackle.filter((b) => b.category === "hook");
  const lines = tackle.filter((b) => b.category === "line");
  const feeders = tackle.filter((b) => b.category === "other" || b.category === "rod");

  const handlePhotoClick = () => fileInputRef.current?.click();

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Local-first, same as logging a new catch: no network call here. The
    // photo is compressed and written straight to the local pending-photos
    // gallery, linked to this catch's id — the background sync engine
    // (src/lib/syncEngine.js) uploads it whenever the device is online, and
    // photo_url updates itself once that finishes (see updateCatchPhoto in
    // src/lib/catchRepository.js). The existing photo_url (if any) is left
    // untouched here on purpose, so nothing is lost if Save happens before
    // the new photo finishes uploading in the background.
    setPhotoPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      pendingPhotoIdRef.current = await savePendingPhoto(file, null, id);
      syncAll().catch(() => {}); // wake the background sync up sooner
    } finally {
      setUploading(false);
    }
  };

  const handleGetLocation = async () => {
    setLocating(true);
    try {
      const { name, latitude, longitude } = await getCurrentLocation(lang);
      setLocation(name);
      setLat(latitude);
      setLng(longitude);
      toast({ title: t("session.locationSet") });
    } catch (err) {
      const msg = err?.message === "not_supported"
        ? t("session.geolocationNotSupported")
        : err?.code === 1
          ? t("session.locationPermissionDenied")
          : t("session.couldNotGetLocation");
      toast({ title: msg, variant: "destructive" });
    } finally {
      setLocating(false);
    }
  };

  const handleRemovePhoto = () => {
    setPhotoPreview(null);
    setPhotoUrl(null);
    pendingPhotoIdRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const finalSpecies = species === "other" ? (customSpecies || undefined) : (species || undefined);
      const existing = await getCatch(id);
      await saveCatch({
        ...existing,
        rod: parseInt(rod),
        rod_model: rodModel || undefined,
        bait: bait || undefined,
        hook_size: hookSize || undefined,
        line: line || undefined,
        feeder: feeder || undefined,
        distance: distance || undefined,
        location: location || undefined,
        latitude: lat != null ? lat : undefined,
        longitude: lng != null ? lng : undefined,
        weight: weight ? parseFloat(weight) : undefined,
        duration: duration ? parseInt(duration) : 0,
        species: finalSpecies,
        air_temperature: airTemp ? parseFloat(airTemp) : undefined,
        cloudiness: cloudiness || undefined,
        wind_speed: windSpeed ? parseFloat(windSpeed) : undefined,
        notes: notes || undefined,
        photo_url: photoUrl || undefined,
      });
      // Photo is already linked to the catch by ID at save time — no post-hoc linking needed
      pendingPhotoIdRef.current = null;
      toast({ title: t("editCatch.saved") });
      navigate(`/catch-details?id=${id}`);
    } catch {
      toast({ title: t("editCatch.couldNotSave"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const TackleSelect = ({ label, placeholder, items, value, onChange }) => (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-sm min-h-[40px]">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {items.length > 0 ? (
            items.map((b) => (
              <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
            ))
          ) : (
            <div className="px-2 py-1.5 text-xs text-slate-400">{t("rod.noTackle")}</div>
          )}
        </SelectContent>
      </Select>
    </div>
  );

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <Link to={`/catch-details?id=${id}`} className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-700">
        <ChevronLeft className="w-4 h-4" /> {t("common.back")}
      </Link>

      <div>
        <h1 className="text-xl font-bold text-slate-800">{t("editCatch.title")}</h1>
        <p className="text-sm text-slate-400">{t("editCatch.subtitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">{t("logCatch.fishingRod")}</Label>
              <Select value={rod} onValueChange={setRod}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1,2,3,4,5,6,7,8,9,10].map((n) => (
                    <SelectItem key={n} value={String(n)}>{t("rod.rod")} {n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm flex items-center gap-1">
                <Fish className="w-3.5 h-3.5" /> {t("logCatch.rodModel")}
              </Label>
              <Input
                value={rodModel}
                onChange={(e) => setRodModel(e.target.value)}
                placeholder={t("logCatch.rodModel")}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">{t("logCatch.species")}</Label>
            <SpeciesSelector
              value={species}
              customValue={customSpecies}
              onChange={setSpecies}
              onCustomChange={setCustomSpecies}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <TackleSelect label={t("rod.bait")} placeholder={t("logCatch.selectBait")} items={baits} value={bait} onChange={setBait} />
            <TackleSelect label={t("rod.hook")} placeholder={t("rod.selectHook")} items={hooks} value={hookSize} onChange={setHookSize} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TackleSelect label={t("rod.line")} placeholder={t("rod.selectLine")} items={lines} value={line} onChange={setLine} />
            <TackleSelect label={t("rod.feeder")} placeholder={t("rod.selectFeeder")} items={feeders} value={feeder} onChange={setFeeder} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">{t("logCatch.castDistance")}</Label>
              <Input value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="30m" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">{t("logCatch.location")}</Label>
              <div className="flex gap-1">
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t("logCatch.location")} className="h-9 text-sm" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-10 flex-shrink-0"
                  onClick={handleGetLocation}
                  disabled={locating}
                >
                  {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">{t("logCatch.weight")}</Label>
              <Input type="number" step="0.01" min="0" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="2.5" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">{t("logCatch.fightDuration")}</Label>
              <Input type="number" min="0" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="45" className="h-9 text-sm" />
            </div>
          </div>

          {/* Weather */}
          <div className="rounded-xl bg-sky-50/50 border border-sky-100 p-3 space-y-2">
            <Label className="text-sm font-medium text-sky-700">{t("saveCatch.weather")}</Label>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-slate-500 flex items-center gap-1">
                  <Thermometer className="w-3 h-3" /> {t("logCatch.airTemp")}
                </Label>
                <Input type="number" step="0.1" value={airTemp} onChange={(e) => setAirTemp(e.target.value)} placeholder="22" className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500 flex items-center gap-1">
                  <Cloud className="w-3 h-3" /> {t("logCatch.cloudiness")}
                </Label>
                <Select value={cloudiness} onValueChange={setCloudiness}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={t("weather.selectCloudiness")} /></SelectTrigger>
                  <SelectContent>
                    {cloudOptions.map((c) => (
                      <SelectItem key={c} value={c}>{t(`cloudiness.${c}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500 flex items-center gap-1">
                  <Wind className="w-3 h-3" /> {t("logCatch.windSpeed")}
                </Label>
                <Input type="number" step="0.1" value={windSpeed} onChange={(e) => setWindSpeed(e.target.value)} placeholder="3.5" className="h-9 text-sm" />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">{t("logCatch.notes")}</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("saveCatch.notesPlaceholder")} className="h-9 text-sm" />
          </div>
        </div>

        {/* Photo */}
        <div className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm">{t("logCatch.photo")}</Label>
            {photoPreview && (
              <button type="button" onClick={handleRemovePhoto} className="text-xs text-rose-500 hover:text-rose-600">
                {t("common.delete")}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handlePhotoClick}
            className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-4 cursor-pointer hover:border-cyan-400 transition-colors w-full"
          >
            {photoPreview ? (
              <img src={photoPreview} alt="catch" className="max-h-48 rounded-lg" />
            ) : (
              <div className="text-center text-slate-400">
                <Camera className="w-8 h-8 mx-auto mb-1" />
                <span className="text-xs">
                  {uploading ? t("saveCatch.uploading") : t("saveCatch.tapToUpload")}
                </span>
              </div>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="absolute opacity-0 w-0 h-0 overflow-hidden"
            onChange={handlePhoto}
          />
        </div>

        <Button type="submit" disabled={saving} className="w-full bg-cyan-600 hover:bg-cyan-700 h-11">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t("editCatch.save")}
        </Button>
      </form>
    </div>
  );
}