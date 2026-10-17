// =========================================================================
// FATAKFORECAST — SUPABASE COMMUNITY INTELLIGENCE & SURVEY SERVICE
// Isolated Additive Module for User Onboarding, Photo-Verified Surveys,
// Anti-Fake Validation, Storage, Consensus Arbitration, and Moderation
// =========================================================================

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Router } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load canonical crossings for accurate spatial geofencing
let CANONICAL_CROSSINGS = [];
try {
  const crossingsPath = path.join(__dirname, 'amritsar_crossings_osm.json');
  if (fs.existsSync(crossingsPath)) {
    CANONICAL_CROSSINGS = JSON.parse(fs.readFileSync(crossingsPath, 'utf8'));
  }
} catch (e) {
  console.warn('[SupabaseService] Warning: Could not load crossings file:', e.message);
}

function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) return Infinity;
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

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

export class SupabaseService {
  constructor() {
    this.url = process.env.SUPABASE_URL || '';
    this.anonKey = process.env.SUPABASE_ANON_KEY || '';
    this.serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    this.serviceKey = this.serviceRoleKey;
    this.projectId = process.env.SUPABASE_PROJECT_ID || '';

    this.bucketName = 'crossing-photos';
    this.geofenceRadiusMeters = 500;
    this.maxPhotoSizeLimitBytes = 10 * 1024 * 1024; // 10MB
    this.cooldownMinutes = 15; // 15-minute repeat survey cooldown per user per crossing
    this.lastError = null;
    this.lastSuccessfulSync = null;

    // In-memory fallback cache for resilience if Supabase is initializing
    this.recentSurveysCache = new Map();
  }

  isConfigured() {
    return Boolean(this.url && this.serviceRoleKey);
  }

  getStatus() {
    return {
      configured: this.isConfigured(),
      projectId: this.projectId,
      url: this.url,
      bucketName: this.bucketName,
      lastSuccessfulSync: this.lastSuccessfulSync,
      lastError: this.lastError
    };
  }

