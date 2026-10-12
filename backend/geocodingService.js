import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pre-curated Amritsar landmarks for 0ms instant matching
const AMRITSAR_CURATED_PLACES = [
  { name: 'Sri Harmandir Sahib (Golden Temple)', punjabi: 'ਸ੍ਰੀ ਹਰਿਮੰਦਰ ਸਾਹਿਬ', locality: 'Atta Mandi, Heritage Street, Amritsar', lat: 31.6200, lng: 74.8765, category: 'Heritage' },
  { name: 'Amritsar Junction Railway Station (ASR)', punjabi: 'ਅੰਮ੍ਰਿਤਸਰ ਜੰਕਸ਼ਨ ਰੇਲਵੇ ਸਟੇਸ਼ਨ', locality: 'Railway Road, Goal Bagh, Amritsar', lat: 31.6338, lng: 74.8655, category: 'Transit' },
  { name: 'Sri Guru Ram Dass Jee International Airport (ATQ)', punjabi: 'ਅੰਮ੍ਰਿਤਸਰ ਅੰਤਰਰਾਸ਼ਟਰੀ ਹਵਾਈ ਅੱਡਾ', locality: 'Ajnala Road, Rajasansi, Amritsar', lat: 31.7095, lng: 74.7973, category: 'Airport' },
  { name: 'Ranjit Avenue (District Shopping Complex)', punjabi: 'ਰਣਜੀਤ ਐਵੀਨਿਊ', locality: 'B-Block, Ranjit Avenue, Amritsar', lat: 31.6540, lng: 74.8580, category: 'Commercial' },
  { name: 'Guru Nanak Dev University (GNDU)', punjabi: 'ਗੁਰੂ ਨਾਨਕ ਦੇਵ ਯੂਨੀਵਰਸਿਟੀ', locality: 'Grand Trunk Road, Chheharta, Amritsar', lat: 31.6366, lng: 74.8258, category: 'Education' },
  { name: 'Putlighar Market', punjabi: 'ਪੁਤਲੀਘਰ ਮਾਰਕੀਟ', locality: 'GT Road, Putlighar, Amritsar', lat: 31.6300, lng: 74.8480, category: 'Market' },
  { name: 'Chamrang Road (East Jaura Phatak)', punjabi: 'ਚਮਰੰਗ ਰੋਡ (ਜੋੜਾ ਫਾਟਕ ਪਾਰ)', locality: 'Chamrang Road, New Amritsar', lat: 31.6330, lng: 74.9050, category: 'Residential' },
  { name: 'Vallah Sabzi Mandi', punjabi: 'ਵੱਲਾਹ ਸਬਜ਼ੀ ਮੰਡੀ', locality: 'Mehta Road, Vallah, Amritsar', lat: 31.6360, lng: 74.9120, category: 'Trade' },
  { name: 'Verka Bypass Chowk', punjabi: 'ਵੇਰਕਾ ਚੌਕ', locality: 'Batala Road - NH54 Bypass, Verka', lat: 31.6620, lng: 74.9250, category: 'Corridor' },
  { name: 'Chheharta Industrial Area', punjabi: 'ਛੇਹਰਟਾ ਇੰਡਸਟ੍ਰੀਅਲ ਏਰੀਆ', locality: 'GT Road, Chheharta, Amritsar', lat: 31.6280, lng: 74.8150, category: 'Industrial' },
  { name: 'Mall of Amritsar', punjabi: 'ਮਾਲ ਆਫ ਅੰਮ੍ਰਿਤਸਰ', locality: 'GT Road, Rajinder Nagar, Maqbool Pura', lat: 31.6247, lng: 74.9082, category: 'Commercial' },
  { name: 'Trilium Mall', punjabi: 'ਟ੍ਰਿਲੀਅਮ ਮਾਲ', locality: 'Circular Road, Basant Avenue, Amritsar', lat: 31.6512, lng: 74.8715, category: 'Commercial' },
  { name: 'Lawrence Road Market', punjabi: 'ਲਾਰੈਂਸ ਰੋਡ', locality: 'Joshi Colony, White Avenue, Amritsar', lat: 31.6445, lng: 74.8770, category: 'Commercial' },
  { name: 'Khalsa College', punjabi: 'ਖਾਲਸਾ ਕਾਲਜ', locality: 'GT Road, Amritsar', lat: 31.6385, lng: 74.8385, category: 'Education' },
  { name: 'Jallianwala Bagh', punjabi: 'ਜੱਲ੍ਹਿਆਂਵਾਲਾ ਬਾਗ਼', locality: 'Golden Temple Road, Katra Ahluwalia', lat: 31.6206, lng: 74.8801, category: 'Heritage' },
  { name: 'Durgiana Temple', punjabi: 'ਦੁਰਗਿਆਨਾ ਮੰਦਰ', locality: 'Goal Bagh, Near Railway Station, Amritsar', lat: 31.6288, lng: 74.8669, category: 'Heritage' },
  { name: 'Gobindgarh Fort', punjabi: 'ਕਿਲ੍ਹਾ ਗੋਬਿੰਦਗੜ੍ਹ', locality: 'Old Cantt Road, Vijay Chowk, Lohgarh', lat: 31.6275, lng: 74.8568, category: 'Heritage' },
  { name: 'Company Bagh (Ram Bagh)', punjabi: 'ਕੰਪਨੀ ਬਾਗ਼', locality: 'Mall Road, Amritsar', lat: 31.6398, lng: 74.8785, category: 'Park' },
  { name: 'Government Medical College (GMC)', punjabi: 'ਸਰਕਾਰੀ ਮੈਡੀਕਲ ਕਾਲਜ', locality: 'Majitha Road, Circular Road, Amritsar', lat: 31.6534, lng: 74.8856, category: 'Healthcare' },
  { name: 'Hall Gate & Hall Bazaar', punjabi: 'ਹਾਲ ਗੇਟ', locality: 'Town Hall, Hathi Gate, Amritsar', lat: 31.6305, lng: 74.8748, category: 'Market' },
  { name: 'Model Town', punjabi: 'ਮਾਡਲ ਟਾਊਨ', locality: 'GT Road, Model Town, Amritsar', lat: 31.6220, lng: 74.8390, category: 'Residential' }
];

