-- ============================================================================
-- MINDX LEARN — M2 RPC Runtime Fix (A8 Focused)
-- Migration: 20261014161419_m2_rpc_runtime_fix.sql
-- Fixes: ERROR 42702 column reference "id" ambiguous PL/pgSQL variable or table column
-- Root Cause: RETURNS TABLE output column names (id, code, name, status, etc.)
-- collides with unqualified column references in PL/pgSQL function queries.
-- Fix: Fully explicit table aliases and column qualifications (p, c, ct).
-- ============================================================================

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
    -- 1. Validate active admin (explicit p alias to avoid collision with output cols 'id' & 'status')
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = p_admin_profile_id AND p.role = 'admin' AND p.status = 'active'
    ) THEN
        RAISE EXCEPTION 'Admin profile is not active admin';
    END IF;

    -- 2. Validate code and name
    IF p_code IS NULL OR trim(p_code) = '' OR p_name IS NULL OR trim(p_name) = '' THEN
        RAISE EXCEPTION 'Class code and name cannot be empty';
    END IF;

    -- 3. Validate target teacher if provided (explicit p alias to avoid collision with output cols 'id' & 'status')
    IF p_teacher_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = p_teacher_id AND p.role = 'teacher' AND p.status = 'active'
        ) THEN
            RAISE EXCEPTION 'Teacher profile % is not an active teacher', p_teacher_id;
        END IF;
    END IF;

    -- 4. Create or Update
    IF v_class_id IS NULL THEN
        v_class_id := gen_random_uuid();

        -- Lock code namespace
        PERFORM pg_advisory_xact_lock(hashtext('class_code:' || lower(trim(p_code))));

        -- Explicit c alias to avoid collision with output col 'code'
        IF EXISTS (SELECT 1 FROM public.classes c WHERE lower(c.code) = lower(trim(p_code))) THEN
            RAISE EXCEPTION 'Class code already exists: %', trim(p_code);
        END IF;

        INSERT INTO public.classes AS c (id, code, name, course_id, status, is_14_sessions_confirmed, is_fixture)
        VALUES (v_class_id, trim(p_code), trim(p_name), NULL, 'active', false, true)
        RETURNING c.* INTO v_class;

        IF p_teacher_id IS NOT NULL THEN
            INSERT INTO public.class_teachers (class_id, teacher_profile_id)
            VALUES (v_class_id, p_teacher_id);
        END IF;
    ELSE
        -- Canonical class lock
        PERFORM pg_advisory_xact_lock(hashtext('class:' || v_class_id::text));

        -- Explicit c alias to avoid collision with output col 'id'
        SELECT c.* INTO v_class
        FROM public.classes c
        WHERE c.id = v_class_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Class not found: %', v_class_id;
        END IF;

        -- Check code uniqueness if changed (explicit c alias to avoid collision with output cols 'code' and 'id')
        IF lower(v_class.code) <> lower(trim(p_code)) THEN
            PERFORM pg_advisory_xact_lock(hashtext('class_code:' || lower(trim(p_code))));
            IF EXISTS (SELECT 1 FROM public.classes c WHERE lower(c.code) = lower(trim(p_code)) AND c.id <> v_class_id) THEN
                RAISE EXCEPTION 'Class code already exists: %', trim(p_code);
            END IF;
        END IF;

        -- Explicit c alias on UPDATE and RETURNING
        UPDATE public.classes AS c
        SET code = trim(p_code),
            name = trim(p_name),
            updated_at = now()
        WHERE c.id = v_class_id
        RETURNING c.* INTO v_class;

        -- Atomic teacher assignment update: null clears assignment intentionally
        DELETE FROM public.class_teachers AS ct WHERE ct.class_id = v_class_id;
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
