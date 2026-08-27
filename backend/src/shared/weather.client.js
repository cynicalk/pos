// Open-Meteo daily weather — free, no API key. Used by the AI waste-insights
// feature to correlate waste against rainfall/temperature. Best-effort: returns
// null on any failure or when coordinates are missing, so the caller can still
// produce a (weather-free) insight.

const BASE = 'https://api.open-meteo.com/v1/forecast';

// Returns [{ date: 'YYYY-MM-DD', rain: <mm>|null, temp: <°C>|null }] or null.
async function getDailyWeather({ latitude, longitude, from, to, timezone = 'UTC' }) {
  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const params = new URLSearchParams({
    latitude:  String(lat),
    longitude: String(lng),
    start_date: from,
    end_date:   to,
    daily: 'precipitation_sum,temperature_2m_mean',
    timezone,
  });

  try {
    const res = await fetch(`${BASE}?${params}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json();
    const d = json.daily;
    if (!d?.time?.length) return null;
    return d.time.map((date, i) => ({
      date,
      rain: d.precipitation_sum?.[i] ?? null,
      temp: d.temperature_2m_mean?.[i] ?? null,
    }));
  } catch (err) {
    console.error('[weather] fetch failed:', err.message);
    return null;
  }
}

module.exports = { getDailyWeather };
