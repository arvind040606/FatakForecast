// ============================================================================
// FATAKFORECAST - GOOGLE GEMINI RAILWAY INTELLIGENCE & SAFETY AUDIT SERVICE
// ============================================================================
// Purpose:
//  - Analyze validated railway data for physical & operational contradictions
//  - Explain crossing risk factors for Amritsar commuters
//  - Flag suspicious predictions, stale telemetry, or speed anomalies
//  - Strictly NEVER invents live train positions, gate states, or arrival timings
//  - Production resilience: Request timeouts, TTL cache, rate-limits, circuit breaker,
//    and high-performance deterministic fallbacks
// ============================================================================

class GeminiIntelligenceService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : null;
    this.modelName = 'gemini-1.5-flash';
    this.timeoutMs = 5000; // 5-second strict timeout
    
    // In-memory Cache: key -> { timestamp, result }
    this.cache = new Map();
    this.cacheTtlMs = 180000; // 3-minute TTL to avoid duplicate calls & unnecessary API costs
    
    // Rate Limiting (Token Bucket: max 15 requests per minute)
    this.maxRequestsPerMinute = 15;
    this.requestTimestamps = [];

    // Circuit Breaker: trips after 3 consecutive failures, cools down for 60 seconds
    this.consecutiveFailures = 0;
    this.circuitBreakerTrippedUntil = 0;
    this.circuitState = 'CLOSED'; // 'CLOSED' (normal) or 'OPEN' (tripped)
    
    // Diagnostic stats
    this.totalRequests = 0;
    this.cacheHits = 0;
    this.apiCalls = 0;
    this.fallbackCalls = 0;
    this.lastAnalysisTimestamp = null;
    this.lastError = null;
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiKey.length > 10);
  }

  getCircuitState() {
    if (Date.now() < this.circuitBreakerTrippedUntil) {
      return 'OPEN';
    }
    if (this.circuitState === 'OPEN') {
      this.circuitState = 'CLOSED';
      this.consecutiveFailures = 0;
    }
    return 'CLOSED';
  }

  recordSuccess() {
    this.consecutiveFailures = 0;
    this.circuitState = 'CLOSED';
  }

  recordFailure(errorMsg) {
    this.consecutiveFailures += 1;
    this.lastError = errorMsg;
    if (this.consecutiveFailures >= 3) {
      this.circuitState = 'OPEN';
      this.circuitBreakerTrippedUntil = Date.now() + 60000; // 60s cooldown
    }
  }

  checkRateLimit() {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter(t => now - t < 60000);
    if (this.requestTimestamps.length >= this.maxRequestsPerMinute) {
      return false; // Rate limit exceeded
    }
    this.requestTimestamps.push(now);
    return true;
  }

  getCacheKey(crossingId, status, trainCount, upcomingTrainNumber) {
    return `${crossingId}::${status}::${trainCount}::${upcomingTrainNumber || 'none'}`;
  }

  /**
   * Deterministic Rule-Based Fallback Engine
   * Validates physics, speed, track geometry, and peak windows without needing external APIs.
   */
  evaluateDeterministicIntelligence(crossing, approachingTrains = [], corridorContext = {}) {
    this.fallbackCalls += 1;
    const now = new Date();
    const currentHour = now.getHours();
    const isPeakHour = (currentHour >= 7 && currentHour <= 9) || (currentHour >= 16 && currentHour <= 20);

    const contradictions = [];
    const operationalFactors = [];
    let suspiciousPredictionFlag = false;
    let flagReason = null;

    // 1. Telemetry Freshness & Speed physics audit
    for (const item of approachingTrains) {
      const train = item.train || item;
      const speed = train.speedKmH || item.speedKmH;
      const dist = item.trackDistanceKm || train.distanceKm;

      if (typeof speed === 'number') {
        if (speed > 130) {
          contradictions.push(`Train #${train.number || train.id} reported speed ${speed} km/h exceeds maximum Northern Railway sectional speed limit (130 km/h).`);
          suspiciousPredictionFlag = true;
          flagReason = 'Super-kinematic speed anomaly';
        } else if (speed === 0 && dist > 1.0) {
          operationalFactors.push(`Train #${train.number || train.id} is stationary on corridor (${dist.toFixed(1)} km away). May be awaiting signal clear.`);
        }
      }

      if (train.dataState === 'STALE' || train.isStale) {
        contradictions.push(`Train #${train.number || train.id} telemetry feed is stale (>15 min old).`);
        suspiciousPredictionFlag = true;
        flagReason = 'Stale telemetry feed';
      }

      if (train.isStationaryAtPlatform) {
        operationalFactors.push(`Train #${train.number || train.id} is dwelling at station platform; interlocking holds road gate clear until departure.`);
      }
    }

    // 2. Risk Level Evaluation based on Genuine Road & Track Geometry
    let riskLevel = 'LOW';
    const isMultiTrain = approachingTrains.length > 1;
    const roadClass = String(crossing.roadClassification || '').toLowerCase();
    const isMajorRoad = roadClass.includes('trunk') || roadClass.includes('primary') || roadClass.includes('secondary');
    const isJauraPhatak = crossing.id?.includes('11786650965') || crossing.name?.includes('Jaura');

    if (crossing.status === 'CLOSED') {
      if (isMultiTrain || isJauraPhatak) {
        riskLevel = 'CRITICAL';
        operationalFactors.push('Multi-train transit or bottleneck corridor: high vehicular queue build-up expected.');
      } else if (isMajorRoad || isPeakHour) {
        riskLevel = 'HIGH';
        operationalFactors.push('Major urban artery closed during commuter transit hours.');
      } else {
        riskLevel = 'MODERATE';
      }
    } else if (crossing.status === 'APPROACHING') {
      riskLevel = isMajorRoad ? 'HIGH' : 'MODERATE';
      operationalFactors.push('Gate closure imminent within 2-4 minutes.');
    } else if (crossing.status === 'UNKNOWN') {
      riskLevel = 'MODERATE';
      operationalFactors.push('Gate telemetry unverified; caution advised at unprotected road-rail intersection.');
    } else {
      riskLevel = isPeakHour && isMajorRoad ? 'MODERATE' : 'LOW';
      operationalFactors.push('Roadway clear for vehicle passage.');
    }

    let recommendedAction = 'Proceed normally with road transit.';
    if (crossing.status === 'CLOSED') {
      recommendedAction = isJauraPhatak 
        ? 'Diversion strongly recommended via Bhandari Bridge / elevated bypass.'
        : 'Halt safely behind stop line. Do not attempt barrier crawl.';
    } else if (crossing.status === 'APPROACHING') {
      recommendedAction = 'Prepare to stop. Do not enter crossing area if red signals are flashing.';
    } else if (crossing.status === 'UNKNOWN') {
      recommendedAction = 'Proceed with caution. Visually check railway track before crossing.';
    }

    return {
      source: 'DETERMINISTIC_RAILWAY_RULE_ENGINE',
      contradictionDetected: contradictions.length > 0,
      contradictionDetails: contradictions.length > 0 ? contradictions.join(' ') : null,
      riskLevel,
      riskSummary: `Crossing assessed at ${riskLevel} operational risk based on permanent-way geometry, train velocity, and road classification.`,
      operationalFactors,
      suspiciousPredictionFlag,
      flagReason,
      recommendedCommuterAction: recommendedAction,
      aiConfidence: suspiciousPredictionFlag ? 'LOW' : 'HIGH',
      timestamp: now.toISOString()
    };
  }

  /**
   * Main Intelligence Method:
   * Uses Gemini Generative AI with strict validation and fallback to deterministic engine
   */
  async analyzeCrossingRisk(crossing, approachingTrains = [], corridorContext = {}) {
    this.totalRequests += 1;
    this.lastAnalysisTimestamp = new Date().toISOString();

    const cacheKey = this.getCacheKey(
      crossing.id,
      crossing.status,
      approachingTrains.length,
      approachingTrains[0]?.train?.number || approachingTrains[0]?.number
    );

    // 1. Check in-memory Cache
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < this.cacheTtlMs)) {
      this.cacheHits += 1;
      return cached.result;
    }

    // 2. Check Circuit Breaker and Configuration
    const isCircuitOpen = this.getCircuitState() === 'OPEN';
    const isReady = this.isConfigured() && !isCircuitOpen && this.checkRateLimit();

    if (!isReady) {
      const fallbackResult = this.evaluateDeterministicIntelligence(crossing, approachingTrains, corridorContext);
      this.cache.set(cacheKey, { timestamp: Date.now(), result: fallbackResult });
      return fallbackResult;
    }

    // 3. Formulate Structured Prompt for Google Gemini
    const sanitizedTelemetry = {
      crossing: {
        id: crossing.id,
        name: crossing.name,
        corridorId: crossing.corridorId,
        roadClassification: crossing.roadClassification,
        barrierType: crossing.barrierType,
        status: crossing.status,
        gateStatusClassification: crossing.gateStatusClassification,
        timeToNextClosureSec: crossing.timeToNextClosureSec,
        remainingWaitSec: crossing.remainingWaitSec,
        predictionConfidence: crossing.predictionConfidence
      },
      approachingTrains: approachingTrains.slice(0, 3).map(it => {
        const t = it.train || it;
        return {
          number: t.number || t.trainNumber,
          name: t.name || t.trainName,
          direction: t.direction,
          speedKmH: it.speedKmH || t.speedKmH,
          trackDistanceKm: it.trackDistanceKm || t.distanceKm,
          dataState: t.dataState,
          isStationary: Boolean(t.isStationaryAtPlatform || it.isStationaryAtPlatform)
        };
      }),
      corridorContext: {
        corridorName: corridorContext.name || crossing.corridorName,
        lineType: corridorContext.lineType || 'Double Broad Gauge Electrified'
      }
    };

    const promptText = `You are the safety & interlocking auditor for the Northern Railway FatakForecast platform in Amritsar, Punjab.
Analyze the following validated railway crossing telemetry data. Detect any physical, kinematic, or operational contradictions. Assess commuter risk and explain operational factors.
CRITICAL CONSTRAINT: Do NOT invent live train positions, gate states, or timing numbers. Base analysis strictly on the supplied data.

Input Telemetry JSON:
${JSON.stringify(sanitizedTelemetry, null, 2)}

Respond with STRICT JSON only matching this schema:
{
  "contradictionDetected": boolean,
  "contradictionDetails": string or null,
  "riskLevel": "LOW" | "MODERATE" | "HIGH" | "CRITICAL",
  "riskSummary": string,
  "operationalFactors": string[],
  "suspiciousPredictionFlag": boolean,
  "flagReason": string or null,
  "recommendedCommuterAction": string
}`;

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      this.apiCalls += 1;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {
            temperature: 0.1, // Near deterministic
            responseMimeType: 'application/json'
          }
        })
      });

      clearTimeout(timeoutHandle);

      if (!response.ok) {
        const errText = await response.text();
        this.recordFailure(`Gemini API HTTP ${response.status}: ${errText.slice(0, 150)}`);
        const fallbackResult = this.evaluateDeterministicIntelligence(crossing, approachingTrains, corridorContext);
        this.cache.set(cacheKey, { timestamp: Date.now(), result: fallbackResult });
        return fallbackResult;
      }

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        throw new Error('Empty Gemini response payload');
      }

      const parsed = JSON.parse(rawText);

      // Validate output fields against strict types
      const structuredResult = {
        source: 'GOOGLE_GEMINI_AI',
        contradictionDetected: Boolean(parsed.contradictionDetected),
        contradictionDetails: parsed.contradictionDetails ? String(parsed.contradictionDetails) : null,
        riskLevel: ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'].includes(parsed.riskLevel) ? parsed.riskLevel : 'MODERATE',
        riskSummary: String(parsed.riskSummary || 'Risk analyzed by Gemini AI.'),
        operationalFactors: Array.isArray(parsed.operationalFactors) ? parsed.operationalFactors.map(String) : [],
        suspiciousPredictionFlag: Boolean(parsed.suspiciousPredictionFlag),
        flagReason: parsed.flagReason ? String(parsed.flagReason) : null,
        recommendedCommuterAction: String(parsed.recommendedCommuterAction || 'Proceed according to road signals.'),
        aiConfidence: parsed.suspiciousPredictionFlag ? 'LOW' : 'HIGH',
        timestamp: new Date().toISOString()
      };

      this.recordSuccess();
      this.cache.set(cacheKey, { timestamp: Date.now(), result: structuredResult });
      return structuredResult;

    } catch (err) {
      clearTimeout(timeoutHandle);
      this.recordFailure(err.name === 'AbortError' ? 'Gemini API call timed out (5s limit)' : err.message);
      const fallbackResult = this.evaluateDeterministicIntelligence(crossing, approachingTrains, corridorContext);
      this.cache.set(cacheKey, { timestamp: Date.now(), result: fallbackResult });
      return fallbackResult;
    }
  }

  getDiagnostics() {
    return {
      isConfigured: this.isConfigured(),
      circuitState: this.getCircuitState(),
      consecutiveFailures: this.consecutiveFailures,
      totalRequests: this.totalRequests,
      cacheHits: this.cacheHits,
      cacheSize: this.cache.size,
      apiCalls: this.apiCalls,
      fallbackCalls: this.fallbackCalls,
      lastAnalysisTimestamp: this.lastAnalysisTimestamp,
      lastError: this.lastError
    };
  }
}

export const geminiIntelligenceService = new GeminiIntelligenceService();
