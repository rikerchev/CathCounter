import React from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Custom fish marker icon
const fishIcon = L.divIcon({
  className: "catch-map-marker",
  html: `<div style="font-size: 28px; transform: translateY(-4px);">📍</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

export default function CatchMap({ latitude, longitude, label }) {
  if (latitude == null || longitude == null) return null;

  const lat = Number(latitude);
  const lng = Number(longitude);

  return (
    <div className="rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
      <MapContainer
        center={[lat, lng]}
        zoom={16}
        scrollWheelZoom={false}
        style={{ height: "220px", width: "100%" }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap'
        />
        <Marker position={[lat, lng]} icon={fishIcon}>
          {label && <Popup>{label}</Popup>}
        </Marker>
      </MapContainer>
      <div className="bg-slate-50 px-3 py-2 text-xs text-slate-500 font-mono">
        {lat.toFixed(6)}, {lng.toFixed(6)}
      </div>
    </div>
  );
}