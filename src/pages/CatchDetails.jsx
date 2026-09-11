import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Loader2, ChevronLeft, MapPin, Clock, Tag, Ruler, Weight, Fish, Trash2, Calendar, Anchor, Thermometer, Cloud, Wind, Waves, Pencil, Upload, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { useToast } from "@/components/ui/use-toast";
import { useLanguage } from "@/lib/i18n";
import CatchMap from "@/components/CatchMap";
import { getCatch, deleteCatch } from "@/lib/catchRepository";
import { getPendingPhotosByCatch, uploadPendingPhoto } from "@/lib/pendingPhotos";
import { parseCatchDate } from "@/lib/dateUtils";
import { translateSpecies } from "@/lib/speciesUtils";

const formatDuration = (s) => {
  if (!s && s !== 0) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec}s`;
};

export default function CatchDetails() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const id = new URLSearchParams(window.location.search).get("id");
  const [catchItem, setCatchItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingPhotos, setPendingPhotos] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    getCatch(id)
      .then((item) => {
        setCatchItem(item);
        getPendingPhotosByCatch(id).then(setPendingPhotos);
      })
      .catch(() => toast({ title: t("details.notFoundMsg"), variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [id, toast, t]);

  const handleUploadPending = async () => {
    setUploadingPhoto(true);
    try {
      for (const p of pendingPhotos) {
        const url = await uploadPendingPhoto(p);
        if (url) {
          setCatchItem(prev => prev ? { ...prev, photo_url: url } : prev);
        }
      }
      setPendingPhotos([]);
      toast({ title: "Снимката е качена" });
    } catch {
      toast({ title: "Грешка при качване", variant: "destructive" });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDelete = async () => {
    if (!catchItem) return;
    try {
      await deleteCatch(catchItem.id);
      toast({ title: t("details.deleted") });
      window.history.back();
    } catch {
      toast({ title: t("details.deleteFailed"), variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
      </div>
    );
  }

  if (!catchItem) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <Fish className="w-12 h-12 text-slate-200 mx-auto mb-3" />
        <p className="text-slate-400 font-medium">{t("details.notFound")}</p>
        <Link to="/catch-history" className="text-cyan-600 text-sm mt-2 inline-block hover:underline">
          {t("details.backToHistory")}
        </Link>
      </div>
    );
  }

  const formattedDate = (catchItem.date || catchItem.created_date)
    ? parseCatchDate(catchItem).toLocaleDateString(undefined, {
        weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "—";

  const InfoRow = ({ icon: Icon, label, value }) => (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-400">{label}</div>
        <div className="text-sm font-medium text-slate-700 truncate">{value}</div>
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <Link to="/catch-history" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-700">
        <ChevronLeft className="w-4 h-4" /> {t("common.back")}
      </Link>

      {catchItem.photo_url && (
        <Image src={catchItem.photo_url} alt="catch" className="w-full h-64 rounded-2xl object-cover" />
      )}
      {pendingPhotos.length > 0 && !catchItem.photo_url && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-center gap-3">
          <ImageIcon className="w-8 h-8 text-amber-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">Има снимка за качване</p>
            <p className="text-xs text-amber-600">Снимката е запазена локално и чака качване</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-amber-300 text-amber-700 hover:bg-amber-100 min-h-[44px]"
            onClick={handleUploadPending}
            disabled={uploadingPhoto}
          >
            {uploadingPhoto ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
            Качи
          </Button>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-slate-800">{translateSpecies(catchItem.species, t) || t("common.unknown")}</h1>
        <p className="text-sm text-slate-400 mt-1 flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" /> {formattedDate}
        </p>
      </div>

      <div className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
        <InfoRow icon={Clock} label={t("details.fightDuration")} value={formatDuration(catchItem.duration)} />
        <InfoRow icon={Weight} label={t("details.weight")} value={catchItem.weight ? `${catchItem.weight} kg` : "—"} />
        <InfoRow icon={Fish} label={t("details.rodModel")} value={catchItem.rod_model || "—"} />
        <InfoRow icon={Fish} label={t("details.fishingRod")} value={`${t("rod.rod")} ${catchItem.rod || 1}`} />
        <InfoRow icon={Tag} label={t("details.bait")} value={catchItem.bait || "—"} />
        <InfoRow icon={Anchor} label={t("details.hook")} value={catchItem.hook_size || "—"} />
        <InfoRow icon={Ruler} label={t("details.line")} value={catchItem.line || "—"} />
        <InfoRow icon={Waves} label={t("details.feeder")} value={catchItem.feeder || "—"} />
        <InfoRow icon={Ruler} label={t("details.castDistance")} value={catchItem.distance || "—"} />
        <InfoRow icon={MapPin} label={t("details.location")} value={catchItem.location || "—"} />
        <InfoRow icon={Thermometer} label={t("details.airTemp")} value={catchItem.air_temperature != null ? `${catchItem.air_temperature} °C` : "—"} />
        {(catchItem.latitude != null && catchItem.longitude != null) && (
          <div className="pt-3">
            <CatchMap latitude={catchItem.latitude} longitude={catchItem.longitude} label={catchItem.location} />
          </div>
        )}
        <InfoRow icon={Cloud} label={t("details.cloudiness")} value={catchItem.cloudiness ? t(`cloudiness.${catchItem.cloudiness}`) : "—"} />
        <InfoRow icon={Wind} label={t("details.windSpeed")} value={catchItem.wind_speed != null ? `${catchItem.wind_speed} m/s` : "—"} />
        {catchItem.notes && (
          <div className="pt-3">
            <div className="text-xs text-slate-400 mb-1">{t("details.notes")}</div>
            <p className="text-sm text-slate-600">{catchItem.notes}</p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Button
          variant="outline"
          className="w-full text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50 h-11"
          onClick={() => navigate(`/edit-catch?id=${catchItem.id}`)}
        >
          <Pencil className="w-4 h-4 mr-2" /> {t("details.editCatch")}
        </Button>
        <Button variant="outline" className="w-full text-rose-500 hover:text-rose-600 hover:bg-rose-50 h-11" onClick={handleDelete}>
          <Trash2 className="w-4 h-4 mr-2" /> {t("details.deleteCatch")}
        </Button>
      </div>
    </div>
  );
}