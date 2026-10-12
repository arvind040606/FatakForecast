import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function ensureEnvLoaded() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [k, ...v] = trimmed.split('=');
        if (k && v.length && !process.env[k.trim()]) {
          process.env[k.trim()] = v.join('=').trim();
        }
      }
    });
  }
}
ensureEnvLoaded();

export class IpstackService {
  constructor() {
    this.apiKey = process.env.IPSTACK_API_KEY || null;
    this.apiBase = 'http://api.ipstack.com';
    this.cache = new Map();
    this.cacheTtlMs = 24 * 60 * 60 * 1000; // 24-hour cache for IP lookups
    this.lastQueryTime = null;
    this.lastStatus = 'INITIALIZING';
    this.lastError = null;
  }

  isConfigured() {
    return Boolean(this.getApiKey());
  }

  getApiKey() {
    ensureEnvLoaded();
    if (!this.apiKey && process.env.IPSTACK_API_KEY) {
      this.apiKey = process.env.IPSTACK_API_KEY;
    }
    return this.apiKey;
  }

  getMaskedKey() {
    const key = this.getApiKey();
    if (!key) return 'NOT_CONFIGURED';
    if (key.length <= 8) return '****';
    return `${key.substring(0, 4)}****${key.substring(key.length - 4)}`;
  }

  /**
   * Determine if IP address is local / loopback / private
   */
  isPrivateOrLoopbackIp(ip) {
    if (!ip) return true;
    const clean = ip.replace(/^::ffff:/, '').trim();
    if (clean === '127.0.0.1' || clean === '::1' || clean === 'localhost') return true;
    if (clean.startsWith('10.') || clean.startsWith('192.168.') || clean.startsWith('172.16.')) return true;
    return false;
  }

  /**
   * Fetch geolocation for a given IP or the caller's public IP
   */
  async lookupIp(ip) {
    const key = this.getApiKey();
    if (!key) {
      this.lastStatus = 'UNCONFIGURED';
      this.lastError = 'IPstack API key not configured in server environment.';
      throw new Error(this.lastError);
    }

    const cleanIp = (ip || '').replace(/^::ffff:/, '').trim();
    const isLocal = this.isPrivateOrLoopbackIp(cleanIp);
    const targetQuery = isLocal ? 'check' : cleanIp;
    const cacheKey = `ip_${targetQuery}`;

    // 1. Check in-memory cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      return { ...cached.data, cached: true };
    }

    // 2. Query IPstack HTTP endpoint
    const url = `${this.apiBase}/${targetQuery}?access_key=${key}`;
    const startTime = Date.now();

    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(6000),
        headers: { 'User-Agent': 'FatakForecast-Backend/2.4' }
      });

      this.lastQueryTime = new Date().toISOString();

      if (!res.ok) {
        throw new Error(`IPstack service returned HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();

      // IPstack returns error object on API level failures
      if (data.error) {
        this.lastStatus = 'ERROR';
        this.lastError = data.error.info || `IPstack Error Code ${data.error.code}`;
        throw new Error(`IPstack Error: ${this.lastError}`);
      }

      if (typeof data.latitude !== 'number' || typeof data.longitude !== 'number') {
        throw new Error('IPstack response did not contain numeric coordinates');
      }

      this.lastStatus = 'CONNECTED';
      this.lastError = null;

      const formatted = {
        success: true,
        ip: data.ip,
        type: data.type || 'ipv4',
        city: data.city || 'Unknown',
        region: data.region_name || data.region_code || 'Unknown',
        regionCode: data.region_code || '',
        country: data.country_name || 'India',
        countryCode: data.country_code || 'IN',
        zip: data.zip || '',
        lat: Number(data.latitude.toFixed(6)),
        lng: Number(data.longitude.toFixed(6)),
        accuracy: 'APPROXIMATE_IP',
        isApproximate: true,
        accuracyNote: 'Location estimated from network IP routing. Use device GPS for precise navigation.',
        provider: 'IPstack Geolocation API',
        latencyMs: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };

      this.cache.set(cacheKey, { data: formatted, timestamp: Date.now() });
      return { ...formatted, cached: false };
    } catch (err) {
      this.lastStatus = 'ERROR';
      this.lastError = err.message;
      throw err;
    }
  }

  getStatus() {
    return {
      provider: 'IPstack Geolocation API',
      configured: Boolean(this.getApiKey()),
      maskedKey: this.getMaskedKey(),
      status: this.lastStatus,
      lastQueryTime: this.lastQueryTime,
      lastError: this.lastError,
      cachedEntriesCount: this.cache.size
    };
  }
}

export const ipstackService = new IpstackService();
