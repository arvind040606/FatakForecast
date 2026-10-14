// =========================================================================
// FATAKFORECAST — PERSISTENT SAVED PLACES DATABASE & MANAGER
// Real JSON Persistent Database for User Saved Places (Home, College, Work, Custom)
// Zero Pre-Populated Fictional Defaults in Production Mode
// =========================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(process.env.TEMP || '/tmp', 'saved_places_db.json');

// Explicit Demo Preset Locations (Available ONLY when demoMode is explicitly active)
export const DEMO_PRESET_PLACES = [
  {
    id: 'demo_place_home',
    name: 'Home (Ranjit Avenue B-Block)',
    category: 'HOME',
    lat: 31.6540,
    lng: 74.8580,
    address: 'Ranjit Avenue, Amritsar, Punjab',
    isDemo: true,
    createdAt: '2026-10-09T00:00:00.000Z'
  },
  {
    id: 'demo_place_college',
    name: 'Guru Nanak Dev University (GNDU Campus)',
    category: 'COLLEGE',
    lat: 31.6366,
    lng: 74.8258,
    address: 'Grand Trunk Road, Kot Khalsa, Amritsar, Punjab',
    isDemo: true,
    createdAt: '2026-10-09T00:00:00.000Z'
  },
  {
    id: 'demo_place_work',
    name: 'Northern Railway Divisional Office (ASR)',
    category: 'WORK',
    lat: 31.6338,
    lng: 74.8655,
    address: 'Railway Station Road, Amritsar Junction',
    isDemo: true,
    createdAt: '2026-10-09T00:00:00.000Z'
  }
];

export class SavedPlacesManager {
  constructor() {
    this.ensureDbInitialized();
  }

  ensureDbInitialized() {
    if (!fs.existsSync(DB_FILE)) {
      // Production database starts completely empty (zero fake/pre-populated records)
      fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2), 'utf8');
    }
  }

  readAll() {
    this.ensureDbInitialized();
    try {
      const content = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(content) || [];
    } catch (err) {
      console.error('[SavedPlacesManager] Error reading DB file:', err);
      return [];
    }
  }

  writeAll(data) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('[SavedPlacesManager] Error writing DB file:', err);
    }
  }

  getPlaces(includeDemo = false) {
    const userPlaces = this.readAll();
    if (includeDemo) {
      return [...userPlaces, ...DEMO_PRESET_PLACES];
    }
    return userPlaces;
  }

  getPlaceById(id) {
    const all = this.readAll();
    return all.find(p => p.id === id) || null;
  }

  addPlace(data) {
    const { name, category, lat, lng, address } = data;

    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new Error('Valid place name is required');
    }
    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
      throw new Error('Valid numeric coordinates (lat, lng) are required');
    }

    const validCategories = ['HOME', 'COLLEGE', 'WORK', 'CUSTOM'];
    const safeCategory = validCategories.includes((category || '').toUpperCase()) 
      ? category.toUpperCase() 
      : 'CUSTOM';

    const newPlace = {
      id: `place_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: name.trim(),
      category: safeCategory,
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      address: address ? address.trim() : '',
      isDemo: false,
      createdAt: new Date().toISOString()
    };

    const current = this.readAll();
    current.push(newPlace);
    this.writeAll(current);

    return newPlace;
  }

  updatePlace(id, updates) {
    const current = this.readAll();
    const index = current.findIndex(p => p.id === id);
    if (index === -1) return null;

    const existing = current[index];
    const updated = {
      ...existing,
      name: updates.name ? updates.name.trim() : existing.name,
      category: updates.category ? updates.category.toUpperCase() : existing.category,
      lat: typeof updates.lat === 'number' ? Number(updates.lat.toFixed(6)) : existing.lat,
      lng: typeof updates.lng === 'number' ? Number(updates.lng.toFixed(6)) : existing.lng,
      address: updates.address !== undefined ? updates.address.trim() : existing.address,
      updatedAt: new Date().toISOString()
    };

    current[index] = updated;
    this.writeAll(current);
    return updated;
  }

  deletePlace(id) {
    const current = this.readAll();
    const filtered = current.filter(p => p.id !== id);
    if (filtered.length === current.length) return false;
    this.writeAll(filtered);
    return true;
  }

  clearAllPlaces() {
    this.writeAll([]);
  }
}

export const savedPlacesManager = new SavedPlacesManager();
