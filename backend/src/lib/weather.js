// ============================================================
// Weather — OpenWeatherMap free tier, cache-backed.
//
// Two-step lookup:
//   1. Geocode a location string → { lat, lon }, cached forever
//      in geocoded_locations.
//   2. Fetch a 5-day / 3-hour forecast per (lat, lon), aggregated
//      into per-day summaries and cached in weather_forecast.
//
// /api/events reads from cache only (no HTTP in the request path).
// A cron job in the scheduler walks upcoming events with locations
// and populates the cache every few hours.
// ============================================================
import { query, queryOne } from '../db/index.js';

const OWM_KEY = process.env.OPENWEATHER_API_KEY;
const GEOCODE_URL = 'https://api.openweathermap.org/geo/1.0/direct';
const FORECAST_URL = 'https://api.openweathermap.org/data/2.5/forecast';

const CONDITION_PRIORITY = ['Thunderstorm', 'Snow', 'Rain', 'Drizzle', 'Clouds', 'Clear', 'Mist', 'Fog', 'Haze'];

/**
 * Look up (or geocode) a location string. Returns { lat, lon } or null.
 * Cached indefinitely — venues don't move.
 */
export async function getCoords(location) {
  if (!location) return null;
  const key = location.trim();

  const cached = await queryOne(
    'SELECT lat, lon FROM geocoded_locations WHERE location = $1',
    [key],
  );
  if (cached) {
    if (cached.lat == null || cached.lon == null) return null;   // cached miss
    return { lat: Number(cached.lat), lon: Number(cached.lon) };
  }

  if (!OWM_KEY) return null;

  try {
    const url = `${GEOCODE_URL}?q=${encodeURIComponent(location)}&limit=1&appid=${OWM_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[weather] geocode ${res.status} for "${key}"`);
      return null;
    }
    const data = await res.json();
    if (!data.length) {
      // Cache the miss so we don't re-hit the API on every event refresh
      await query(
        'INSERT INTO geocoded_locations (location, lat, lon) VALUES ($1, NULL, NULL) ON CONFLICT DO NOTHING',
        [key],
      );
      return null;
    }
    const { lat, lon, name } = data[0];
    await query(
      `INSERT INTO geocoded_locations (location, lat, lon, formatted_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (location) DO UPDATE
         SET lat = $2, lon = $3, formatted_name = $4, geocoded_at = NOW()`,
      [key, lat, lon, name],
    );
    return { lat, lon };
  } catch (err) {
    console.error(`[weather] geocode error for "${key}":`, err.message);
    return null;
  }
}

/**
 * Fetch the 5-day/3-hour forecast for coords, aggregate per day,
 * and upsert each day into weather_forecast.
 */
export async function refreshForecast(location, coords) {
  if (!OWM_KEY || !coords) return 0;
  const key = location.trim();

  try {
    const url = `${FORECAST_URL}?lat=${coords.lat}&lon=${coords.lon}&units=imperial&appid=${OWM_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[weather] forecast ${res.status} for "${key}"`);
      return 0;
    }
    const data = await res.json();

    // Aggregate 3-hour buckets → per-day summary
    const byDay = {};
    for (const bucket of data.list || []) {
      const date = new Date(bucket.dt * 1000).toISOString().slice(0, 10);
      if (!byDay[date]) {
        byDay[date] = { temps: [], conditions: [], icons: [], precips: [], winds: [] };
      }
      byDay[date].temps.push(bucket.main?.temp);
      byDay[date].conditions.push(bucket.weather?.[0]?.main);
      byDay[date].icons.push(bucket.weather?.[0]?.icon);
      byDay[date].precips.push((bucket.pop || 0) * 100);
      byDay[date].winds.push(bucket.wind?.speed || 0);
    }

    let count = 0;
    for (const [date, agg] of Object.entries(byDay)) {
      const validTemps = agg.temps.filter(t => t != null);
      if (validTemps.length === 0) continue;
      const temp_high_f = Math.round(Math.max(...validTemps));
      const temp_low_f  = Math.round(Math.min(...validTemps));
      // "Worst" condition of the day wins the day's icon (thunder > rain > clouds > clear)
      const condition = CONDITION_PRIORITY.find(c => agg.conditions.includes(c)) || agg.conditions[0];
      const iconIdx = agg.conditions.indexOf(condition);
      const condition_icon = agg.icons[iconIdx] || null;
      const precip_pct = Math.round(Math.max(...agg.precips));
      const wind_mph   = Math.round(Math.max(...agg.winds));

      await query(
        `INSERT INTO weather_forecast
           (location, forecast_date, temp_high_f, temp_low_f, condition, condition_icon, precip_pct, wind_mph, fetched_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (location, forecast_date) DO UPDATE
           SET temp_high_f = $3, temp_low_f = $4, condition = $5,
               condition_icon = $6, precip_pct = $7, wind_mph = $8, fetched_at = NOW()`,
        [key, date, temp_high_f, temp_low_f, condition, condition_icon, precip_pct, wind_mph],
      );
      count++;
    }
    return count;
  } catch (err) {
    console.error(`[weather] forecast error for "${key}":`, err.message);
    return 0;
  }
}

