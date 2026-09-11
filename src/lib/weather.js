/**
 * Fetches current weather for given coordinates from Open-Meteo (free, no API key).
 * Returns { air_temperature, cloudiness, wind_speed }.
 */
export async function fetchWeather(lat, lng) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,cloud_cover,wind_speed_10m`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("weather_fetch_failed");
  const data = await res.json();
  const cur = data.current || {};
  const cloudCover = cur.cloud_cover ?? 0;
  let cloudiness = "clear";
  if (cloudCover > 75) cloudiness = "overcast";
  else if (cloudCover > 50) cloudiness = "cloudy";
  else if (cloudCover > 25) cloudiness = "partly_cloudy";
  return {
    air_temperature: Math.round((cur.temperature_2m ?? 0) * 10) / 10,
    cloudiness,
    wind_speed: Math.round((cur.wind_speed_10m ?? 0) * 10) / 10,
  };
}