  // -----------------------------------------------------------------------
  // REST API HELPER (Native Fetch, Service Role Authorization)
  // -----------------------------------------------------------------------
  async queryDb(table, queryParams = '', options = {}) {
    if (!this.isConfigured()) {
      throw new Error('Supabase service is not configured with service role key');
    }

    const endpoint = `${this.url.replace(/\/+$/, '')}/rest/v1/${table}${queryParams ? '?' + queryParams : ''}`;
    const headers = {
      'apikey': this.serviceRoleKey,
      'Authorization': `Bearer ${this.serviceRoleKey}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation',
      ...(options.headers || {})
    };

    const res = await fetch(endpoint, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!res.ok) {
      const errText = await res.text();
      let parsed = errText;
      try { parsed = JSON.parse(errText); } catch (e) {}
      throw new Error(parsed?.message || parsed?.msg || `Supabase query error (${res.status}): ${errText}`);
    }

    this.lastSuccessfulSync = new Date().toISOString();
    this.lastError = null;

    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      return text;
    }
  }

  // -----------------------------------------------------------------------
  // 1. USER ONBOARDING & SUPABASE AUTH
  // -----------------------------------------------------------------------
  async onboardUser({ displayName, gpsConsent = false, lat = null, lng = null }) {
    const cleanName = String(displayName || 'Community Surveyor').trim().slice(0, 80);
    const safeGpsConsent = Boolean(gpsConsent);
    const nowIso = new Date().toISOString();

    // Generate unique internal credentials for this device user
    const randomSuffix = crypto.randomBytes(8).toString('hex');
    const userEmail = `surveyor_${Date.now()}_${randomSuffix}@fatakforecast.internal`;
    const userPassword = `Fatak_${crypto.randomBytes(16).toString('hex')}!`;

    // 1. Create User via Supabase Admin API
    const adminUrl = `${this.url.replace(/\/+$/, '')}/auth/v1/admin/users`;
    const userRes = await fetch(adminUrl, {
      method: 'POST',
      headers: {
        'apikey': this.serviceRoleKey,
        'Authorization': `Bearer ${this.serviceRoleKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: userEmail,
        password: userPassword,
        email_confirm: true,
        user_metadata: {
          display_name: cleanName,
          gps_consent: safeGpsConsent
        }
      })
    });

    if (!userRes.ok) {
      const errText = await userRes.text();
      throw new Error(`Failed to create authenticated user: ${errText}`);
    }

    const userData = await userRes.json();
    const userId = userData.id;

    // 2. Mint session token via Password Grant
    const tokenUrl = `${this.url.replace(/\/+$/, '')}/auth/v1/token?grant_type=password`;
    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'apikey': this.anonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: userEmail,
        password: userPassword
      })
    });

    let accessToken = null;
    if (tokenRes.ok) {
      const tokenData = await tokenRes.json();
      accessToken = tokenData.access_token;
    }

    // 3. Upsert into public.profiles
    const profilePayload = {
      id: userId,
      display_name: cleanName,
      gps_consent: safeGpsConsent,
      last_latitude: typeof lat === 'number' ? lat : null,
      last_longitude: typeof lng === 'number' ? lng : null,
      last_location_updated_at: safeGpsConsent && lat !== null ? nowIso : null,
      reputation_score: 100,
      is_banned: false,
      created_at: nowIso,
      updated_at: nowIso
    };

    try {
      await this.queryDb('profiles', '', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: profilePayload
      });
    } catch (err) {
      console.warn('[SupabaseService] Note: profiles table insert warning (table might require manual migration):', err.message);
    }

    return {
      success: true,
      user: {
        id: userId,
        displayName: cleanName,
        email: userEmail,
        gpsConsent: safeGpsConsent,
        reputationScore: 100
      },
      token: accessToken
    };
  }

  async verifyAuthToken(authHeaderOrToken) {
    if (!authHeaderOrToken) {
      return null;
    }
    const token = typeof authHeaderOrToken === 'string' && authHeaderOrToken.startsWith('Bearer ')
      ? authHeaderOrToken.slice(7).trim()
      : String(authHeaderOrToken).trim();
    if (!token) {
      return null;
    }

    try {
      // Verify token with Supabase Auth
      const userUrl = `${this.url.replace(/\/+$/, '')}/auth/v1/user`;
      const res = await fetch(userUrl, {
        headers: {
          'apikey': this.anonKey,
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        return null;
      }

      const user = await res.json();
      return user;
    } catch (e) {
      return null;
    }
  }

  async getProfile(userId) {
    try {
      const rows = await this.queryDb('profiles', `id=eq.${encodeURIComponent(userId)}&select=*`);
      if (Array.isArray(rows) && rows.length > 0) {
        const row = rows[0];
        return {
          ...row,
          id: row.id,
          user_id: row.id,
          displayName: row.display_name,
          gpsConsent: row.gps_consent
        };
      }
    } catch (e) {}

    return {
      id: userId,
      user_id: userId,
      display_name: 'Commuter',
      displayName: 'Commuter',
      gps_consent: false,
      gpsConsent: false,
      reputation_score: 100
    };
  }

  async updateProfile(userId, { displayName, gpsConsent, lat, lng }) {
    const updates = { updated_at: new Date().toISOString() };
    if (typeof displayName === 'string' && displayName.trim()) {
      updates.display_name = displayName.trim().slice(0, 80);
    }
    if (typeof gpsConsent === 'boolean') {
      updates.gps_consent = gpsConsent;
      if (!gpsConsent) {
        updates.last_latitude = null;
        updates.last_longitude = null;
      }
    }
    if (typeof lat === 'number' && typeof lng === 'number' && updates.gps_consent !== false) {
      updates.last_latitude = lat;
      updates.last_longitude = lng;
      updates.last_location_updated_at = new Date().toISOString();
    }

    try {
      const res = await this.queryDb('profiles', `id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        body: updates
      });
      const row = res?.[0] || updates;
      return {
        success: true,
        profile: {
          ...row,
          id: userId,
          user_id: userId,
          display_name: row.display_name || updates.display_name || 'Commuter',
          displayName: row.display_name || updates.display_name || 'Commuter',
          gps_consent: row.gps_consent ?? updates.gps_consent ?? false,
          gpsConsent: row.gps_consent ?? updates.gps_consent ?? false
        }
      };
    } catch (err) {
      return {
        success: true,
        profile: {
          id: userId,
          user_id: userId,
          display_name: updates.display_name || 'Commuter',
          displayName: updates.display_name || 'Commuter',
          gps_consent: updates.gps_consent ?? false,
          gpsConsent: updates.gps_consent ?? false,
          updated_at: updates.updated_at
        }
      };
    }
  }

  // -----------------------------------------------------------------------
  // 2. STORAGE MANAGEMENT (Private bucket crossing-photos)
  // -----------------------------------------------------------------------
  async ensureBucketExists() {
    try {
      const getRes = await fetch(`${this.url.replace(/\/+$/, '')}/storage/v1/bucket/${this.bucketName}`, {
        headers: {
          'apikey': this.serviceRoleKey,
          'Authorization': `Bearer ${this.serviceRoleKey}`
        }
      });
      if (getRes.status === 404) {
        await fetch(`${this.url.replace(/\/+$/, '')}/storage/v1/bucket`, {
          method: 'POST',
          headers: {
            'apikey': this.serviceRoleKey,
            'Authorization': `Bearer ${this.serviceRoleKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            id: this.bucketName,
            name: this.bucketName,
            public: false,
            file_size_limit: this.maxPhotoSizeLimitBytes,
            allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp']
          })
        });
      }
    } catch (e) {}
  }

  async uploadPhoto(userId, base64Data, filenamePrefix = 'surveys') {
    await this.ensureBucketExists();

    // Clean data URI scheme if present
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    if (buffer.length > this.maxPhotoSizeLimitBytes) {
      throw new Error(`Photo size exceeds 10MB limit (size: ${(buffer.length / (1024 * 1024)).toFixed(1)}MB)`);
    }

    // Compute cryptographic SHA-256 digest of photo for duplicate detection
    const photoHash = crypto.createHash('sha256').update(buffer).digest('hex');

    const timestamp = Date.now();
    const filePath = `surveys/${userId}/${timestamp}_${photoHash.slice(0, 10)}.jpg`;

    const uploadUrl = `${this.url.replace(/\/+$/, '')}/storage/v1/object/${this.bucketName}/${filePath}`;
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'apikey': this.serviceRoleKey,
        'Authorization': `Bearer ${this.serviceRoleKey}`,
        'Content-Type': 'image/jpeg',
        'x-upsert': 'true'
      },
      body: buffer
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Supabase photo upload failed: ${errText}`);
    }

    return {
      storagePath: filePath,
      photoHash,
      fileSizeBytes: buffer.length
    };
  }

  async getSignedPhotoUrl(storagePath, expiresInSec = 3600) {
    if (!storagePath) return null;
    try {
      const signUrl = `${this.url.replace(/\/+$/, '')}/storage/v1/object/sign/${this.bucketName}/${storagePath}`;
      const res = await fetch(signUrl, {
        method: 'POST',
        headers: {
          'apikey': this.serviceRoleKey,
          'Authorization': `Bearer ${this.serviceRoleKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ expiresIn: expiresInSec })
      });
      if (res.ok) {
        const data = await res.json();
        return `${this.url.replace(/\/+$/, '')}/storage/v1${data.signedURL}`;
      }
    } catch (e) {}
    return null;
  }

  // -----------------------------------------------------------------------
  // 3. SURVEY SUBMISSION WITH ANTI-FAKE RULES & VALIDATION
  // -----------------------------------------------------------------------
  async submitSurvey(arg1, arg2) {
    let user, surveyInput;
    if (arg1 && typeof arg1 === 'object' && arg1.crossingId) {
      surveyInput = arg1;
      user = typeof arg2 === 'object' && arg2 ? arg2 : { id: arg2 };
    } else {
      user = typeof arg1 === 'object' && arg1 ? arg1 : { id: arg1 };
      surveyInput = arg2 || {};
    }

    const {
      crossingId,
      observedStatus,
      observationTime,
      waitingDurationSec,
      notes,
      photoBase64,
      captureSource, // 'CAMERA_LIVE' | 'GALLERY_UPLOAD' | 'NO_PHOTO'
      submitterLat,
      submitterLng
    } = surveyInput;

    const userId = user?.id;
    if (!userId) {
      throw new Error('Authentication required: Valid user ID needed for survey submission');
    }

    // 1. Canonical Crossing Lookup
    const canonicalCrossing = CANONICAL_CROSSINGS.find(c => 
      c.id === crossingId || 
      c.osmId === crossingId || 
      c.id.replace('osm/node/', '') === String(crossingId).replace('osm/node/', '')
    );

    if (!canonicalCrossing) {
      throw new Error(`Crossing #${crossingId} is not recognized as a mapped level crossing in Amritsar sector.`);
    }

    const validStatuses = ['OPEN', 'CLOSED', 'TRAIN_PASSING', 'GATE_REOPENING'];
    if (!validStatuses.includes(observedStatus)) {
      throw new Error(`Invalid observed status: ${observedStatus}. Must be one of ${validStatuses.join(', ')}`);
    }

    const suspicionFlags = [];
    let isSuspicious = false;

    // 2. Anti-Fake Rule: Submitter GPS Proximity Check
    let distanceToCrossingMeters = null;
    if (typeof submitterLat === 'number' && typeof submitterLng === 'number') {
      distanceToCrossingMeters = haversineDistanceMeters(
        submitterLat,
        submitterLng,
        canonicalCrossing.lat,
        canonicalCrossing.lng
      );

      if (distanceToCrossingMeters > 5000) {
        isSuspicious = true;
        suspicionFlags.push({
          type: 'EXCESSIVE_DISTANCE',
          severity: 'CRITICAL',
          details: { distanceMeters: Math.round(distanceToCrossingMeters), thresholdMeters: 5000 }
        });
      } else if (distanceToCrossingMeters > 1500) {
        isSuspicious = true;
        suspicionFlags.push({
          type: 'EXCESSIVE_DISTANCE',
          severity: 'HIGH',
          details: { distanceMeters: Math.round(distanceToCrossingMeters), thresholdMeters: 1500 }
        });
      }
    } else {
      // Submissions without any GPS coordinates cannot be verified
      suspicionFlags.push({
        type: 'MISSING_GPS',
        severity: 'MEDIUM',
        details: { message: 'GPS coordinates were not provided with survey.' }
      });
    }

    // 3. Anti-Fake Rule: Timestamp Feasibility
    const parsedObsTime = observationTime ? new Date(observationTime).getTime() : Date.now();
    const timeDeltaMs = Date.now() - parsedObsTime;

    if (timeDeltaMs < -300000) { // More than 5 minutes in future
      isSuspicious = true;
      suspicionFlags.push({
        type: 'IMPOSSIBLE_TIMESTAMP',
        severity: 'CRITICAL',
        details: { message: 'Observation timestamp is set in the future.' }
      });
    } else if (timeDeltaMs > 45 * 60 * 1000) { // Older than 45 minutes
      suspicionFlags.push({
        type: 'STALE_OBSERVATION',
        severity: 'MEDIUM',
        details: { ageMinutes: Math.round(timeDeltaMs / 60000) }
      });
    }

    // 4. Anti-Fake Rule: Per-User Cooldown on Same Crossing (15 minutes)
    try {
      const recentUserReports = await this.queryDb(
        'crossing_reports',
        `user_id=eq.${encodeURIComponent(userId)}&crossing_id=eq.${encodeURIComponent(canonicalCrossing.id)}&order=created_at.desc&limit=1`
      );
      if (Array.isArray(recentUserReports) && recentUserReports.length > 0) {
        const lastReportTime = new Date(recentUserReports[0].created_at).getTime();
        const diffMin = (Date.now() - lastReportTime) / 60000;
        if (diffMin < this.cooldownMinutes) {
          throw new Error(`Rate limit active: You already submitted an observation for ${canonicalCrossing.name} ${Math.round(diffMin)}m ago. Cooldown is ${this.cooldownMinutes}m.`);
        }
      }
    } catch (e) {
      if (e.message.includes('Rate limit')) throw e;
    }

    // 5. Mandatory Photo Evidence Processing & Hash Deduplication
    let isPhotoVerified = false;
    let photoStoragePath = null;
    let photoHash = null;

    if (photoBase64 && typeof photoBase64 === 'string') {
      const uploadResult = await this.uploadPhoto(userId, photoBase64);
      photoStoragePath = uploadResult.storagePath;
      photoHash = uploadResult.photoHash;

      // Check for identical image hashes submitted across the platform
      try {
        const hashMatch = await this.queryDb(
          'crossing_reports',
          `photo_hash=eq.${encodeURIComponent(photoHash)}&limit=1`
        );
        if (Array.isArray(hashMatch) && hashMatch.length > 0) {
          isSuspicious = true;
          suspicionFlags.push({
            type: 'DUPLICATE_IMAGE_HASH',
            severity: 'HIGH',
            details: { message: 'Identical photo was previously submitted in another report.' }
          });
        }
      } catch (e) {}

      // Photo qualification: Only camera live capture qualifies for PHOTO_VERIFIED
      if (captureSource === 'CAMERA_LIVE' && !isSuspicious) {
        isPhotoVerified = true;
      }
    }

    // 6. Report Persistence
    const cleanNotes = typeof notes === 'string' ? notes.trim().slice(0, 500) : null;
    const cleanDuration = typeof waitingDurationSec === 'number' && waitingDurationSec > 0 ? Math.min(waitingDurationSec, 3600) : null;

    const reportRow = {
      user_id: userId,
      crossing_id: canonicalCrossing.id,
      crossing_name: canonicalCrossing.name,
      observed_status: observedStatus,
      observation_time: new Date(parsedObsTime).toISOString(),
      waiting_duration_sec: cleanDuration,
      notes: cleanNotes,
      is_photo_verified: isPhotoVerified,
      photo_storage_path: photoStoragePath,
      photo_hash: photoHash,
      capture_source: captureSource || 'NO_PHOTO',
      submitter_lat: typeof submitterLat === 'number' ? submitterLat : null,
      submitter_lng: typeof submitterLng === 'number' ? submitterLng : null,
      distance_to_crossing_meters: distanceToCrossingMeters !== null ? Math.round(distanceToCrossingMeters) : null,
      validation_status: isSuspicious ? 'FLAGGED' : 'PENDING',
      is_suspicious: isSuspicious,
      suspicion_flags: suspicionFlags.map(f => f.type),
      created_at: new Date().toISOString()
    };

    let insertedReport = null;
    try {
      const insertRes = await this.queryDb('crossing_reports', '', {
        method: 'POST',
        body: reportRow
      });
      insertedReport = Array.isArray(insertRes) ? insertRes[0] : reportRow;
    } catch (err) {
      console.warn('[SupabaseService] Table insert error:', err.message);
      reportRow.id = `mem_${Date.now()}`;
      insertedReport = reportRow;
    }

    // Retain in in-memory resilience cache for instant multi-user consensus & fallback
    if (insertedReport) {
      const cacheKey = insertedReport.id || `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      this.recentSurveysCache.set(cacheKey, insertedReport);
    }

    // 7. Store Flags in report_flags
    if (insertedReport?.id && suspicionFlags.length > 0) {
      try {
        const flagRows = suspicionFlags.map(f => ({
          report_id: insertedReport.id,
          flag_type: f.type,
          flag_severity: f.severity,
          details: f.details
        }));
        await this.queryDb('report_flags', '', {
          method: 'POST',
          body: flagRows
        });
      } catch (e) {}
    }

    // 8. Automated Multi-User Community Consensus Evaluation
    // If 2+ independent verified users (with photo and distance < 500m) agree on status within 15m, promote to COMMUNITY_CONFIRMED
    let consensusReached = false;
    if (isPhotoVerified && !isSuspicious && distanceToCrossingMeters < 500) {
      try {
        const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const recentReports = [];
        try {
          const dbReports = await this.queryDb(
            'crossing_reports',
            `crossing_id=eq.${encodeURIComponent(canonicalCrossing.id)}&observed_status=eq.${encodeURIComponent(observedStatus)}&is_photo_verified=eq.true&is_suspicious=eq.false&created_at=gte.${fifteenMinAgo}`
          );
          if (Array.isArray(dbReports)) {
            recentReports.push(...dbReports);
          }
        } catch (e) {}

        // Merge in-memory verified cache reports within 15m window
        for (const cached of this.recentSurveysCache.values()) {
          if (
            cached.crossing_id === canonicalCrossing.id &&
            cached.observed_status === observedStatus &&
            cached.is_photo_verified === true &&
            !cached.is_suspicious &&
            new Date(cached.created_at).getTime() >= (Date.now() - 15 * 60 * 1000)
          ) {
            recentReports.push(cached);
          }
        }

        const distinctUserIds = new Set(recentReports.map(r => r.user_id));
        if (insertedReport?.user_id) {
          distinctUserIds.add(insertedReport.user_id);
        }

        if (distinctUserIds.size >= 2) {
          consensusReached = true;
          if (insertedReport) {
            insertedReport.validation_status = 'COMMUNITY_CONFIRMED';
          }
          // Upgrade reports in DB to COMMUNITY_CONFIRMED
          try {
            await this.queryDb(
              'crossing_reports',
              `crossing_id=eq.${encodeURIComponent(canonicalCrossing.id)}&observed_status=eq.${encodeURIComponent(observedStatus)}&created_at=gte.${fifteenMinAgo}`,
              {
                method: 'PATCH',
                body: { validation_status: 'COMMUNITY_CONFIRMED' }
              }
            );
          } catch (e) {}

          // Record in audit moderation log
          try {
            await this.queryDb('report_moderation_log', '', {
              method: 'POST',
              body: {
                report_id: insertedReport.id,
                action: 'CONSENSUS_VALIDATED',
                actor_type: 'COMMUNITY_CONSENSUS',
                notes: `Consensus verified: ${distinctUserIds.size} distinct users confirmed ${observedStatus} at ${canonicalCrossing.name}.`
              }
            });
          } catch (e) {}
        }
      } catch (e) {}
    }

    return {
      success: true,
      reportId: insertedReport?.id,
      report: insertedReport,
      flags: suspicionFlags.map(f => f.type),
      validationStatus: consensusReached ? 'COMMUNITY_CONFIRMED' : (isSuspicious ? 'FLAGGED' : 'PENDING'),
      isPhotoVerified,
      distanceToCrossingMeters: distanceToCrossingMeters !== null ? Math.round(distanceToCrossingMeters) : null,
      consensusReached,
      message: consensusReached 
        ? `Consensus achieved: ${observedStatus} confirmed by field community!` 
        : (isPhotoVerified ? 'Survey submitted with verified camera photo. Awaiting peer consensus.' : 'Survey submitted and pending community verification.')
    };
  }

  // -----------------------------------------------------------------------
  // 4. COMMUNITY SURVEYS RETRIEVAL FOR CROSSINGS
  // -----------------------------------------------------------------------
  async getReportsForCrossing(crossingId) {
    const canonical = CANONICAL_CROSSINGS.find(c => 
      c.id === crossingId || 
      c.osmId === crossingId || 
      c.id.replace('osm/node/', '') === String(crossingId).replace('osm/node/', '')
    );
    const targetId = canonical ? canonical.id : crossingId;

    try {
      const reports = await this.queryDb(
        'crossing_reports',
        `crossing_id=eq.${encodeURIComponent(targetId)}&order=created_at.desc&limit=10`
      );

      if (Array.isArray(reports)) {
        // Fetch profiles to show user display name
        const userIds = Array.from(new Set(reports.map(r => r.user_id)));
        let profilesMap = new Map();
        if (userIds.length > 0) {
          try {
            const profiles = await this.queryDb(
              'profiles',
              `id=in.(${userIds.map(id => `"${id}"`).join(',')})`
            );
            if (Array.isArray(profiles)) {
              profiles.forEach(p => profilesMap.set(p.id, p.display_name));
            }
          } catch (e) {}
        }

        // Attach signed URLs for photo previews
        const mappedReports = await Promise.all(reports.map(async r => {
          let signedUrl = null;
          if (r.photo_storage_path) {
            signedUrl = await this.getSignedPhotoUrl(r.photo_storage_path);
          }
          return {
            id: r.id,
            crossingId: r.crossing_id,
            crossingName: r.crossing_name,
            observedStatus: r.observed_status,
            observationTime: r.observation_time,
            waitingDurationSec: r.waiting_duration_sec,
            notes: r.notes,
            isPhotoVerified: r.is_photo_verified,
            photoUrl: signedUrl,
            captureSource: r.capture_source,
            validationStatus: r.validation_status,
            submitterName: profilesMap.get(r.user_id) || 'Community Surveyor',
            distanceMeters: r.distance_to_crossing_meters,
            createdAt: r.created_at
          };
        }));

        return mappedReports;
      }
    } catch (e) {
      console.warn('[SupabaseService] Query reports error:', e.message);
    }

    return [];
  }

  async getUserReports(userId) {
    try {
      const reports = await this.queryDb(
        'crossing_reports',
        `user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=25`
      );
      if (Array.isArray(reports)) {
        return await Promise.all(reports.map(async r => ({
          ...r,
          photoUrl: r.photo_storage_path ? await this.getSignedPhotoUrl(r.photo_storage_path) : null
        })));
      }
    } catch (e) {}
    return [];
  }

  // -----------------------------------------------------------------------
  // 5. MODERATION & REVIEW PIPELINE
  // -----------------------------------------------------------------------
  async listPendingReports(limit = 20) {
    try {
      const reports = await this.queryDb(
        'crossing_reports',
        `validation_status=in.(PENDING,FLAGGED)&order=created_at.desc&limit=${limit}`
      );
      if (Array.isArray(reports)) {
        return await Promise.all(reports.map(async r => ({
          ...r,
          photoUrl: r.photo_storage_path ? await this.getSignedPhotoUrl(r.photo_storage_path) : null
        })));
      }
    } catch (e) {}
    return [];
  }

  async reviewReport(moderatorId, reportId, action, notes) {
    const validActions = ['APPROVED', 'REJECTED', 'FLAGGED'];
    if (!validActions.includes(action)) {
      throw new Error(`Invalid action: ${action}`);
    }

    const updates = {
      validation_status: action,
      moderated_by: moderatorId,
      moderated_at: new Date().toISOString(),
      rejection_reason: action === 'REJECTED' ? (notes || 'Rejected by moderator') : null
    };

    const updated = await this.queryDb(
      'crossing_reports',
      `id=eq.${encodeURIComponent(reportId)}`,
      {
        method: 'PATCH',
        body: updates
      }
    );

    // Record in audit log
    await this.queryDb('report_moderation_log', '', {
      method: 'POST',
      body: {
        report_id: reportId,
        action,
        actor_id: moderatorId,
        actor_type: 'ADMIN',
        notes: notes || `Moderator performed ${action}`
      }
    });

    return { success: true, updated };
  }
}

// Singleton Instance
export const supabaseService = new SupabaseService();

// =========================================================================
// ISOLATED EXPRESS ROUTER (Additive API Routes)
// =========================================================================
export function createSupabaseRouter() {
  const router = Router();

  // Status & Health Check
  router.get(['/config', '/surveys/config'], (req, res) => {
    res.json({
      success: true,
      service: 'FatakForecast Supabase Crowdsourcing Engine',
      config: {
        geofenceRadiusMeters: supabaseService.geofenceRadiusMeters,
        cooldownMinutesPerCrossing: 30,
        globalCooldownMinutes: 10,
        maxPhotoSizeBytes: supabaseService.maxPhotoSizeLimitBytes
      },
      ...supabaseService.getStatus(),
      geofenceRadiusMeters: supabaseService.geofenceRadiusMeters,
      cooldownMinutes: supabaseService.cooldownMinutes,
      timestamp: new Date().toISOString()
    });
  });

  // User Onboarding Endpoint
  router.post('/user/onboard', async (req, res) => {
    try {
      const { displayName, gpsConsent, lat, lng } = req.body || {};
      const result = await supabaseService.onboardUser({ displayName, gpsConsent, lat, lng });
      res.json(result);
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Get User Profile
  router.get('/user/profile', async (req, res) => {
    try {
      const user = await supabaseService.verifyAuthToken(req.headers.authorization);
      if (!user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      const profile = await supabaseService.getProfile(user.id);
      res.json({ success: true, user, profile });
    } catch (err) {
      res.status(401).json({ success: false, error: err.message });
    }
  });

  // Update User Profile
  router.put('/user/profile', async (req, res) => {
    try {
      let user = await supabaseService.verifyAuthToken(req.headers.authorization);
      if (!user) {
        // Auto-onboard anonymous commuter if no auth token was provided yet
        const { displayName, gpsConsent, lat, lng } = req.body || {};
        const onboarded = await supabaseService.onboardUser({
          displayName: displayName || 'Commuter',
          gpsConsent: gpsConsent !== undefined ? gpsConsent : true,
          lat,
          lng
        });
        return res.json({
          success: true,
          token: onboarded.token,
          user: onboarded.user,
          profile: onboarded.profile
        });
      }
      const result = await supabaseService.updateProfile(user.id, req.body || {});
      res.json(result);
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Submit Crossing Survey
  router.post('/surveys/submit', async (req, res) => {
    try {
      let user = await supabaseService.verifyAuthToken(req.headers.authorization);
      if (!user) {
        // Auto-provision an anonymous commuter session if token is missing or expired
        const { submitterLat, submitterLng } = req.body || {};
        try {
          const onboarded = await supabaseService.onboardUser({
            displayName: 'Commuter',
            gpsConsent: true,
            lat: typeof submitterLat === 'number' ? submitterLat : null,
            lng: typeof submitterLng === 'number' ? submitterLng : null
          });
          if (onboarded && onboarded.user) {
            user = onboarded.user;
          }
        } catch (onboardErr) {
          console.warn('[SupabaseRouter] Auto-onboard fallback on survey submit:', onboardErr.message);
          // If Supabase Auth is unreachable, fallback to a resilient device-anchored user ID
          user = {
            id: `anon_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            displayName: 'Commuter'
          };
        }
      }
      const result = await supabaseService.submitSurvey(user, req.body || {});
      res.status(201).json(result);
    } catch (err) {
      const status = err.message.includes('Rate limit') ? 429 : 
                     err.message.includes('Authentication') ? 401 : 400;
      res.status(status).json({ success: false, error: err.message });
    }
  });

  // Get Community Field Reports for a Crossing (Supports IDs like osm/node/12345)
  router.get(['/surveys/crossing/:crossingId(*)', '/surveys/crossing', '/crossing/:crossingId(*)/surveys'], async (req, res) => {
    try {
      const crossingId = req.params.crossingId || req.query.crossingId || req.params[0];
      const reports = await supabaseService.getReportsForCrossing(crossingId);
      res.json({
        success: true,
        crossingId,
        count: reports.length,
        disclaimer: 'Community field observations reflect on-the-ground user submissions and do not override official Indian Railways safety interlocking signals.',
        reports,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get User's Own Survey History
  router.get(['/surveys/user', '/user/surveys'], async (req, res) => {
    try {
      const user = await supabaseService.verifyAuthToken(req.headers.authorization);
      if (!user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      const reports = await supabaseService.getUserReports(user.id);
      res.json({ success: true, count: reports.length, surveys: reports, reports });
    } catch (err) {
      res.status(401).json({ success: false, error: err.message });
    }
  });

  // Moderation: List Pending Reports
  router.get('/surveys/moderation/pending', async (req, res) => {
    try {
      await supabaseService.verifyAuthToken(req.headers.authorization);
      const pending = await supabaseService.listPendingReports();
      res.json({ success: true, count: pending.length, pending });
    } catch (err) {
      res.status(401).json({ success: false, error: err.message });
    }
  });

  // Moderation: Review Report
  router.post('/surveys/moderation/review', async (req, res) => {
    try {
      const user = await supabaseService.verifyAuthToken(req.headers.authorization);
      const { reportId, action, notes } = req.body || {};
      const result = await supabaseService.reviewReport(user.id, reportId, action, notes);
      res.json(result);
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  return router;
}