export class GeocodingService {
  constructor() {
    this.cache = new Map();
    this.cacheTtlMs = 3600 * 1000;
    this.userAgent = 'FatakForecast-Amritsar/2.4 (https://fatakforecast.in; contact@fatakforecast.in)';
    this.lastRequestTime = 0;
    this.minIntervalMs = 1000;
    this.crossingsIndex = [];
    this.loadCrossingsIndex();
  }

  loadCrossingsIndex() {
    try {
      const crossingsFile = path.join(__dirname, 'amritsar_crossings_osm.json');
      if (fs.existsSync(crossingsFile)) {
        const raw = JSON.parse(fs.readFileSync(crossingsFile, 'utf8'));
        this.crossingsIndex = raw.map(c => ({
          name: `${c.name} (Railway Crossing)`,
          punjabi: c.punjabiName || '',
          locality: c.locality ? `${c.locality}, Amritsar` : 'Amritsar Railway Line',
          lat: c.lat,
          lng: c.lng,
          category: 'Railway Crossing',
          isCrossing: true
        }));
      }
    } catch (e) {
      console.warn('[GeocodingService] Failed to index crossings:', e.message);
    }
  }

  async throttle() {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minIntervalMs) {
      await new Promise(r => setTimeout(r, this.minIntervalMs - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Search for places using hybrid curated local index + OpenStreetMap Nominatim
   */
  async searchPlaces(query, limit = 6) {
    const trimmed = (query || '').trim();
    if (!trimmed || trimmed.length < 2) {
      return [];
    }

    const cacheKey = `search_${trimmed.toLowerCase()}_${limit}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      return cached.data;
    }

    const qLower = trimmed.toLowerCase();
    const localMatches = [];

    // 1. Search Curated Amritsar Places
    const allLocal = [...AMRITSAR_CURATED_PLACES, ...this.crossingsIndex];
    for (const item of allLocal) {
      const nameL = item.name.toLowerCase();
      const punjabiL = (item.punjabi || '').toLowerCase();
      const locL = item.locality.toLowerCase();

      let score = 0;
      if (nameL === qLower) score = 100;
      else if (nameL.startsWith(qLower)) score = 80;
      else if (nameL.includes(qLower)) score = 60;
      else if (locL.includes(qLower) || punjabiL.includes(qLower)) score = 40;

      if (score > 0) {
        localMatches.push({
          placeId: `local_${item.lat.toFixed(4)}_${item.lng.toFixed(4)}`,
          name: item.name,
          displayName: `${item.name}, ${item.locality}`,
          locality: item.locality,
          lat: item.lat,
          lng: item.lng,
          category: item.category,
          importance: score / 100,
          provider: 'FatakForecast Curated Amritsar Index'
        });
      }
    }

    localMatches.sort((a, b) => b.importance - a.importance);

    // 2. Query OSM Nominatim for broader street/address geocoding
    let nominatimResults = [];
    try {
      await this.throttle();
      const params = new URLSearchParams({
        q: trimmed.includes('Amritsar') ? trimmed : `${trimmed}, Amritsar`,
        format: 'json',
        addressdetails: '1',
        limit: String(limit),
        countrycodes: 'in'
      });

      const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept-Language': 'en-IN,en;q=0.9,pa;q=0.8'
        },
        signal: AbortSignal.timeout(4500)
      });

      if (res.ok) {
        const raw = await res.json();
        if (Array.isArray(raw)) {
          nominatimResults = raw.map(item => {
            const address = item.address || {};
            const road = address.road || address.pedestrian || address.suburb || address.neighbourhood || '';
            const city = address.city || address.town || address.village || address.state_district || 'Amritsar';
            const state = address.state || 'Punjab';

            return {
              placeId: String(item.place_id || item.osm_id),
              name: item.name || road || item.display_name.split(',')[0],
              displayName: item.display_name,
              locality: [road, city, state].filter(Boolean).join(', '),
              lat: parseFloat(item.lat),
              lng: parseFloat(item.lon),
              category: item.type || 'Location',
              importance: (item.importance || 0.4),
              provider: 'OpenStreetMap Nominatim'
            };
          });
        }
      }
    } catch (e) {
      // Graceful fallback to local matches if Nominatim fails or times out
    }

    // 3. Merge & Deduplicate (within ~150 meters)
    const combined = [...localMatches];
    for (const nom of nominatimResults) {
      const exists = combined.some(c => 
        Math.abs(c.lat - nom.lat) < 0.0015 && Math.abs(c.lng - nom.lng) < 0.0015
      );
      if (!exists) {
        combined.push(nom);
      }
    }

    const finalResults = combined.slice(0, limit);
    this.cache.set(cacheKey, { data: finalResults, timestamp: Date.now() });
    return finalResults;
  }

  /**
   * Reverse geocode coordinates to an actual address
   */
  async reverseGeocode(lat, lng) {
    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
      throw new Error('Valid numeric coordinates are required for reverse geocoding');
    }

    // Check closest local landmark or crossing (within 200m)
    const allLocal = [...AMRITSAR_CURATED_PLACES, ...this.crossingsIndex];
    for (const item of allLocal) {
      const dLat = Math.abs(item.lat - lat);
      const dLng = Math.abs(item.lng - lng);
      if (dLat < 0.0018 && dLng < 0.0018) {
        return {
          placeId: `local_rev_${lat.toFixed(4)}_${lng.toFixed(4)}`,
          name: item.name,
          displayName: `${item.name}, ${item.locality}`,
          locality: item.locality,
          lat,
          lng,
          provider: 'FatakForecast Amritsar Verified Landmark'
        };
      }
    }

    const cacheKey = `rev_${lat.toFixed(5)}_${lng.toFixed(5)}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      return cached.data;
    }

    try {
      await this.throttle();
      const params = new URLSearchParams({
        lat: String(lat),
        lon: String(lng),
        format: 'json',
        addressdetails: '1'
      });

      const url = `https://nominatim.openstreetmap.org/reverse?${params.toString()}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept-Language': 'en-IN,en;q=0.9,pa;q=0.8'
        },
        signal: AbortSignal.timeout(4000)
      });

      if (res.ok) {
        const item = await res.json();
        if (item && !item.error) {
          const address = item.address || {};
          const road = address.road || address.pedestrian || address.suburb || address.neighbourhood || '';
          const city = address.city || address.town || address.village || 'Amritsar';
          const state = address.state || 'Punjab';

          const result = {
            placeId: String(item.place_id || item.osm_id),
            displayName: item.display_name,
            name: item.name || road || 'Present Location',
            locality: [road, city, state].filter(Boolean).join(', '),
            lat,
            lng,
            provider: 'OpenStreetMap Nominatim Reverse Geocoding'
          };

          this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
          return result;
        }
      }
    } catch (e) {
      // Fallback below
    }

    return {
      placeId: `gps_${lat.toFixed(4)}_${lng.toFixed(4)}`,
      displayName: `Present Location, Amritsar (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      name: 'Present Location',
      locality: 'Amritsar, Punjab',
      lat,
      lng,
      provider: 'GPS Geolocation'
    };
  }
}

export const geocodingService = new GeocodingService();
