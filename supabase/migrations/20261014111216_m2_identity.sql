-- ============================================================================
-- MINDX LEARN — M2 Identity, Classes, PIN, Auth & RLS Migration (A3 Focused)
-- Target: Supabase PostgreSQL (TEST)
-- Migration: 20261014111216_m2_identity.sql
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. PRIVATE SCHEMA FOR INTERNAL CREDENTIALS, RATE LIMITS, CHALLENGES & CLAIMS
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

-- 1.1 Private Settings (stores high-entropy BFF secret SHA-256 digest)
CREATE TABLE IF NOT EXISTS private.settings (
    key TEXT PRIMARY KEY,
    value_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE private.settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE private.settings TO service_role;

-- 1.2 Actor Auth Mapping: maps native auth.users.id (UUID) to public profile UUID
CREATE TABLE IF NOT EXISTS private.actor_auth (
    auth_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
    auth_email TEXT NOT NULL,
    session_version INT NOT NULL DEFAULT 1,
    invite_pending BOOLEAN NOT NULL DEFAULT false,
    invite_issued_at TIMESTAMPTZ,
    invite_claimed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_actor_auth_profile_id UNIQUE (profile_id)
);
REVOKE ALL ON TABLE private.actor_auth FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE private.actor_auth TO service_role;

-- 1.3 Login Challenges: unpredictable UUID, 60s short TTL, single-use atomic consume
CREATE TABLE IF NOT EXISTS private.login_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    student_code_hash TEXT NOT NULL,
    ip_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE private.login_challenges FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE private.login_challenges TO service_role;
CREATE INDEX IF NOT EXISTS idx_login_challenges_lookup 
    ON private.login_challenges(id, ip_hash) 
    WHERE consumed_at IS NULL;

-- 1.4 Login Rate Limits: key is hashed, no raw pupil code or raw email stored
CREATE TABLE IF NOT EXISTS private.login_rate_limits (
    key TEXT PRIMARY KEY,
    attempts INT NOT NULL DEFAULT 0,
    first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    cooldown_until TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE private.login_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE private.login_rate_limits TO service_role;

-- 1.5 PIN Operations: atomic row-locked claim with canonical class lock and target list
CREATE TABLE IF NOT EXISTS private.pin_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_profile_id UUID NOT NULL,
    class_id UUID NOT NULL,
    student_id UUID,
    operation_type TEXT NOT NULL CHECK (operation_type IN ('batch_first_issue', 'single_reissue')),
    target_students JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'committing', 'completed', 'failed')),
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ
);
REVOKE ALL ON TABLE private.pin_operations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE private.pin_operations TO service_role;

-- 1.6 Staff Recovery & Setup Tickets: one-use server tickets bound to auth_user_id & native session
CREATE TABLE IF NOT EXISTS private.staff_recovery_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id UUID NOT NULL,
    session_version INT NOT NULL,
    ticket_type TEXT NOT NULL CHECK (ticket_type IN ('invite', 'recovery')),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE private.staff_recovery_tickets FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE private.staff_recovery_tickets TO service_role;

-- ============================================================================
-- 2. PUBLIC DOMAIN TABLES
-- ============================================================================

-- 2.1 Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
    full_name TEXT NOT NULL,
    email TEXT,
    student_code TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    session_version INT NOT NULL DEFAULT 1,
    is_fixture BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE private.actor_auth
    DROP CONSTRAINT IF EXISTS fk_actor_auth_profile,
    ADD CONSTRAINT fk_actor_auth_profile 
    FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2.2 Classes
CREATE TABLE IF NOT EXISTS public.classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    course_id UUID,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'completed')),
    is_14_sessions_confirmed BOOLEAN NOT NULL DEFAULT false,
    is_fixture BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.3 Class Teachers
CREATE TABLE IF NOT EXISTS public.class_teachers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    teacher_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_class_teacher UNIQUE (class_id, teacher_profile_id)
);

-- 2.4 Students (Active or Transferred have active access; Archived blocks access)
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    participant_id TEXT NOT NULL UNIQUE,
    student_code TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    current_class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
    original_class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
    pin_issued_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'transferred', 'archived')),
    notes TEXT,
    is_fixture BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_students_current_class ON public.students(current_class_id);
