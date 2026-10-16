-- ============================================================================
-- MINDX LEARN — M2 Migration: Link Existing Supabase Auth User as Teacher
-- Pinned search_path: pg_catalog, public, private, auth
-- Security: SECURITY DEFINER, service_role execution only
-- ============================================================================

CREATE OR REPLACE FUNCTION public.m2_link_existing_teacher(
    p_admin_profile_id UUID,
    p_email TEXT,
    p_name TEXT,
    p_class_ids UUID[] DEFAULT '{}'::UUID[]
)
RETURNS TABLE(
    id UUID,
    full_name TEXT,
    email TEXT,
    role TEXT,
    status TEXT,
    assigned_class_ids UUID[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $$
#variable_conflict error
DECLARE
    v_norm_email TEXT;
    v_trimmed_name TEXT;
    v_admin_role TEXT;
    v_admin_status TEXT;
    v_auth_id UUID;
    v_auth_email_actual TEXT;
    v_auth_confirmed_at TIMESTAMPTZ;
    v_auth_deleted_at TIMESTAMPTZ;
    v_auth_banned_until TIMESTAMPTZ;
    v_auth_is_anonymous BOOLEAN;
    v_auth_app_metadata JSONB;
    v_auth_has_password BOOLEAN;
    v_profile_id UUID;
    v_is_fixture BOOLEAN;
    v_cid UUID;
    v_class_status TEXT;
    v_assigned_ids UUID[] := '{}'::UUID[];
BEGIN
    -- 1. Validate active admin under row lock; reject null or non-admin or inactive
    IF p_admin_profile_id IS NULL THEN
        RAISE EXCEPTION 'ADMIN_NOT_ACTIVE';
    END IF;

    SELECT pr.role, pr.status
    INTO v_admin_role, v_admin_status
    FROM public.profiles AS pr
    WHERE pr.id = p_admin_profile_id
    FOR UPDATE;

    IF v_admin_role IS NULL OR v_admin_role <> 'admin' OR v_admin_status IS NULL OR v_admin_status <> 'active' THEN
        RAISE EXCEPTION 'ADMIN_NOT_ACTIVE';
    END IF;

    -- 2. Validate input name and email independently
    IF p_name IS NULL OR pg_catalog.btrim(p_name) = '' THEN
        RAISE EXCEPTION 'INVALID_NAME';
    END IF;
    v_trimmed_name := pg_catalog.btrim(p_name);
    IF pg_catalog.length(v_trimmed_name) > 100 THEN
        RAISE EXCEPTION 'INVALID_NAME';
    END IF;

    IF p_email IS NULL OR pg_catalog.btrim(p_email) = '' THEN
        RAISE EXCEPTION 'INVALID_EMAIL';
    END IF;
    v_norm_email := pg_catalog.lower(pg_catalog.btrim(p_email));
    IF pg_catalog.length(v_norm_email) > 255 OR v_norm_email NOT LIKE '%_@__%.__%' THEN
        RAISE EXCEPTION 'INVALID_EMAIL';
    END IF;

    -- Validate class array input: null defaults empty, <= 100 elements, non-multidimensional, no null elements
    IF p_class_ids IS NULL THEN
        p_class_ids := '{}'::UUID[];
    END IF;

    IF pg_catalog.array_ndims(p_class_ids) IS NOT NULL AND pg_catalog.array_ndims(p_class_ids) > 1 THEN
        RAISE EXCEPTION 'INVALID_CLASS_ARRAY';
    END IF;

    IF pg_catalog.array_length(p_class_ids, 1) IS NOT NULL AND pg_catalog.array_length(p_class_ids, 1) > 100 THEN
        RAISE EXCEPTION 'INVALID_CLASS_ARRAY';
    END IF;

    IF pg_catalog.array_position(p_class_ids, NULL) IS NOT NULL THEN
        RAISE EXCEPTION 'INVALID_CLASS_ARRAY';
    END IF;

    -- 3. Lock matched Auth row for update with exact-one verification under concurrency
    -- Do not select/hash/output credentials; select password-presence boolean
    BEGIN
        SELECT
            au.id,
            au.email,
            au.email_confirmed_at,
            au.deleted_at,
            au.banned_until,
            au.is_anonymous,
            au.raw_app_meta_data,
            (au.encrypted_password IS NOT NULL AND au.encrypted_password <> '') AS has_password
        INTO STRICT
            v_auth_id,
            v_auth_email_actual,
            v_auth_confirmed_at,
            v_auth_deleted_at,
            v_auth_banned_until,
            v_auth_is_anonymous,
            v_auth_app_metadata,
            v_auth_has_password
        FROM auth.users AS au
        WHERE pg_catalog.lower(au.email) = v_norm_email
        FOR UPDATE;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RAISE EXCEPTION 'AUTH_USER_NOT_FOUND';
        WHEN TOO_MANY_ROWS THEN
            RAISE EXCEPTION 'AUTH_USER_DUPLICATE_EMAIL';
    END;

    IF pg_catalog.lower(v_auth_email_actual) <> v_norm_email THEN
        RAISE EXCEPTION 'AUTH_USER_NOT_FOUND';
    END IF;

    -- Assert still confirmed, password, nondeleted, nonbanned, nonanonymous
    IF v_auth_deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'AUTH_USER_DELETED';
    END IF;

    IF v_auth_banned_until IS NOT NULL AND v_auth_banned_until > pg_catalog.now() THEN
        RAISE EXCEPTION 'AUTH_USER_BANNED';
    END IF;

    IF v_auth_is_anonymous IS TRUE THEN
        RAISE EXCEPTION 'AUTH_USER_ANONYMOUS';
    END IF;

    IF v_auth_confirmed_at IS NULL THEN
        RAISE EXCEPTION 'AUTH_USER_UNCONFIRMED';
    END IF;

    IF v_auth_has_password IS NOT TRUE THEN
        RAISE EXCEPTION 'AUTH_USER_NO_PASSWORD';
    END IF;

    -- Reject trusted app_metadata role conflicts, never trust user metadata
    IF v_auth_app_metadata IS NOT NULL AND
       v_auth_app_metadata->>'role' IS NOT NULL AND
       v_auth_app_metadata->>'role' <> 'teacher' THEN
        RAISE EXCEPTION 'AUTH_USER_CONFLICTING_ROLE';
    END IF;

    -- 5. Verify NO existing private.actor_auth mapping for auth_user_id or auth_email
    IF EXISTS (
        SELECT 1 FROM private.actor_auth AS aa
        WHERE aa.auth_user_id = v_auth_id OR pg_catalog.lower(aa.auth_email) = v_norm_email
    ) THEN
        RAISE EXCEPTION 'TEACHER_ALREADY_MAPPED';
    END IF;

    -- 6. Verify NO existing public.profiles with same normalized email
    IF EXISTS (
        SELECT 1 FROM public.profiles AS pr
        WHERE pg_catalog.lower(pr.email) = v_norm_email
    ) THEN
        RAISE EXCEPTION 'PROFILE_EMAIL_EXISTS';
    END IF;

    -- 7. Generate random profile UUID different from Auth UUID
    v_profile_id := pg_catalog.gen_random_uuid();
    WHILE v_profile_id = v_auth_id LOOP
        v_profile_id := pg_catalog.gen_random_uuid();
    END LOOP;

    -- 8. Determine fixture flag: true ONLY for @example.invalid
    v_is_fixture := (v_norm_email LIKE '%@example.invalid');

    -- 9. Insert teacher profile
    INSERT INTO public.profiles (
        id,
        role,
        full_name,
        email,
        status,
        session_version,
        is_fixture,
        created_at,
        updated_at
    ) VALUES (
        v_profile_id,
        'teacher',
        v_trimmed_name,
        v_norm_email,
        'active',
        1,
        v_is_fixture,
        pg_catalog.now(),
        pg_catalog.now()
    );

    -- 10. Plain INSERT for private mapping, no upsert
    INSERT INTO private.actor_auth (
        auth_user_id,
        profile_id,
        role,
        auth_email,
        session_version,
        invite_pending,
        invite_issued_at,
        invite_claimed_at,
        created_at,
        updated_at
    ) VALUES (
        v_auth_id,
        v_profile_id,
        'teacher',
        v_norm_email,
        1,
        false,
        NULL,
        NULL,
        pg_catalog.now(),
        pg_catalog.now()
    );

    -- 11. Class assignment atomic integration under canonical sorted class lock + row lock
    -- Initial connection MUST NOT replace an already-assigned teacher.
    -- Verify active and NO class_teachers before assigning (error code CLASS_ALREADY_ASSIGNED)
    -- All selected classes checked and assigned in same transaction; failure rolls back everything.
    IF p_class_ids IS NOT NULL AND pg_catalog.array_length(p_class_ids, 1) > 0 THEN
        FOR v_cid IN
            SELECT DISTINCT u.class_id FROM pg_catalog.unnest(p_class_ids) AS u(class_id) ORDER BY u.class_id
        LOOP
            IF v_cid IS NOT NULL THEN
                -- Canonical advisory lock
                PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('class:' || v_cid::text));

                -- Row lock on classes table
                SELECT c.status
                INTO v_class_status
                FROM public.classes AS c
                WHERE c.id = v_cid
                FOR UPDATE;

                IF v_class_status IS NULL OR v_class_status <> 'active' THEN
                    RAISE EXCEPTION 'CLASS_NOT_FOUND: %', v_cid;
                END IF;

                -- Verify NO teacher is already assigned to this class
                IF EXISTS (
                    SELECT 1
                    FROM public.class_teachers AS ct
                    WHERE ct.class_id = v_cid
                ) THEN
                    RAISE EXCEPTION 'CLASS_ALREADY_ASSIGNED';
                END IF;

                -- Assign teacher
                PERFORM public.m2_assign_class_teacher(p_admin_profile_id, v_cid, v_profile_id);
                v_assigned_ids := pg_catalog.array_append(v_assigned_ids, v_cid);
            END IF;
        END LOOP;
    END IF;

    -- 12. Return public-safe fields only (no password, no native auth UUID)
    RETURN QUERY SELECT
        v_profile_id AS id,
        v_trimmed_name AS full_name,
        v_norm_email AS email,
        'teacher'::TEXT AS role,
        'active'::TEXT AS status,
        v_assigned_ids AS assigned_class_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.m2_link_existing_teacher(UUID, TEXT, TEXT, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m2_link_existing_teacher(UUID, TEXT, TEXT, UUID[]) TO service_role;
