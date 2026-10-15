-- =========================================================================
-- FATAKFORECAST — SUPABASE PRODUCTION DATABASE SCHEMA & RLS POLICIES
-- Feature Migration: User Profiles, Community Crossing Surveys, Photo Evidence,
-- Anti-Fake Telemetry Validation, and Audit Moderation Logging
-- =========================================================================

-- Enable pgcrypto for UUIDs and cryptographic hashing if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -------------------------------------------------------------------------
-- 1. PROFILES TABLE
-- Stores onboarded user identity, GPS consent, and reputation score
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    gps_consent BOOLEAN DEFAULT FALSE,
    last_latitude DOUBLE PRECISION,
    last_longitude DOUBLE PRECISION,
    last_location_updated_at TIMESTAMPTZ,
    reputation_score INTEGER DEFAULT 100,
    is_banned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast user lookup
CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON public.profiles(updated_at);

-- -------------------------------------------------------------------------
-- 2. CROSSING_REPORTS TABLE
-- Stores crowdsourced crossing status surveys with mandatory photo evidence
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crossing_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    crossing_id TEXT NOT NULL, -- Canonical OSM crossing ID (e.g., 'osm/node/6056058178')
    crossing_name TEXT NOT NULL,
    observed_status TEXT NOT NULL CHECK (observed_status IN ('OPEN', 'CLOSED', 'TRAIN_PASSING', 'GATE_REOPENING')),
    observation_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    waiting_duration_sec INTEGER,
    notes TEXT,
    is_photo_verified BOOLEAN DEFAULT FALSE,
    photo_storage_path TEXT,
    photo_hash TEXT, -- SHA-256 digest of image for duplicate detection
    capture_source TEXT CHECK (capture_source IN ('CAMERA_LIVE', 'GALLERY_UPLOAD', 'NO_PHOTO')) DEFAULT 'NO_PHOTO',
    submitter_lat DOUBLE PRECISION,
    submitter_lng DOUBLE PRECISION,
    distance_to_crossing_meters DOUBLE PRECISION,
    validation_status TEXT DEFAULT 'PENDING' CHECK (validation_status IN ('PENDING', 'APPROVED', 'REJECTED', 'FLAGGED', 'COMMUNITY_CONFIRMED')),
    rejection_reason TEXT,
    moderated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    moderated_at TIMESTAMPTZ,
    is_suspicious BOOLEAN DEFAULT FALSE,
    suspicion_flags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices for rapid spatial, temporal, and crossing queries
CREATE INDEX IF NOT EXISTS idx_reports_crossing_id ON public.crossing_reports(crossing_id);
CREATE INDEX IF NOT EXISTS idx_reports_user_id ON public.crossing_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_validation ON public.crossing_reports(validation_status);
CREATE INDEX IF NOT EXISTS idx_reports_observation_time ON public.crossing_reports(observation_time DESC);
CREATE INDEX IF NOT EXISTS idx_reports_photo_hash ON public.crossing_reports(photo_hash);

-- -------------------------------------------------------------------------
-- 3. REPORT_FLAGS TABLE
-- Tracks automated anti-fake telemetry rules and community/admin flags
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES public.crossing_reports(id) ON DELETE CASCADE,
    flag_type TEXT NOT NULL, -- 'EXCESSIVE_DISTANCE', 'HASH_DUPLICATE', 'IMPOSSIBLE_TIMESTAMP', 'RAPID_FREQUENCY', 'CONFLICTING_OBSERVATION'
    flag_severity TEXT NOT NULL CHECK (flag_severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flags_report_id ON public.report_flags(report_id);

-- -------------------------------------------------------------------------
-- 4. REPORT_MODERATION_LOG TABLE
-- Audit log of all automated and manual survey moderation decisions
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_moderation_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID REFERENCES public.crossing_reports(id) ON DELETE SET NULL,
    action TEXT NOT NULL, -- 'APPROVED', 'REJECTED', 'FLAGGED', 'CONSENSUS_VALIDATED', 'USER_WARNED'
    actor_id UUID,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('AUTOMATED_VALIDATOR', 'COMMUNITY_CONSENSUS', 'ADMIN')),
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mod_log_report_id ON public.report_moderation_log(report_id);
CREATE INDEX IF NOT EXISTS idx_mod_log_created_at ON public.report_moderation_log(created_at DESC);

-- -------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- Strict least-privilege access model
-- -------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crossing_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_moderation_log ENABLE ROW LEVEL SECURITY;

-- PROFILES POLICIES
DROP POLICY IF EXISTS "Public profiles are readable" ON public.profiles;
CREATE POLICY "Public profiles are readable" ON public.profiles
    FOR SELECT TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = id);

-- CROSSING_REPORTS POLICIES
DROP POLICY IF EXISTS "Anyone can read reports" ON public.crossing_reports;
CREATE POLICY "Anyone can read reports" ON public.crossing_reports
    FOR SELECT TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS "Users can insert their own report" ON public.crossing_reports;
CREATE POLICY "Users can insert their own report" ON public.crossing_reports
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own report notes" ON public.crossing_reports;
CREATE POLICY "Users can update own report notes" ON public.crossing_reports
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id AND validation_status = 'PENDING');

-- REPORT_FLAGS POLICIES
DROP POLICY IF EXISTS "Users can read flags for their reports" ON public.report_flags;
CREATE POLICY "Users can read flags for their reports" ON public.report_flags
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.crossing_reports r 
        WHERE r.id = report_flags.report_id AND r.user_id = auth.uid()
    ));

-- REPORT_MODERATION_LOG POLICIES
DROP POLICY IF EXISTS "Anyone can read moderation audit log" ON public.report_moderation_log;
CREATE POLICY "Anyone can read moderation audit log" ON public.report_moderation_log
    FOR SELECT TO authenticated, anon
    USING (true);

-- -------------------------------------------------------------------------
-- 6. STORAGE BUCKET CONFIGURATION & POLICIES
-- -------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'crossing-photos',
    'crossing-photos',
    false, -- Private bucket
    10485760, -- 10MB max photo size
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS "Authenticated users can upload crossing photos" ON storage.objects;
CREATE POLICY "Authenticated users can upload crossing photos"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'crossing-photos' AND (storage.foldername(name))[1] = 'surveys');

DROP POLICY IF EXISTS "Users can view crossing photos" ON storage.objects;
CREATE POLICY "Users can view crossing photos"
    ON storage.objects FOR SELECT TO authenticated, anon
    USING (bucket_id = 'crossing-photos');