CREATE INDEX IF NOT EXISTS idx_class_teachers_teacher ON public.class_teachers(teacher_profile_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role_status ON public.profiles(role, status);

-- ============================================================================
-- 3. PUBLIC SERVICE_ROLE-ONLY RPC WRAPPERS (SECURITY DEFINER, PINNED SEARCH_PATH)
-- ============================================================================

-- 3.1 Verify BFF Secret
CREATE OR REPLACE FUNCTION public.m2_verify_bff_secret(p_secret_sha256 TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
    v_stored_hash TEXT;
BEGIN
    IF p_secret_sha256 IS NULL OR length(p_secret_sha256) < 64 THEN
        RETURN FALSE;
    END IF;

    SELECT value_hash INTO v_stored_hash
    FROM private.settings
    WHERE key = 'bff_secret_sha256';

    IF v_stored_hash IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN (v_stored_hash = lower(trim(p_secret_sha256)));
END;
$$;
REVOKE ALL ON FUNCTION public.m2_verify_bff_secret(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m2_verify_bff_secret(TEXT) TO service_role;

-- 3.2 Verify Actor Session against Native auth.sessions, Version, and Class Status
-- Supports active AND transferred students; only archived blocks.
CREATE OR REPLACE FUNCTION public.m2_verify_actor_session(
    p_auth_user_id UUID,
    p_session_id UUID,
    p_expected_version INT DEFAULT NULL
)
RETURNS TABLE (
    valid BOOLEAN,
    profile_id UUID,
    role TEXT,
    auth_email TEXT,
    session_version INT,
    status TEXT,
    class_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, pg_catalog
AS $$
DECLARE
    v_session_exists BOOLEAN;
    v_mapping RECORD;
    v_profile RECORD;
    v_student RECORD;
    v_class RECORD;
BEGIN
    -- 1. Check native auth.sessions existence
    SELECT EXISTS (
        SELECT 1 FROM auth.sessions s
        WHERE s.id = p_session_id
          AND s.user_id = p_auth_user_id
          AND (s.not_after IS NULL OR s.not_after > now())
    ) INTO v_session_exists;

    IF NOT v_session_exists THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::INT, NULL::TEXT, NULL::TEXT;
        RETURN;
    END IF;

    -- 2. Lookup mapping
    SELECT a.profile_id, a.role, a.auth_email, a.session_version
    INTO v_mapping
    FROM private.actor_auth a
    WHERE a.auth_user_id = p_auth_user_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::INT, NULL::TEXT, NULL::TEXT;
        RETURN;
    END IF;

    -- 3. Lookup profile
    SELECT p.id, p.role, p.status, p.session_version
    INTO v_profile
    FROM public.profiles p
    WHERE p.id = v_mapping.profile_id;

    IF NOT FOUND OR v_profile.status <> 'active' THEN
        RETURN QUERY SELECT FALSE, v_mapping.profile_id, v_mapping.role, v_mapping.auth_email, v_mapping.session_version, 'inactive'::TEXT, NULL::TEXT;
        RETURN;
    END IF;

    -- 4. Check version
    IF v_profile.session_version <> v_mapping.session_version THEN
        RETURN QUERY SELECT FALSE, v_profile.id, v_profile.role, v_mapping.auth_email, v_profile.session_version, 'revoked'::TEXT, NULL::TEXT;
        RETURN;
    END IF;

    IF p_expected_version IS NOT NULL AND p_expected_version <> v_profile.session_version THEN
        RETURN QUERY SELECT FALSE, v_profile.id, v_profile.role, v_mapping.auth_email, v_profile.session_version, 'revoked'::TEXT, NULL::TEXT;
        RETURN;
    END IF;

    -- 5. Student access check (active OR transferred)
    IF v_profile.role = 'student' THEN
        SELECT s.current_class_id, s.status INTO v_student
        FROM public.students s
        WHERE s.id = v_profile.id;

        IF NOT FOUND OR v_student.status NOT IN ('active', 'transferred') THEN
            RETURN QUERY SELECT FALSE, v_profile.id, v_profile.role, v_mapping.auth_email, v_profile.session_version, 'inactive'::TEXT, NULL::TEXT;
            RETURN;
        END IF;

        SELECT c.status INTO v_class
        FROM public.classes c
        WHERE c.id = v_student.current_class_id;

        IF NOT FOUND OR v_class.status <> 'active' THEN
            RETURN QUERY SELECT FALSE, v_profile.id, v_profile.role, v_mapping.auth_email, v_profile.session_version, v_profile.status, 'archived'::TEXT;
            RETURN;
        END IF;

        RETURN QUERY SELECT TRUE, v_profile.id, v_profile.role, v_mapping.auth_email, v_profile.session_version, v_profile.status, 'active'::TEXT;
        RETURN;
    END IF;

    RETURN QUERY SELECT TRUE, v_profile.id, v_profile.role, v_mapping.auth_email, v_profile.session_version, v_profile.status, 'active'::TEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.m2_verify_actor_session(UUID, UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m2_verify_actor_session(UUID, UUID, INT) TO service_role;

-- 3.3 Atomic Rate Limiting
CREATE OR REPLACE FUNCTION public.m2_check_rate_limit(
    p_key_hash TEXT,
    p_max_attempts INT,
    p_window_seconds INT,
    p_cooldown_seconds INT
)
RETURNS TABLE (allowed BOOLEAN, retry_after INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
    v_now TIMESTAMPTZ := now();
    v_row private.login_rate_limits%ROWTYPE;
    v_window INTERVAL := (p_window_seconds || ' seconds')::INTERVAL;
    v_cooldown INTERVAL := (p_cooldown_seconds || ' seconds')::INTERVAL;
BEGIN
    INSERT INTO private.login_rate_limits (key, attempts, first_attempt_at, cooldown_until, updated_at)
    VALUES (p_key_hash, 0, v_now, NULL, v_now)
    ON CONFLICT (key) DO NOTHING;

    SELECT * INTO v_row
    FROM private.login_rate_limits
    WHERE key = p_key_hash
    FOR UPDATE;

    IF v_row.cooldown_until IS NOT NULL AND v_row.cooldown_until > v_now THEN
        RETURN QUERY SELECT FALSE, EXTRACT(EPOCH FROM (v_row.cooldown_until - v_now))::INT;
        RETURN;
    END IF;

    IF (v_now - v_row.first_attempt_at) > v_window THEN
        UPDATE private.login_rate_limits
        SET attempts = 1,
            first_attempt_at = v_now,
            cooldown_until = NULL,
            updated_at = v_now
        WHERE key = p_key_hash;
        RETURN QUERY SELECT TRUE, 0;
        RETURN;
    END IF;

    IF (v_row.attempts + 1) > p_max_attempts THEN
        UPDATE private.login_rate_limits
        SET attempts = v_row.attempts + 1,
            cooldown_until = v_now + v_cooldown,
            updated_at = v_now
        WHERE key = p_key_hash;
        RETURN QUERY SELECT FALSE, p_cooldown_seconds;
        RETURN;
    ELSE
        UPDATE private.login_rate_limits
        SET attempts = v_row.attempts + 1,
            updated_at = v_now
        WHERE key = p_key_hash;
        RETURN QUERY SELECT TRUE, 0;
        RETURN;
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.m2_check_rate_limit(TEXT, INT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m2_check_rate_limit(TEXT, INT, INT, INT) TO service_role;

-- 3.4 Get Student For Login Prepare (Active or Transferred)
CREATE OR REPLACE FUNCTION public.m2_get_student_for_prepare(
    p_student_code TEXT
)
RETURNS TABLE (
    profile_id UUID,
    auth_user_id UUID,
    auth_email TEXT,
    pin_issued_at TIMESTAMPTZ,
    status TEXT,
    session_version INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id AS profile_id,
        a.auth_user_id,
        a.auth_email,
        s.pin_issued_at,
        s.status,
        p.session_version
    FROM public.students s
    JOIN public.profiles p ON p.id = s.id
    LEFT JOIN private.actor_auth a ON a.profile_id = s.id
    WHERE s.student_code = upper(trim(p_student_code))
      AND s.status IN ('active', 'transferred')
      AND p.status = 'active';
END;
$$;
REVOKE ALL ON FUNCTION public.m2_get_student_for_prepare(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m2_get_student_for_prepare(TEXT) TO service_role;

-- 3.5 Create Student Challenge
CREATE OR REPLACE FUNCTION public.m2_create_student_challenge(
    p_auth_user_id UUID,
    p_student_code_hash TEXT,
    p_ip_hash TEXT,
    p_ttl_seconds INT DEFAULT 60
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
    v_id UUID := gen_random_uuid();
    v_expires TIMESTAMPTZ := now() + (p_ttl_seconds || ' seconds')::INTERVAL;
BEGIN
    INSERT INTO private.login_challenges (id, auth_user_id, student_code_hash, ip_hash, expires_at)
    VALUES (v_id, p_auth_user_id, p_student_code_hash, p_ip_hash, v_expires);
    RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.m2_create_student_challenge(UUID, TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m2_create_student_challenge(UUID, TEXT, TEXT, INT) TO service_role;

-- 3.6 Consume Student Challenge
CREATE OR REPLACE FUNCTION public.m2_consume_student_challenge(
    p_challenge_id UUID,
    p_ip_hash TEXT
)
RETURNS TABLE (valid BOOLEAN, auth_user_id UUID, student_code_hash TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
    v_row private.login_challenges%ROWTYPE;
BEGIN
    SELECT * INTO v_row
    FROM private.login_challenges
    WHERE id = p_challenge_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT;
        RETURN;
    END IF;

    IF v_row.consumed_at IS NOT NULL OR v_row.expires_at <= now() OR v_row.ip_hash <> p_ip_hash THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT;
        RETURN;
    END IF;

    UPDATE private.login_challenges
    SET consumed_at = now()
    WHERE id = p_challenge_id;

    RETURN QUERY SELECT TRUE, v_row.auth_user_id, v_row.student_code_hash;
END;
$$;
REVOKE ALL ON FUNCTION public.m2_consume_student_challenge(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m2_consume_student_challenge(UUID, TEXT) TO service_role;

-- 3.7 Get Actor Auth Mapping by Native Auth User ID
CREATE OR REPLACE FUNCTION public.m2_get_actor_auth_by_auth_id(p_auth_user_id UUID)
RETURNS TABLE (
    profile_id UUID,
    role TEXT,
    auth_email TEXT,
    session_version INT,
    invite_pending BOOLEAN,
    invite_issued_at TIMESTAMPTZ,
    invite_claimed_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
    SELECT a.profile_id, a.role, a.auth_email, a.session_version, a.invite_pending, a.invite_issued_at, a.invite_claimed_at
    FROM private.actor_auth a
    WHERE a.auth_user_id = p_auth_user_id;
$$;
REVOKE ALL ON FUNCTION public.m2_get_actor_auth_by_auth_id(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m2_get_actor_auth_by_auth_id(UUID) TO service_role;

-- 3.8 Get Actor Auth Mapping by Public Profile ID
CREATE OR REPLACE FUNCTION public.m2_get_actor_auth_by_profile_id(p_profile_id UUID)
RETURNS TABLE (
    auth_user_id UUID,
    role TEXT,
    auth_email TEXT,
    session_version INT,
    invite_pending BOOLEAN,
    invite_issued_at TIMESTAMPTZ,
    invite_claimed_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
    SELECT a.auth_user_id, a.role, a.auth_email, a.session_version, a.invite_pending, a.invite_issued_at, a.invite_claimed_at
    FROM private.actor_auth a
    WHERE a.profile_id = p_profile_id;
$$;
REVOKE ALL ON FUNCTION public.m2_get_actor_auth_by_profile_id(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m2_get_actor_auth_by_profile_id(UUID) TO service_role;

-- 3.8b Get Actor Auth Mapping by Auth Email
CREATE OR REPLACE FUNCTION public.m2_get_actor_auth_by_email(p_email TEXT)
RETURNS TABLE (
    auth_user_id UUID,
    profile_id UUID,
    role TEXT,
    auth_email TEXT,
    session_version INT,
    profile_status TEXT,
    invite_pending BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
    SELECT a.auth_user_id, a.profile_id, a.role, a.auth_email, p.session_version, p.status AS profile_status, a.invite_pending
    FROM private.actor_auth a
    JOIN public.profiles p ON p.id = a.profile_id
    WHERE lower(a.auth_email) = lower(trim(p_email))
    LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.m2_get_actor_auth_by_email(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m2_get_actor_auth_by_email(TEXT) TO service_role;

-- 3.9 Create Actor Auth Mapping
CREATE OR REPLACE FUNCTION public.m2_create_actor_auth(
    p_auth_user_id UUID,
    p_profile_id UUID,
    p_role TEXT,
    p_auth_email TEXT,
    p_session_version INT DEFAULT 1,
    p_invite_pending BOOLEAN DEFAULT false,
    p_invite_issued_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
BEGIN
    INSERT INTO private.actor_auth (
        auth_user_id, profile_id, role, auth_email, session_version, invite_pending, invite_issued_at
    )
    VALUES (
        p_auth_user_id, p_profile_id, p_role, lower(trim(p_auth_email)), p_session_version, p_invite_pending, p_invite_issued_at
    )
    ON CONFLICT (auth_user_id) DO UPDATE
    SET profile_id = EXCLUDED.profile_id,
        role = EXCLUDED.role,
        auth_email = EXCLUDED.auth_email,
        session_version = EXCLUDED.session_version,
        invite_pending = EXCLUDED.invite_pending,
        invite_issued_at = EXCLUDED.invite_issued_at,
        updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.m2_create_actor_auth(UUID, UUID, TEXT, TEXT, INT, BOOLEAN, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m2_create_actor_auth(UUID, UUID, TEXT, TEXT, INT, BOOLEAN, TIMESTAMPTZ) TO service_role;

-- 3.10 Invalidation Bump Helper (Shared for admin, teacher, student)
CREATE OR REPLACE FUNCTION public.m2_bump_profile_version(p_profile_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
    v_new_version INT;
    v_profile_role TEXT;
    v_mapping_role TEXT;
    v_rowcount INT;
BEGIN
    -- Canonical advisory lock on profile
    PERFORM pg_advisory_xact_lock(hashtext('profile:' || p_profile_id::text));

    -- Verify target profile exists with legitimate role ('admin', 'teacher', 'student')
    SELECT role INTO v_profile_role
    FROM public.profiles
    WHERE id = p_profile_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile % not found', p_profile_id;
    END IF;

    IF v_profile_role NOT IN ('admin', 'teacher', 'student') THEN
        RAISE EXCEPTION 'Profile % role % is invalid', p_profile_id, v_profile_role;
    END IF;

    -- Verify valid mapping exists in private.actor_auth and role matches
    SELECT role INTO v_mapping_role
    FROM private.actor_auth
    WHERE profile_id = p_profile_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Actor auth mapping not found for profile %', p_profile_id;
    END IF;

    IF v_mapping_role <> v_profile_role THEN
        RAISE EXCEPTION 'Role mismatch between profile (%) and actor_auth (%) for profile %',
            v_profile_role, v_mapping_role, p_profile_id;
    END IF;

    UPDATE public.profiles
    SET session_version = session_version + 1,
        updated_at = now()
    WHERE id = p_profile_id
    RETURNING session_version INTO v_new_version;
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount <> 1 OR v_new_version IS NULL THEN
        RAISE EXCEPTION 'Profile version bump failed for %', p_profile_id;
    END IF;

    UPDATE private.actor_auth
    SET session_version = v_new_version,
        updated_at = now()
    WHERE profile_id = p_profile_id;
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount <> 1 THEN
        RAISE EXCEPTION 'Actor auth version update failed for %', p_profile_id;
    END IF;

    RETURN v_new_version;
END;
$$;
REVOKE ALL ON FUNCTION public.m2_bump_profile_version(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m2_bump_profile_version(UUID) TO service_role;

-- 3.11 Atomic Class Archive with Canonical Class Lock & Version Bump
CREATE OR REPLACE FUNCTION public.m2_archive_class(p_class_id UUID)
RETURNS TABLE (auth_user_id UUID, new_session_version INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
    v_rowcount INT;
BEGIN
    -- Take canonical advisory lock on class
    PERFORM pg_advisory_xact_lock(hashtext('class:' || p_class_id::text));

    IF NOT EXISTS (SELECT 1 FROM public.classes WHERE id = p_class_id) THEN
        RAISE EXCEPTION 'Class not found';
    END IF;

    UPDATE public.classes
    SET status = 'archived', updated_at = now()
    WHERE id = p_class_id;
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount <> 1 THEN
        RAISE EXCEPTION 'Failed to update class status';
    END IF;

    -- Bump version for all students in class
    UPDATE public.profiles p
    SET session_version = p.session_version + 1,
        updated_at = now()
    FROM public.students s
    WHERE s.id = p.id
      AND s.current_class_id = p_class_id;

    UPDATE private.actor_auth a
    SET session_version = p.session_version,
        updated_at = now()
    FROM public.profiles p
    JOIN public.students s ON s.id = p.id
    WHERE a.profile_id = p.id
      AND s.current_class_id = p_class_id;

    RETURN QUERY
    SELECT a.auth_user_id, a.session_version
    FROM private.actor_auth a
    JOIN public.students s ON s.id = a.profile_id
    WHERE s.current_class_id = p_class_id;
END;
$$;
REVOKE ALL ON FUNCTION public.m2_archive_class(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m2_archive_class(UUID) TO service_role;

-- 3.12 Atomic Class Restore with Canonical Class Lock & Version Bump
CREATE OR REPLACE FUNCTION public.m2_restore_class(p_class_id UUID)
RETURNS TABLE (auth_user_id UUID, new_session_version INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
    v_rowcount INT;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('class:' || p_class_id::text));

    IF NOT EXISTS (SELECT 1 FROM public.classes WHERE id = p_class_id) THEN
        RAISE EXCEPTION 'Class not found';
    END IF;

    UPDATE public.classes
    SET status = 'active', updated_at = now()
    WHERE id = p_class_id;
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount <> 1 THEN
        RAISE EXCEPTION 'Failed to update class status';
    END IF;

    UPDATE public.profiles p
    SET session_version = p.session_version + 1,
        updated_at = now()
    FROM public.students s
    WHERE s.id = p.id
      AND s.current_class_id = p_class_id;

    UPDATE private.actor_auth a
    SET session_version = p.session_version,
        updated_at = now()
    FROM public.profiles p
    JOIN public.students s ON s.id = p.id
    WHERE a.profile_id = p.id
      AND s.current_class_id = p_class_id;

    RETURN QUERY
    SELECT a.auth_user_id, a.session_version
    FROM private.actor_auth a
    JOIN public.students s ON s.id = a.profile_id
    WHERE s.current_class_id = p_class_id;
END;
$$;
REVOKE ALL ON FUNCTION public.m2_restore_class(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m2_restore_class(UUID) TO service_role;

-- 3.12b Save Class (Transactional Create/Update with Canonical Lock & Teacher Assignment)
CREATE OR REPLACE FUNCTION public.m2_save_class(
    p_admin_profile_id UUID,
    p_class_id UUID,
    p_code TEXT,
    p_name TEXT,
    p_teacher_id UUID
)
RETURNS TABLE (
    id UUID,
    code TEXT,
    name TEXT,
    course_id UUID,
    teacher_id UUID,
    status TEXT,
    is_14_sessions_confirmed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
    v_class_id UUID := p_class_id;
    v_class public.classes%ROWTYPE;
BEGIN
    -- 1. Validate active admin
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = p_admin_profile_id AND role = 'admin' AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Admin profile is not active admin';
    END IF;

    -- 2. Validate code and name
    IF p_code IS NULL OR trim(p_code) = '' OR p_name IS NULL OR trim(p_name) = '' THEN
        RAISE EXCEPTION 'Class code and name cannot be empty';
    END IF;

    -- 3. Validate target teacher if provided
    IF p_teacher_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = p_teacher_id AND role = 'teacher' AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'Teacher profile % is not an active teacher', p_teacher_id;
        END IF;
    END IF;

    -- 4. Create or Update
    IF v_class_id IS NULL THEN
        v_class_id := gen_random_uuid();

        -- Lock code namespace
        PERFORM pg_advisory_xact_lock(hashtext('class_code:' || lower(trim(p_code))));

        IF EXISTS (SELECT 1 FROM public.classes WHERE lower(code) = lower(trim(p_code))) THEN
            RAISE EXCEPTION 'Class code already exists: %', trim(p_code);
        END IF;

        INSERT INTO public.classes (id, code, name, course_id, status, is_14_sessions_confirmed, is_fixture)
        VALUES (v_class_id, trim(p_code), trim(p_name), NULL, 'active', false, true)
        RETURNING * INTO v_class;

        IF p_teacher_id IS NOT NULL THEN
            INSERT INTO public.class_teachers (class_id, teacher_profile_id)
            VALUES (v_class_id, p_teacher_id);
        END IF;
    ELSE
        -- Canonical class lock
        PERFORM pg_advisory_xact_lock(hashtext('class:' || v_class_id::text));

        SELECT * INTO v_class
        FROM public.classes
        WHERE id = v_class_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Class not found: %', v_class_id;
        END IF;

        -- Check code uniqueness if changed
        IF lower(v_class.code) <> lower(trim(p_code)) THEN
            PERFORM pg_advisory_xact_lock(hashtext('class_code:' || lower(trim(p_code))));
            IF EXISTS (SELECT 1 FROM public.classes WHERE lower(code) = lower(trim(p_code)) AND id <> v_class_id) THEN
                RAISE EXCEPTION 'Class code already exists: %', trim(p_code);
            END IF;
        END IF;

        UPDATE public.classes
        SET code = trim(p_code),
            name = trim(p_name),
            updated_at = now()
        WHERE id = v_class_id
        RETURNING * INTO v_class;

        -- Atomic teacher assignment update: null clears assignment intentionally
        DELETE FROM public.class_teachers WHERE class_id = v_class_id;
        IF p_teacher_id IS NOT NULL THEN
            INSERT INTO public.class_teachers (class_id, teacher_profile_id)
            VALUES (v_class_id, p_teacher_id);
        END IF;
    END IF;

    RETURN QUERY
    SELECT 
        v_class.id,
        v_class.code,
        v_class.name,
        v_class.course_id,
        p_teacher_id,
        v_class.status,
        v_class.is_14_sessions_confirmed;
END;
$$;
REVOKE ALL ON FUNCTION public.m2_save_class(UUID, UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m2_save_class(UUID, UUID, TEXT, TEXT, UUID) TO service_role;

-- 3.12c Assign Class Teacher (Atomic Check and Assignment with Canonical Lock)
CREATE OR REPLACE FUNCTION public.m2_assign_class_teacher(
    p_admin_profile_id UUID,
    p_class_id UUID,
    p_teacher_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
BEGIN
    -- 1. Validate active admin
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = p_admin_profile_id AND role = 'admin' AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Admin profile is not active admin';
    END IF;

    -- 2. Validate active class under canonical lock
    PERFORM pg_advisory_xact_lock(hashtext('class:' || p_class_id::text));
    IF NOT EXISTS (
        SELECT 1 FROM public.classes
        WHERE id = p_class_id AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Active class not found: %', p_class_id;
    END IF;

    -- 3. Validate active teacher if provided (null clears assignment)
    IF p_teacher_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = p_teacher_id AND role = 'teacher' AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'Teacher profile % is not an active teacher', p_teacher_id;
        END IF;
    END IF;

    DELETE FROM public.class_teachers WHERE class_id = p_class_id;
    IF p_teacher_id IS NOT NULL THEN
        INSERT INTO public.class_teachers (class_id, teacher_profile_id)
        VALUES (p_class_id, p_teacher_id);
    END IF;

    RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.m2_assign_class_teacher(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m2_assign_class_teacher(UUID, UUID, UUID) TO service_role;

-- 3.13 Atomic Student Archive with Canonical Lock & Version Bump
CREATE OR REPLACE FUNCTION public.m2_archive_student(p_student_id UUID)
RETURNS TABLE (auth_user_id UUID, new_session_version INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
    v_class_id UUID;
    v_new_version INT;
    v_auth_id UUID;
    v_rowcount INT;
BEGIN
    SELECT s.current_class_id INTO v_class_id
    FROM public.students s
    JOIN public.profiles p ON p.id = s.id
    WHERE s.id = p_student_id AND p.role = 'student';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Student not found or target is not a student';
    END IF;

    IF v_class_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('class:' || v_class_id::text));
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('student:' || p_student_id::text));

    UPDATE public.students SET status = 'archived', updated_at = now() WHERE id = p_student_id;
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount <> 1 THEN
        RAISE EXCEPTION 'Failed to update student status';
    END IF;

    UPDATE public.profiles SET status = 'archived', session_version = session_version + 1, updated_at = now()
    WHERE id = p_student_id AND role = 'student'
    RETURNING session_version INTO v_new_version;
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount <> 1 THEN
        RAISE EXCEPTION 'Failed to update profile status';
    END IF;

    UPDATE private.actor_auth
    SET session_version = v_new_version, updated_at = now()
    WHERE profile_id = p_student_id
    RETURNING actor_auth.auth_user_id INTO v_auth_id;

    RETURN QUERY SELECT v_auth_id, v_new_version;
END;
$$;
REVOKE ALL ON FUNCTION public.m2_archive_student(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m2_archive_student(UUID) TO service_role;

-- 3.14 Atomic Student Restore with Canonical Lock & Version Bump
CREATE OR REPLACE FUNCTION public.m2_restore_student(p_student_id UUID)
RETURNS TABLE (auth_user_id UUID, new_session_version INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
    v_class_id UUID;
    v_new_version INT;
    v_auth_id UUID;
    v_rowcount INT;
BEGIN
    SELECT s.current_class_id INTO v_class_id
    FROM public.students s
    JOIN public.profiles p ON p.id = s.id
    WHERE s.id = p_student_id AND p.role = 'student';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Student not found or target is not a student';
    END IF;

    IF v_class_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('class:' || v_class_id::text));
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('student:' || p_student_id::text));

    UPDATE public.students SET status = 'active', updated_at = now() WHERE id = p_student_id;
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount <> 1 THEN
        RAISE EXCEPTION 'Failed to update student status';
    END IF;

    UPDATE public.profiles SET status = 'active', session_version = session_version + 1, updated_at = now()
    WHERE id = p_student_id AND role = 'student'
    RETURNING session_version INTO v_new_version;
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount <> 1 THEN
        RAISE EXCEPTION 'Failed to update profile status';
    END IF;

    UPDATE private.actor_auth
    SET session_version = v_new_version, updated_at = now()
    WHERE profile_id = p_student_id
    RETURNING actor_auth.auth_user_id INTO v_auth_id;

    RETURN QUERY SELECT v_auth_id, v_new_version;
END;
$$;
REVOKE ALL ON FUNCTION public.m2_restore_student(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m2_restore_student(UUID) TO service_role;

-- 3.15 PIN Claim Operation (Canonical Class Lock for Both Modes)
CREATE OR REPLACE FUNCTION public.m2_claim_pin_operation(
    p_admin_profile_id UUID,
    p_class_id UUID,
    p_student_id UUID,
    p_op_type TEXT,
    p_ttl_seconds INT DEFAULT 300
)
RETURNS TABLE (
    operation_id UUID,
    class_code TEXT,
    target_students JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
    v_target_class_id UUID := p_class_id;
    v_class_code TEXT;
    v_op_id UUID := gen_random_uuid();
    v_expires TIMESTAMPTZ := now() + (p_ttl_seconds || ' seconds')::INTERVAL;
    v_targets JSONB := '[]'::jsonb;
    v_student RECORD;
    v_reserved_auth_id UUID;
    v_reserved_email TEXT;
BEGIN
    IF p_student_id IS NOT NULL THEN
        SELECT s.current_class_id INTO v_target_class_id
        FROM public.students s
        WHERE s.id = p_student_id AND s.status IN ('active', 'transferred');

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Active student not found';
        END IF;
    END IF;

    -- Canonical lock: Lock the target class FIRST for both modes
    PERFORM pg_advisory_xact_lock(hashtext('class:' || v_target_class_id::text));

    SELECT c.code INTO v_class_code
    FROM public.classes c
    WHERE c.id = v_target_class_id AND c.status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active class not found';
    END IF;

    IF EXISTS (
        SELECT 1 FROM private.pin_operations
        WHERE class_id = v_target_class_id
          AND status IN ('pending', 'committing')
          AND expires_at > now()
    ) THEN
        RAISE EXCEPTION 'A PIN operation is already in progress for this class';
    END IF;

    IF p_op_type = 'batch_first_issue' THEN
        FOR v_student IN (
            SELECT s.id, s.student_code, s.full_name
            FROM public.students s
            WHERE s.current_class_id = v_target_class_id
              AND s.status IN ('active', 'transferred')
              AND s.pin_issued_at IS NULL
            ORDER BY s.student_code ASC
        ) LOOP
            PERFORM pg_advisory_xact_lock(hashtext('student:' || v_student.id::text));

            SELECT a.auth_user_id, a.auth_email INTO v_reserved_auth_id, v_reserved_email
            FROM private.actor_auth a
            WHERE a.profile_id = v_student.id;

            IF NOT FOUND OR v_reserved_auth_id IS NULL THEN
                v_reserved_auth_id := gen_random_uuid();
                v_reserved_email := 'stu_' || lower(replace(v_reserved_auth_id::text, '-', '')) || '@example.invalid';
            END IF;

            v_targets := v_targets || jsonb_build_object(
                'studentId', v_student.id,
                'studentCode', v_student.student_code,
                'fullName', v_student.full_name,
                'authUserId', v_reserved_auth_id,
                'authEmail', v_reserved_email
            );
        END LOOP;

        IF jsonb_array_length(v_targets) = 0 THEN
            RAISE EXCEPTION 'No unissued active students in class';
        END IF;

    ELSIF p_op_type = 'single_reissue' THEN
        PERFORM pg_advisory_xact_lock(hashtext('student:' || p_student_id::text));

        SELECT s.id, s.student_code, s.full_name, s.pin_issued_at, a.auth_user_id, a.auth_email
        INTO v_student
        FROM public.students s
        JOIN private.actor_auth a ON a.profile_id = s.id
        WHERE s.id = p_student_id AND s.status IN ('active', 'transferred');

        IF NOT FOUND OR v_student.pin_issued_at IS NULL THEN
            RAISE EXCEPTION 'Student not eligible for reissue';
        END IF;

        v_targets := jsonb_build_array(jsonb_build_object(
            'studentId', v_student.id,
            'studentCode', v_student.student_code,
            'fullName', v_student.full_name,
            'authUserId', v_student.auth_user_id,
            'authEmail', v_student.auth_email
        ));
    END IF;

    INSERT INTO private.pin_operations (
        id, admin_profile_id, class_id, student_id, operation_type, target_students, status, expires_at
    )
    VALUES (
        v_op_id, p_admin_profile_id, v_target_class_id, p_student_id, p_op_type, v_targets, 'pending', v_expires
    );

    RETURN QUERY SELECT v_op_id, v_class_code, v_targets;
END;
$$;
REVOKE ALL ON FUNCTION public.m2_claim_pin_operation(UUID, UUID, UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m2_claim_pin_operation(UUID, UUID, UUID, TEXT, INT) TO service_role;

-- 3.15b Get PIN Operation for Pre-validation
CREATE OR REPLACE FUNCTION public.m2_get_pin_operation(
    p_op_id UUID,
    p_admin_profile_id UUID
)
RETURNS TABLE (
    valid BOOLEAN,
    operation_type TEXT,
    class_id UUID,
    target_students JSONB,
    status TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
    SELECT 
        (status = 'pending' AND expires_at > now() AND admin_profile_id = p_admin_profile_id) AS valid,
        operation_type,
        class_id,
        target_students,
        status
    FROM private.pin_operations
    WHERE id = p_op_id;
$$;
REVOKE ALL ON FUNCTION public.m2_get_pin_operation(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m2_get_pin_operation(UUID, UUID) TO service_role;

-- 3.16 Begin PIN Commit (Locks claim, canonical class lock, checks active targets, marks committing)
CREATE OR REPLACE FUNCTION public.m2_begin_pin_commit(
    p_op_id UUID,
    p_admin_profile_id UUID,
    p_submitted_student_ids UUID[]
)
RETURNS TABLE (
    valid BOOLEAN,
    operation_type TEXT,
    class_id UUID,
    target_students JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
    v_row private.pin_operations%ROWTYPE;
    v_claimed_ids UUID[];
    v_student_count INT;
BEGIN
    SELECT * INTO v_row
    FROM private.pin_operations
    WHERE id = p_op_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, '[]'::jsonb;
        RETURN;
    END IF;

    IF v_row.status <> 'pending' OR v_row.expires_at <= now() OR v_row.admin_profile_id <> p_admin_profile_id THEN
        RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, '[]'::jsonb;
        RETURN;
    END IF;

    -- Canonical class lock
    PERFORM pg_advisory_xact_lock(hashtext('class:' || v_row.class_id::text));

    -- Check class is still active
    IF NOT EXISTS (SELECT 1 FROM public.classes WHERE id = v_row.class_id AND status = 'active') THEN
        RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, '[]'::jsonb;
        RETURN;
    END IF;

    -- Extract claimed student IDs
    SELECT ARRAY_AGG((x->>'studentId')::UUID) INTO v_claimed_ids
    FROM jsonb_array_elements(v_row.target_students) AS x;

    -- Verify exact unique set match with submitted IDs (no duplicates or foreign IDs)
    IF array_length(p_submitted_student_ids, 1) IS NULL 
       OR array_length(p_submitted_student_ids, 1) <> array_length(v_claimed_ids, 1) 
       OR (SELECT count(DISTINCT id) FROM unnest(p_submitted_student_ids) AS id) <> array_length(p_submitted_student_ids, 1)
       OR NOT (v_claimed_ids @> p_submitted_student_ids AND p_submitted_student_ids @> v_claimed_ids) THEN
        RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, '[]'::jsonb;
        RETURN;
    END IF;

    -- Batch cannot reset already issued students
    IF v_row.operation_type = 'batch_first_issue' THEN
        IF EXISTS (
            SELECT 1 FROM public.students
            WHERE id = ANY(v_claimed_ids) AND pin_issued_at IS NOT NULL
        ) THEN
            RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, '[]'::jsonb;
            RETURN;
        END IF;
    END IF;

    -- Verify all target students are still active or transferred
    SELECT count(*) INTO v_student_count
    FROM public.students
    WHERE id = ANY(v_claimed_ids)
      AND status IN ('active', 'transferred')
      AND current_class_id = v_row.class_id;

    IF v_student_count <> array_length(v_claimed_ids, 1) THEN
        RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, '[]'::jsonb;
        RETURN;
    END IF;

    -- Transition to committing atomically
    UPDATE private.pin_operations
    SET status = 'committing'
    WHERE id = p_op_id;

    RETURN QUERY SELECT TRUE, v_row.operation_type, v_row.class_id, v_row.target_students;
END;
$$;
REVOKE ALL ON FUNCTION public.m2_begin_pin_commit(UUID, UUID, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m2_begin_pin_commit(UUID, UUID, UUID[]) TO service_role;

-- 3.17 Atomic Commit Finalization
CREATE OR REPLACE FUNCTION public.m2_finalize_pin_commit(
    p_op_id UUID,
    p_admin_profile_id UUID,
    p_records JSONB
)
RETURNS TABLE (
    success BOOLEAN,
    reissued_auth_users JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
    v_row private.pin_operations%ROWTYPE;
    v_rec RECORD;
    v_student_id UUID;
    v_auth_id UUID;
    v_auth_email TEXT;
    v_now TIMESTAMPTZ := now();
    v_reissue_list JSONB := '[]'::jsonb;
    v_new_version INT;
    v_rowcount INT;
    v_claimed_count INT;
    v_submitted_count INT;
    v_unique_submitted_students INT;
    v_unique_submitted_auths INT;
    v_matched_target JSONB;
    v_student_check RECORD;
    v_existing_mapping private.actor_auth%ROWTYPE;
BEGIN
    -- 1. Lock and validate pin operation
    SELECT * INTO v_row
    FROM private.pin_operations
    WHERE id = p_op_id
    FOR UPDATE;

    IF NOT FOUND OR v_row.status <> 'committing' OR v_row.admin_profile_id <> p_admin_profile_id OR v_row.expires_at <= now() THEN
        RETURN QUERY SELECT FALSE, '[]'::jsonb;
        RETURN;
    END IF;

    -- 2. Lock and validate admin profile under lock
    PERFORM pg_advisory_xact_lock(hashtext('profile:' || p_admin_profile_id::text));
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = p_admin_profile_id AND role = 'admin' AND status = 'active'
    ) THEN
        UPDATE private.pin_operations SET status = 'failed' WHERE id = p_op_id;
        RETURN QUERY SELECT FALSE, '[]'::jsonb;
        RETURN;
    END IF;

    -- 3. Canonical class lock and check class is active
    PERFORM pg_advisory_xact_lock(hashtext('class:' || v_row.class_id::text));
    IF NOT EXISTS (
        SELECT 1 FROM public.classes
        WHERE id = v_row.class_id AND status = 'active'
    ) THEN
        UPDATE private.pin_operations SET status = 'failed' WHERE id = p_op_id;
        RETURN QUERY SELECT FALSE, '[]'::jsonb;
        RETURN;
    END IF;

    -- 4. Validate JSON arrays nonempty and exact counts
    IF p_records IS NULL OR jsonb_typeof(p_records) <> 'array' THEN
        UPDATE private.pin_operations SET status = 'failed' WHERE id = p_op_id;
        RETURN QUERY SELECT FALSE, '[]'::jsonb;
        RETURN;
    END IF;

    IF v_row.target_students IS NULL OR jsonb_typeof(v_row.target_students) <> 'array' THEN
        UPDATE private.pin_operations SET status = 'failed' WHERE id = p_op_id;
        RETURN QUERY SELECT FALSE, '[]'::jsonb;
        RETURN;
    END IF;

    v_claimed_count := jsonb_array_length(v_row.target_students);
    v_submitted_count := jsonb_array_length(p_records);

    IF v_claimed_count = 0 OR v_submitted_count <> v_claimed_count THEN
        UPDATE private.pin_operations SET status = 'failed' WHERE id = p_op_id;
        RETURN QUERY SELECT FALSE, '[]'::jsonb;
        RETURN;
    END IF;

    -- Check for NULL fields in submitted records (Null must reject with IS DISTINCT FROM, not <> null)
    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_records) AS x(
            "studentId" UUID,
            "authUserId" UUID,
            "authEmail" TEXT,
            "isNew" BOOLEAN
        )
        WHERE x."studentId" IS NULL
           OR x."authUserId" IS NULL
           OR x."authEmail" IS NULL
           OR x."isNew" IS NULL
    ) THEN
        UPDATE private.pin_operations SET status = 'failed' WHERE id = p_op_id;
        RETURN QUERY SELECT FALSE, '[]'::jsonb;
        RETURN;
    END IF;

    -- Validate exact unique submitted student IDs and unique Auth UUIDs
    SELECT count(DISTINCT x."studentId"), count(DISTINCT x."authUserId")
    INTO v_unique_submitted_students, v_unique_submitted_auths
    FROM jsonb_to_recordset(p_records) AS x(
        "studentId" UUID,
        "authUserId" UUID,
        "authEmail" TEXT,
        "isNew" BOOLEAN
    );

    IF v_unique_submitted_students <> v_claimed_count OR v_unique_submitted_auths <> v_claimed_count THEN
        UPDATE private.pin_operations SET status = 'failed' WHERE id = p_op_id;
        RETURN QUERY SELECT FALSE, '[]'::jsonb;
        RETURN;
    END IF;

    -- Validate submitted set matches claimed set exactly before performing any write
    FOR v_rec IN SELECT * FROM jsonb_to_recordset(p_records) AS x(
        "studentId" UUID,
        "authUserId" UUID,
        "authEmail" TEXT,
        "isNew" BOOLEAN
    ) LOOP
        -- Match claimed target tuple
        SELECT elem INTO v_matched_target
        FROM jsonb_array_elements(v_row.target_students) AS elem
        WHERE (elem->>'studentId')::UUID = v_rec."studentId"
        LIMIT 1;

        IF v_matched_target IS NULL THEN
            UPDATE private.pin_operations SET status = 'failed' WHERE id = p_op_id;
            RETURN QUERY SELECT FALSE, '[]'::jsonb;
            RETURN;
        END IF;

        IF lower(v_matched_target->>'authUserId') IS DISTINCT FROM lower(v_rec."authUserId"::text) THEN
            UPDATE private.pin_operations SET status = 'failed' WHERE id = p_op_id;
            RETURN QUERY SELECT FALSE, '[]'::jsonb;
            RETURN;
        END IF;

        IF lower(trim(v_matched_target->>'authEmail')) IS DISTINCT FROM lower(trim(v_rec."authEmail")) THEN
            UPDATE private.pin_operations SET status = 'failed' WHERE id = p_op_id;
            RETURN QUERY SELECT FALSE, '[]'::jsonb;
            RETURN;
        END IF;

        -- isNew-vs-mode binding
        IF v_row.operation_type = 'batch_first_issue' AND v_rec."isNew" IS DISTINCT FROM true THEN
            UPDATE private.pin_operations SET status = 'failed' WHERE id = p_op_id;
            RETURN QUERY SELECT FALSE, '[]'::jsonb;
            RETURN;
        END IF;

        IF v_row.operation_type = 'single_reissue' AND v_rec."isNew" IS DISTINCT FROM false THEN
            UPDATE private.pin_operations SET status = 'failed' WHERE id = p_op_id;
            RETURN QUERY SELECT FALSE, '[]'::jsonb;
            RETURN;
        END IF;
    END LOOP;

    -- 5. Under canonical class and student row locks, execute atomic mutations
    FOR v_rec IN SELECT * FROM jsonb_to_recordset(p_records) AS x(
        "studentId" UUID,
        "authUserId" UUID,
        "authEmail" TEXT,
        "isNew" BOOLEAN
    ) LOOP
        v_student_id := v_rec."studentId";
        v_auth_id := v_rec."authUserId";
        v_auth_email := v_rec."authEmail";

        -- Lock student row
        PERFORM pg_advisory_xact_lock(hashtext('student:' || v_student_id::text));

        -- Re-verify student & profile under lock
        SELECT s.id, s.status AS student_status, s.current_class_id, s.pin_issued_at, p.status AS profile_status, p.role AS profile_role, p.session_version AS profile_session_version
        INTO v_student_check
        FROM public.students s
        JOIN public.profiles p ON p.id = s.id
        WHERE s.id = v_student_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Student % not found', v_student_id;
        END IF;

        IF v_student_check.profile_status <> 'active' OR v_student_check.profile_role <> 'student' THEN
            RAISE EXCEPTION 'Profile for student % is not active student', v_student_id;
        END IF;

        IF v_student_check.student_status NOT IN ('active', 'transferred') THEN
            RAISE EXCEPTION 'Student % status is not active or transferred', v_student_id;
        END IF;

        IF v_student_check.current_class_id <> v_row.class_id THEN
            RAISE EXCEPTION 'Student % current_class_id mismatch', v_student_id;
        END IF;

        IF v_row.operation_type = 'batch_first_issue' AND v_student_check.pin_issued_at IS NOT NULL THEN
            RAISE EXCEPTION 'Student % already has PIN issued', v_student_id;
        END IF;

        IF v_row.operation_type = 'single_reissue' AND v_student_check.pin_issued_at IS NULL THEN
            RAISE EXCEPTION 'Student % has no previous PIN to reissue', v_student_id;
        END IF;

        -- Mapping row checks for both batch and single
        IF v_rec."isNew" = true THEN
            -- Check if mapping exists for profile_id
            SELECT * INTO v_existing_mapping
            FROM private.actor_auth
            WHERE profile_id = v_student_id
            FOR UPDATE;

            IF FOUND THEN
                -- If existing mapping exists (e.g. seeded placeholder), it must match the reserved AuthID and email
                IF v_existing_mapping.auth_user_id <> v_auth_id OR lower(trim(v_existing_mapping.auth_email)) <> lower(trim(v_auth_email)) THEN
                    RAISE EXCEPTION 'Existing mapping mismatch for student %', v_student_id;
                END IF;

                -- NEVER decrement session_version to 1 for existing placeholder
                v_new_version := GREATEST(COALESCE(v_student_check.profile_session_version, 1), COALESCE(v_existing_mapping.session_version, 1)) + 1;

                UPDATE private.actor_auth
                SET auth_user_id = v_auth_id,
                    auth_email = lower(trim(v_auth_email)),
                    session_version = v_new_version,
                    updated_at = v_now
                WHERE profile_id = v_student_id;
                GET DIAGNOSTICS v_rowcount = ROW_COUNT;
                IF v_rowcount <> 1 THEN
                    RAISE EXCEPTION 'Actor auth update failed for student %', v_student_id;
                END IF;

                UPDATE public.profiles
                SET session_version = v_new_version, updated_at = v_now
                WHERE id = v_student_id;
                GET DIAGNOSTICS v_rowcount = ROW_COUNT;
                IF v_rowcount <> 1 THEN
                    RAISE EXCEPTION 'Profile update failed for student %', v_student_id;
                END IF;

                -- Return metadata sync record alongside reissue
                v_reissue_list := v_reissue_list || jsonb_build_object(
                    'authUserId', v_auth_id,
                    'sessionVersion', v_new_version
                );
            ELSE
                -- Brand new student: check auth_user_id is not already mapped to a different profile
                IF EXISTS (
                    SELECT 1 FROM private.actor_auth
                    WHERE auth_user_id = v_auth_id AND profile_id <> v_student_id
                ) THEN
                    RAISE EXCEPTION 'Auth user % is already mapped to another profile', v_auth_id;
                END IF;

                INSERT INTO private.actor_auth (auth_user_id, profile_id, role, auth_email, session_version)
                VALUES (v_auth_id, v_student_id, 'student', lower(trim(v_auth_email)), 1);

                UPDATE public.profiles
                SET session_version = 1, updated_at = v_now
                WHERE id = v_student_id;
                GET DIAGNOSTICS v_rowcount = ROW_COUNT;
                IF v_rowcount <> 1 THEN
                    RAISE EXCEPTION 'Profile update failed for student %', v_student_id;
                END IF;
            END IF;
        ELSE
            -- Single reissue: exact one mapping row check
            SELECT * INTO v_existing_mapping
            FROM private.actor_auth
            WHERE profile_id = v_student_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Mapping row not found for student %', v_student_id;
            END IF;

            IF v_existing_mapping.auth_user_id <> v_auth_id OR lower(trim(v_existing_mapping.auth_email)) <> lower(trim(v_auth_email)) THEN
                RAISE EXCEPTION 'Mapping row credentials mismatch for student %', v_student_id;
            END IF;

            UPDATE public.profiles
            SET session_version = session_version + 1, updated_at = v_now
            WHERE id = v_student_id
            RETURNING session_version INTO v_new_version;
            GET DIAGNOSTICS v_rowcount = ROW_COUNT;
            IF v_rowcount <> 1 THEN
                RAISE EXCEPTION 'Profile version bump failed for student %', v_student_id;
            END IF;

            UPDATE private.actor_auth
            SET session_version = v_new_version,
                updated_at = v_now
            WHERE profile_id = v_student_id;
            GET DIAGNOSTICS v_rowcount = ROW_COUNT;
            IF v_rowcount <> 1 THEN
                RAISE EXCEPTION 'Actor auth update failed for student %', v_student_id;
            END IF;

            v_reissue_list := v_reissue_list || jsonb_build_object(
                'authUserId', v_auth_id,
                'sessionVersion', v_new_version
            );
        END IF;

        UPDATE public.students
        SET pin_issued_at = v_now, updated_at = v_now
        WHERE id = v_student_id;
        GET DIAGNOSTICS v_rowcount = ROW_COUNT;
        IF v_rowcount <> 1 THEN
            RAISE EXCEPTION 'Student record update failed for student %', v_student_id;
        END IF;
    END LOOP;

    UPDATE private.pin_operations
    SET status = 'completed', completed_at = v_now
    WHERE id = p_op_id;

    RETURN QUERY SELECT TRUE, v_reissue_list;
EXCEPTION WHEN OTHERS THEN
    UPDATE private.pin_operations SET status = 'failed' WHERE id = p_op_id;
    RETURN QUERY SELECT FALSE, '[]'::jsonb;
    RETURN;
END;
$$;
REVOKE ALL ON FUNCTION public.m2_finalize_pin_commit(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m2_finalize_pin_commit(UUID, UUID, JSONB) TO service_role;

-- 3.18 Mark PIN Claim Failed
CREATE OR REPLACE FUNCTION public.m2_fail_pin_operation(p_op_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
BEGIN
    UPDATE private.pin_operations
    SET status = 'failed'
    WHERE id = p_op_id;
END;
$$;
REVOKE ALL ON FUNCTION public.m2_fail_pin_operation(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m2_fail_pin_operation(UUID) TO service_role;

-- 3.19 Claim Staff Invite and Create Bound Setup Ticket
CREATE OR REPLACE FUNCTION public.m2_claim_staff_invite_and_create_ticket(
    p_auth_user_id UUID,
    p_session_id UUID,
    p_session_version INT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, pg_catalog
AS $$
DECLARE
    v_mapping private.actor_auth%ROWTYPE;
    v_profile public.profiles%ROWTYPE;
    v_session auth.sessions%ROWTYPE;
    v_ticket_id UUID := gen_random_uuid();
BEGIN
    SELECT * INTO v_mapping
    FROM private.actor_auth
    WHERE auth_user_id = p_auth_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Staff actor mapping not found';
    END IF;

    -- 1. Pending/unconsumed + non-null issued timestamp
    IF v_mapping.invite_pending <> true 
       OR v_mapping.invite_claimed_at IS NOT NULL 
       OR v_mapping.invite_issued_at IS NULL THEN
        RAISE EXCEPTION 'Invite is not pending, already claimed, or missing issued timestamp';
    END IF;

    -- 2. Verify active fixed staff profile
    SELECT * INTO v_profile
    FROM public.profiles
    WHERE id = v_mapping.profile_id;

    IF NOT FOUND OR v_profile.status <> 'active' OR v_profile.role NOT IN ('admin', 'teacher') THEN
        RAISE EXCEPTION 'Profile is not active fixed staff';
    END IF;

    -- 3. Verify actual auth.sessions owned, valid (not_after > now), and created_at >= invite_issued_at
    SELECT * INTO v_session
    FROM auth.sessions
    WHERE id = p_session_id
      AND user_id = p_auth_user_id
      AND (not_after IS NULL OR not_after > now());

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid or expired Auth session';
    END IF;

    IF v_session.created_at < v_mapping.invite_issued_at THEN
        RAISE EXCEPTION 'Session was created prior to invite issuance';
    END IF;

    -- 4. Verify OTP proof in auth.mfa_amr_claims
    IF NOT EXISTS (
        SELECT 1 FROM auth.mfa_amr_claims
        WHERE session_id = p_session_id
          AND authentication_method = 'otp'
    ) THEN
        RAISE EXCEPTION 'Session lacks OTP authentication method proof';
    END IF;

    UPDATE private.actor_auth
    SET invite_pending = false,
        invite_claimed_at = now(),
        updated_at = now()
    WHERE auth_user_id = p_auth_user_id;

    INSERT INTO private.staff_recovery_tickets (
        id, auth_user_id, session_id, session_version, ticket_type, expires_at
    )
    VALUES (
        v_ticket_id, p_auth_user_id, p_session_id, p_session_version, 'invite', now() + interval '15 minutes'
    );

    RETURN v_ticket_id;
END;
$$;
REVOKE ALL ON FUNCTION public.m2_claim_staff_invite_and_create_ticket(UUID, UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m2_claim_staff_invite_and_create_ticket(UUID, UUID, INT) TO service_role;

-- 3.20 Create Staff Recovery Ticket (PKCE)
CREATE OR REPLACE FUNCTION public.m2_create_recovery_ticket(
    p_auth_user_id UUID,
    p_session_id UUID,
    p_session_version INT,
    p_ttl_seconds INT DEFAULT 900
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
    v_id UUID := gen_random_uuid();
    v_expires TIMESTAMPTZ := now() + (p_ttl_seconds || ' seconds')::INTERVAL;
BEGIN
    INSERT INTO private.staff_recovery_tickets (
        id, auth_user_id, session_id, session_version, ticket_type, expires_at
    )
    VALUES (
        v_id, p_auth_user_id, p_session_id, p_session_version, 'recovery', v_expires
    );
    RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.m2_create_recovery_ticket(UUID, UUID, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m2_create_recovery_ticket(UUID, UUID, INT, INT) TO service_role;

-- 3.21 Consume Staff Recovery / Setup Ticket Atomically
CREATE OR REPLACE FUNCTION public.m2_consume_recovery_ticket(
    p_ticket_id UUID,
    p_auth_user_id UUID,
    p_session_id UUID,
    p_session_version INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, pg_catalog
AS $$
DECLARE
    v_row private.staff_recovery_tickets%ROWTYPE;
    v_profile_version INT;
BEGIN
    SELECT * INTO v_row
    FROM private.staff_recovery_tickets
    WHERE id = p_ticket_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF v_row.consumed_at IS NOT NULL 
       OR v_row.expires_at <= now() 
       OR v_row.auth_user_id <> p_auth_user_id
       OR v_row.session_id <> p_session_id
       OR v_row.session_version <> p_session_version THEN
        RETURN FALSE;
    END IF;

    -- Verify current profile session_version matches
    SELECT p.session_version INTO v_profile_version
    FROM private.actor_auth a
    JOIN public.profiles p ON p.id = a.profile_id
    WHERE a.auth_user_id = p_auth_user_id AND p.status = 'active';

    IF NOT FOUND OR v_profile_version <> p_session_version THEN
        RETURN FALSE;
    END IF;

    -- Verify actual auth.sessions row
    IF NOT EXISTS (
        SELECT 1 FROM auth.sessions s
        WHERE s.id = p_session_id
          AND s.user_id = p_auth_user_id
          AND (s.not_after IS NULL OR s.not_after > now())
    ) THEN
        RETURN FALSE;
    END IF;

    UPDATE private.staff_recovery_tickets
    SET consumed_at = now()
    WHERE id = p_ticket_id;

    RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.m2_consume_recovery_ticket(UUID, UUID, UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m2_consume_recovery_ticket(UUID, UUID, UUID, INT) TO service_role;

-- 3.22 Seed QA Actor (Bridge for Worker C Runtime Tests)
DROP FUNCTION IF EXISTS public.m2_seed_qa_actor(UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID, UUID[]);
CREATE OR REPLACE FUNCTION public.m2_seed_qa_actor(
    p_auth_user_id UUID,
    p_profile_id UUID,
    p_role TEXT,
    p_auth_email TEXT,
    p_full_name TEXT,
    p_student_code TEXT,
    p_class_id UUID,
    p_assigned_class_ids UUID[],
    p_pin_issued BOOLEAN DEFAULT true
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
    v_cid UUID;
BEGIN
    IF p_role NOT IN ('admin', 'teacher', 'student') THEN
        RAISE EXCEPTION 'Invalid role';
    END IF;

    IF lower(p_profile_id::text) = lower(p_auth_user_id::text) THEN
        RAISE EXCEPTION 'Profile ID and Auth User ID must be different';
    END IF;

    IF NOT (lower(p_auth_email) LIKE '%@example.invalid') THEN
        RAISE EXCEPTION 'QA actor email must end with @example.invalid';
    END IF;

    -- Collision rejection: Reject if profiles or actor_auth already has profileId, authUserId, email, or studentCode
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id) THEN
        RAISE EXCEPTION 'Profile ID already exists: collision rejected';
    END IF;

    IF EXISTS (SELECT 1 FROM private.actor_auth WHERE auth_user_id = p_auth_user_id OR profile_id = p_profile_id) THEN
        RAISE EXCEPTION 'Auth User ID or Profile ID already mapped: collision rejected';
    END IF;

    IF p_role <> 'student' AND EXISTS (SELECT 1 FROM public.profiles WHERE lower(email) = lower(trim(p_auth_email))) THEN
        RAISE EXCEPTION 'Staff email already exists: collision rejected';
    END IF;

    IF p_role = 'student' AND p_student_code IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE upper(student_code) = upper(trim(p_student_code))) THEN
        RAISE EXCEPTION 'Student code already exists: collision rejected';
    END IF;

    IF p_class_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.classes 
        WHERE id = p_class_id 
          AND status = 'active' 
          AND is_fixture = true
          AND (code LIKE 'TEST_M2QA_%' OR code IN ('ROB-K14-01', 'ROB-K14-02', 'ROB-K14-03'))
    ) THEN
        RAISE EXCEPTION 'Target class is not an active fixture class matching QA code pattern';
    END IF;

    IF p_role = 'teacher' AND p_assigned_class_ids IS NOT NULL THEN
        FOREACH v_cid IN ARRAY p_assigned_class_ids LOOP
            IF NOT EXISTS (
                SELECT 1 FROM public.classes 
                WHERE id = v_cid 
                  AND status = 'active' 
                  AND is_fixture = true
                  AND (code LIKE 'TEST_M2QA_%' OR code IN ('ROB-K14-01', 'ROB-K14-02', 'ROB-K14-03'))
            ) THEN
                RAISE EXCEPTION 'Assigned class % is not an active fixture class matching QA code pattern', v_cid;
            END IF;
        END LOOP;
    END IF;

    INSERT INTO public.profiles (
        id, role, full_name, email, student_code, status, session_version, is_fixture
    )
    VALUES (
        p_profile_id, p_role, p_full_name,
        CASE WHEN p_role = 'student' THEN NULL ELSE lower(trim(p_auth_email)) END,
        CASE WHEN p_role = 'student' THEN upper(trim(p_student_code)) ELSE NULL END,
        'active', 1, true
    );

    IF p_role = 'student' THEN
        INSERT INTO public.students (
            id, participant_id, student_code, full_name, current_class_id, original_class_id, pin_issued_at, status, is_fixture
        )
        VALUES (
            p_profile_id, 'PART_' || upper(trim(p_student_code)), upper(trim(p_student_code)), p_full_name,
            p_class_id, p_class_id,
            CASE WHEN p_pin_issued THEN now() ELSE NULL END,
            'active', true
        );
    ELSIF p_role = 'teacher' AND p_assigned_class_ids IS NOT NULL THEN
        FOREACH v_cid IN ARRAY p_assigned_class_ids LOOP
            INSERT INTO public.class_teachers (class_id, teacher_profile_id)
            VALUES (v_cid, p_profile_id)
            ON CONFLICT (class_id, teacher_profile_id) DO NOTHING;
        END LOOP;
    END IF;

    INSERT INTO private.actor_auth (
        auth_user_id, profile_id, role, auth_email, session_version, invite_pending
    )
    VALUES (
        p_auth_user_id, p_profile_id, p_role, lower(trim(p_auth_email)), 1, false
    );

    RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.m2_seed_qa_actor(UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID, UUID[], BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m2_seed_qa_actor(UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID, UUID[], BOOLEAN) TO service_role;

-- ============================================================================
-- 4. RLS RESOLUTION HELPERS (SECURITY DEFINER, FIXED SEARCH_PATH)
-- ============================================================================

-- 4.1 Current Profile ID (Native auth.sessions check + Active/Transferred Student check)
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, pg_catalog
AS $$
    SELECT p.id
    FROM private.actor_auth a
    JOIN public.profiles p ON p.id = a.profile_id
    WHERE a.auth_user_id = auth.uid()
      AND p.status = 'active'
      AND (auth.jwt() ->> 'session_id') IS NOT NULL
      AND EXISTS (
          SELECT 1 FROM auth.sessions s
          WHERE s.id = ((auth.jwt() ->> 'session_id')::uuid)
            AND s.user_id = auth.uid()
            AND (s.not_after IS NULL OR s.not_after > now())
      )
      AND (auth.jwt() -> 'app_metadata' ->> 'm2_session_version') IS NOT NULL
      AND ((auth.jwt() -> 'app_metadata' ->> 'm2_session_version')::int = p.session_version)
      AND ((auth.jwt() -> 'app_metadata' ->> 'm2_session_version')::int = a.session_version)
      AND (
          p.role <> 'student'
          OR EXISTS (
              SELECT 1 FROM public.students st
              JOIN public.classes cl ON cl.id = st.current_class_id
              WHERE st.id = p.id
                AND st.status IN ('active', 'transferred')
                AND cl.status = 'active'
          )
      )
    LIMIT 1;
$$;

-- 4.2 Current Role
CREATE OR REPLACE FUNCTION public.current_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, pg_catalog
AS $$
    SELECT p.role
    FROM public.profiles p
    WHERE p.id = public.current_profile_id()
    LIMIT 1;
$$;

-- 4.3 Is Active Admin
CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, pg_catalog
AS $$
    SELECT COALESCE((public.current_role() = 'admin'), false);
$$;

-- 4.4 Is Teacher Of Active Class
CREATE OR REPLACE FUNCTION public.is_teacher_of_class(p_class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, pg_catalog
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.class_teachers ct
        JOIN public.classes c ON c.id = ct.class_id
        WHERE ct.class_id = p_class_id
          AND ct.teacher_profile_id = public.current_profile_id()
          AND public.current_role() = 'teacher'
          AND c.status = 'active'
    );
$$;

-- 4.5 Is Student Of Active Class (Active or Transferred)
CREATE OR REPLACE FUNCTION public.is_student_of_class(p_class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, pg_catalog
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.students s
        JOIN public.classes c ON c.id = s.current_class_id
        WHERE s.id = public.current_profile_id()
          AND s.current_class_id = p_class_id
          AND public.current_role() = 'student'
          AND s.status IN ('active', 'transferred')
          AND c.status = 'active'
    );
$$;

REVOKE ALL ON FUNCTION public.current_profile_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.current_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_role() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_active_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_admin() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_teacher_of_class(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_teacher_of_class(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_student_of_class(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_student_of_class(UUID) TO authenticated, service_role;

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON public.profiles, public.classes, public.class_teachers, public.students TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_profiles" ON public.profiles;
DROP POLICY IF EXISTS "teacher_select_profiles" ON public.profiles;
DROP POLICY IF EXISTS "student_select_profiles" ON public.profiles;
DROP POLICY IF EXISTS "admin_select_classes" ON public.classes;
DROP POLICY IF EXISTS "teacher_select_classes" ON public.classes;
DROP POLICY IF EXISTS "student_select_classes" ON public.classes;
DROP POLICY IF EXISTS "admin_select_class_teachers" ON public.class_teachers;
DROP POLICY IF EXISTS "teacher_select_class_teachers" ON public.class_teachers;
DROP POLICY IF EXISTS "student_select_class_teachers" ON public.class_teachers;
DROP POLICY IF EXISTS "admin_select_students" ON public.students;
DROP POLICY IF EXISTS "teacher_select_students" ON public.students;
DROP POLICY IF EXISTS "student_select_students" ON public.students;

-- 5.1 PROFILES RLS
CREATE POLICY "admin_select_profiles" ON public.profiles
    FOR SELECT TO authenticated
    USING (public.is_active_admin());

CREATE POLICY "teacher_select_profiles" ON public.profiles
    FOR SELECT TO authenticated
    USING (
        public.current_role() = 'teacher' AND (
            id = public.current_profile_id()
            OR EXISTS (
                SELECT 1
                FROM public.students s
                JOIN public.classes c ON c.id = s.current_class_id
                JOIN public.class_teachers ct ON ct.class_id = s.current_class_id
                WHERE s.id = profiles.id
                  AND ct.teacher_profile_id = public.current_profile_id()
                  AND s.status IN ('active', 'transferred') -- AND s.status = 'active'
                  AND c.status = 'active'
            )
        )
    );

CREATE POLICY "student_select_profiles" ON public.profiles
    FOR SELECT TO authenticated
    USING (
        public.current_role() = 'student'
        AND id = public.current_profile_id()
    );

-- 5.2 CLASSES RLS
CREATE POLICY "admin_select_classes" ON public.classes
    FOR SELECT TO authenticated
    USING (public.is_active_admin());

CREATE POLICY "teacher_select_classes" ON public.classes
    FOR SELECT TO authenticated
    USING (
        public.current_role() = 'teacher'
        AND status = 'active'
        AND public.is_teacher_of_class(id)
    );

CREATE POLICY "student_select_classes" ON public.classes
    FOR SELECT TO authenticated
    USING (
        public.current_role() = 'student'
        AND status = 'active'
        AND public.is_student_of_class(id)
    );

-- 5.3 CLASS_TEACHERS RLS
CREATE POLICY "admin_select_class_teachers" ON public.class_teachers
    FOR SELECT TO authenticated
    USING (public.is_active_admin());

CREATE POLICY "teacher_select_class_teachers" ON public.class_teachers
    FOR SELECT TO authenticated
    USING (
        public.current_role() = 'teacher'
        AND teacher_profile_id = public.current_profile_id()
        AND public.is_teacher_of_class(class_id)
    );

CREATE POLICY "student_select_class_teachers" ON public.class_teachers
    FOR SELECT TO authenticated
    USING (
        public.current_role() = 'student'
        AND public.is_student_of_class(class_id)
    );

-- 5.4 STUDENTS RLS (Active and Transferred are visible to assigned teacher)
CREATE POLICY "admin_select_students" ON public.students
    FOR SELECT TO authenticated
    USING (public.is_active_admin());

CREATE POLICY "teacher_select_students" ON public.students
    FOR SELECT TO authenticated
    USING (
        public.current_role() = 'teacher'
        AND status IN ('active', 'transferred')
        AND public.is_teacher_of_class(current_class_id)
    );

CREATE POLICY "student_select_students" ON public.students
    FOR SELECT TO authenticated
    USING (
        public.current_role() = 'student'
        AND id = public.current_profile_id()
    );

-- ============================================================================
-- 6. STORAGE BUCKET & POLICIES (M2: 2MB, NO UPLOADS, TEACHER/STUDENT SELECT DENIED)
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'm2-private-fixture',
    'm2-private-fixture',
    false,
    2097152,
    ARRAY['application/zip', 'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/javascript', 'text/html', 'text/css', 'application/json', 'text/markdown']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 2097152;

DROP POLICY IF EXISTS "m2_storage_deny_uploads" ON storage.objects;
DROP POLICY IF EXISTS "m2_storage_select_policy" ON storage.objects;

CREATE POLICY "m2_storage_deny_uploads" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (false);

CREATE POLICY "m2_storage_select_policy" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'm2-private-fixture'
        AND public.is_active_admin()
    );

-- ============================================================================
-- 7. SYNTHETIC FIXTURE SEED DATA (3 CLASSES + 4 STUDENTS + 2 TEACHERS)
-- ============================================================================

INSERT INTO public.classes (id, code, name, course_id, status, is_14_sessions_confirmed, is_fixture)
VALUES
    ('11111111-1111-4111-8111-111111111101', 'ROB-K14-01', 'Lớp Robotics K14 Chiều Thứ 7 (Cơ sở Hà Nội)', NULL, 'active', true, true),
    ('11111111-1111-4111-8111-111111111102', 'ROB-K14-02', 'Lớp Robotics K14 Sáng Chủ Nhật', NULL, 'active', false, true),
    ('11111111-1111-4111-8111-111111111103', 'ROB-K14-03', 'Lớp Robotics Mới (Chưa gán khóa học)', NULL, 'active', false, true)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    status = EXCLUDED.status,
    is_14_sessions_confirmed = EXCLUDED.is_14_sessions_confirmed,
    is_fixture = true;

INSERT INTO public.profiles (id, role, full_name, email, student_code, status, session_version, is_fixture)
VALUES
    ('22222222-2222-4222-8222-222222222201', 'teacher', 'Thầy Hoàng Minh', 'hoang.minh@example.invalid', NULL, 'active', 1, true),
    ('22222222-2222-4222-8222-222222222202', 'teacher', 'Cô Thu Trang (Chưa phân lớp)', 'thu.trang@example.invalid', NULL, 'active', 1, true)
ON CONFLICT (id) DO UPDATE
SET full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    is_fixture = true;

INSERT INTO public.class_teachers (class_id, teacher_profile_id)
VALUES
    ('11111111-1111-4111-8111-111111111101', '22222222-2222-4222-8222-222222222201'),
    ('11111111-1111-4111-8111-111111111102', '22222222-2222-4222-8222-222222222201')
ON CONFLICT (class_id, teacher_profile_id) DO NOTHING;

INSERT INTO public.profiles (id, role, full_name, email, student_code, status, session_version, is_fixture)
VALUES
    ('33333333-3333-4333-8333-333333333301', 'student', 'Lê Bảo Nam', NULL, 'HS_ROB_001', 'active', 1, true),
    ('33333333-3333-4333-8333-333333333302', 'student', 'Phạm Quỳnh Chi', NULL, 'HS_ROB_002', 'active', 1, true),
    ('33333333-3333-4333-8333-333333333303', 'student', 'Nguyễn Tiến Đạt (Đã chuyển lớp)', NULL, 'HS_ROB_003', 'active', 1, true),
    ('33333333-3333-4333-8333-333333333304', 'student', 'Vũ Minh Khôi (Đã lưu trữ)', NULL, 'HS_ROB_004', 'archived', 1, true)
ON CONFLICT (id) DO UPDATE
SET full_name = EXCLUDED.full_name,
    student_code = EXCLUDED.student_code,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    is_fixture = true;

INSERT INTO public.students (id, participant_id, student_code, full_name, current_class_id, original_class_id, pin_issued_at, status, notes, is_fixture)
VALUES
    ('33333333-3333-4333-8333-333333333301', 'PART_ROB01_001', 'HS_ROB_001', 'Lê Bảo Nam', '11111111-1111-4111-8111-111111111101', '11111111-1111-4111-8111-111111111101', '2026-09-02T10:00:00.000Z', 'active', 'Học sinh năng nổ, hoàn thành bài sớm', true),
    ('33333333-3333-4333-8333-333333333302', 'PART_ROB01_002', 'HS_ROB_002', 'Phạm Quỳnh Chi', '11111111-1111-4111-8111-111111111101', '11111111-1111-4111-8111-111111111101', NULL, 'active', 'Học sinh mới nhập học, chờ cấp mã PIN lần đầu', true),
    ('33333333-3333-4333-8333-333333333303', 'PART_ROB01_003', 'HS_ROB_003', 'Nguyễn Tiến Đạt (Đã chuyển lớp)', '11111111-1111-4111-8111-111111111102', '11111111-1111-4111-8111-111111111101', '2026-09-02T10:00:00.000Z', 'transferred', 'Chuyển sang lớp ROB-K14-02 từ tuần thứ 4', true),
    ('33333333-3333-4333-8333-333333333304', 'PART_ROB01_004', 'HS_ROB_004', 'Vũ Minh Khôi (Đã lưu trữ)', '11111111-1111-4111-8111-111111111101', '11111111-1111-4111-8111-111111111101', '2026-09-02T10:00:00.000Z', 'archived', 'Tạm dừng học vì lý do sức khỏe', true)
ON CONFLICT (id) DO UPDATE
SET participant_id = EXCLUDED.participant_id,
    student_code = EXCLUDED.student_code,
    full_name = EXCLUDED.full_name,
    current_class_id = EXCLUDED.current_class_id,
    original_class_id = EXCLUDED.original_class_id,
    pin_issued_at = EXCLUDED.pin_issued_at,
    status = EXCLUDED.status,
    notes = EXCLUDED.notes,
    is_fixture = true;