/**
 * Walk every distinct location on an upcoming event and populate cache.
 * Called by the scheduler cron every few hours. Idempotent + resumable.
 */
export async function refreshAllWeather() {
  if (!OWM_KEY) return { skipped: true, reason: 'no OPENWEATHER_API_KEY' };

  const locations = await query(
    `SELECT DISTINCT location FROM events
     WHERE location IS NOT NULL AND location != ''
       AND starts_at BETWEEN NOW() AND NOW() + INTERVAL '5 days'`,
  );

  let locationsRefreshed = 0;
  let daysCached = 0;
  for (const row of locations) {
    const coords = await getCoords(row.location);
    if (!coords) continue;
    const n = await refreshForecast(row.location, coords);
    if (n > 0) {
      locationsRefreshed++;
      daysCached += n;
    }
  }

  return { locationsRefreshed, totalLocations: locations.length, daysCached };
}

/**
 * Attach cached weather to a list of events. Single batched query — no
 * per-event round trips. Returns a new array; input untouched.
 */
export async function attachWeather(events) {
  const locations = [...new Set(
    events.filter(e => e.location).map(e => e.location.trim())
  )];
  if (locations.length === 0) return events;

  const rows = await query(
    `SELECT location, forecast_date, temp_high_f, temp_low_f, condition, condition_icon, precip_pct, wind_mph
     FROM weather_forecast
     WHERE location = ANY($1)`,
    [locations],
  );

  const byLocDate = {};
  for (const r of rows) {
    const dateStr = r.forecast_date instanceof Date
      ? r.forecast_date.toISOString().slice(0, 10)
      : String(r.forecast_date);
    if (!byLocDate[r.location]) byLocDate[r.location] = {};
    byLocDate[r.location][dateStr] = {
      temp_high_f: r.temp_high_f,
      temp_low_f:  r.temp_low_f,
      condition:   r.condition,
      icon:        conditionEmoji(r.condition),
      precip_pct:  r.precip_pct,
      wind_mph:    r.wind_mph,
    };
  }

  return events.map(e => {
    if (!e.location) return e;
    const dateStr = new Date(e.starts_at).toISOString().slice(0, 10);
    const w = byLocDate[e.location.trim()]?.[dateStr];
    return { ...e, weather: w || null };
  });
}

/**
 * Small emoji for a condition string — used as a compact chip on the card.
 * Returns null for unknown conditions so the UI can fall back cleanly.
 */
export function conditionEmoji(condition) {
  switch (condition) {
    case 'Clear':        return '☀️';
    case 'Clouds':       return '⛅';
    case 'Rain':
    case 'Drizzle':      return '🌧️';
    case 'Thunderstorm': return '⛈️';
    case 'Snow':         return '🌨️';
    case 'Mist':
    case 'Fog':
    case 'Haze':         return '🌫️';
    default:             return null;
  }
}
