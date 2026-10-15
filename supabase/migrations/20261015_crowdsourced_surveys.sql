-- =========================================================================
-- FATAKFORECAST — SUPABASE MIGRATION: 20261015_crowdsourced_surveys.sql
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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

CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON public.profiles(updated_at);

CREATE TABLE IF NOT EXISTS public.crossing_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    crossing_id TEXT NOT NULL,
    crossing_name TEXT NOT NULL,
    observed_status TEXT NOT NULL CHECK (observed_status IN ('OPEN', 'CLOSED', 'TRAIN_PASSING', 'GATE_REOPENING')),
    observation_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    waiting_duration_sec INTEGER,
    notes TEXT,
    is_photo_verified BOOLEAN DEFAULT FALSE,
    photo_storage_path TEXT,
    photo_hash TEXT,
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

CREATE INDEX IF NOT EXISTS idx_reports_crossing_id ON public.crossing_reports(crossing_id);
CREATE INDEX IF NOT EXISTS idx_reports_user_id ON public.crossing_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_validation ON public.crossing_reports(validation_status);
CREATE INDEX IF NOT EXISTS idx_reports_observation_time ON public.crossing_reports(observation_time DESC);
CREATE INDEX IF NOT EXISTS idx_reports_photo_hash ON public.crossing_reports(photo_hash);

CREATE TABLE IF NOT EXISTS public.report_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES public.crossing_reports(id) ON DELETE CASCADE,
    flag_type TEXT NOT NULL,
    flag_severity TEXT NOT NULL CHECK (flag_severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flags_report_id ON public.report_flags(report_id);

CREATE TABLE IF NOT EXISTS public.report_moderation_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID REFERENCES public.crossing_reports(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    actor_id UUID,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('AUTOMATED_VALIDATOR', 'COMMUNITY_CONSENSUS', 'ADMIN')),
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mod_log_report_id ON public.report_moderation_log(report_id);
CREATE INDEX IF NOT EXISTS idx_mod_log_created_at ON public.report_moderation_log(created_at DESC);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crossing_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_moderation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are readable" ON public.profiles;
CREATE POLICY "Public profiles are readable" ON public.profiles FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "Anyone can read reports" ON public.crossing_reports;
CREATE POLICY "Anyone can read reports" ON public.crossing_reports FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Users can insert their own report" ON public.crossing_reports;
CREATE POLICY "Users can insert their own report" ON public.crossing_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own report notes" ON public.crossing_reports;
CREATE POLICY "Users can update own report notes" ON public.crossing_reports FOR UPDATE TO authenticated USING (auth.uid() = user_id AND validation_status = 'PENDING');

DROP POLICY IF EXISTS "Users can read flags for their reports" ON public.report_flags;
CREATE POLICY "Users can read flags for their reports" ON public.report_flags FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.crossing_reports r WHERE r.id = report_flags.report_id AND r.user_id = auth.uid()));

DROP POLICY IF EXISTS "Anyone can read moderation audit log" ON public.report_moderation_log;
CREATE POLICY "Anyone can read moderation audit log" ON public.report_moderation_log FOR SELECT TO authenticated, anon USING (true);
