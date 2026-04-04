/**
 * Geocoder
 * On-demand geocoding via Nominatim (OpenStreetMap).
 * Results cached in localStorage to avoid repeated API calls.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const CACHE_KEY = 'hyperanc_geocache';
const MIN_REQUEST_INTERVAL = 1100; // ms between requests (Nominatim fair use)

let lastRequestTime = 0;

function getCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function setCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage full or unavailable
  }
}

/**
 * Clean up place name for geocoding.
 * Handles German genealogy formats like "Frankfurt/Main", "Altdamm, Kr. Randow"
 */
function cleanPlaceName(place) {
  if (!place) return '';
  let cleaned = place.trim();
  // Remove "unbekannt"
  if (cleaned.toLowerCase() === 'unbekannt') return '';
  // Replace slash with comma for better geocoding ("Frankfurt/Main" -> "Frankfurt, Main")
  cleaned = cleaned.replace(/\//g, ', ');
  // Remove "Kr." (Kreis) designations
  cleaned = cleaned.replace(/,?\s*Kr\.\s*/g, ', ');
  return cleaned;
}

/**
 * Throttle to respect Nominatim's 1 request/second policy.
 */
async function throttle() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL) {
    await new Promise(r => setTimeout(r, MIN_REQUEST_INTERVAL - elapsed));
  }
  lastRequestTime = Date.now();
}

/**
 * Geocode a place name. Returns {lat, lng} or null.
 * Checks cache first, then calls Nominatim.
 */
export async function geocode(placeName) {
  if (!placeName) return null;

  const cleaned = cleanPlaceName(placeName);
  if (!cleaned) return null;

  // Check cache
  const cache = getCache();
  if (cleaned in cache) {
    return cache[cleaned]; // may be null (cached miss)
  }

  // Try with German bias first
  let result = await _fetchNominatim(cleaned, 'de');

  // Fallback without country code for historical places (Königsberg etc.)
  if (!result) {
    result = await _fetchNominatim(cleaned, null);
  }

  // Cache result (including null for misses)
  cache[cleaned] = result;
  setCache(cache);

  return result;
}

async function _fetchNominatim(query, countryCode) {
  await throttle();

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '1'
  });
  if (countryCode) {
    params.set('countrycodes', countryCode);
  }

  try {
    const response = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'HyperAnc-Genealogy-Viewer/1.0'
      }
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        displayName: data[0].display_name
      };
    }
  } catch (err) {
    console.warn('Geocoding failed for:', query, err);
  }

  return null;
}

/**
 * Collect all place names for a person.
 * Returns array of {label, place} objects.
 */
export function collectPlaces(individual) {
  const places = [];
  if (individual.birthPlace) {
    places.push({ label: 'Geburtsort', place: individual.birthPlace, color: '#4da8da' });
  }
  if (individual.deathPlace) {
    places.push({ label: 'Sterbeort', place: individual.deathPlace, color: '#e94560' });
  }
  return places;
}
