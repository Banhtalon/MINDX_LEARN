-- ============================================================================
-- MINDX LEARN — Mốc 6 Scale (>1,000 Students) & 20-Student Shift Concurrency
-- Migration: 20261021180000_m6_rls_initplan_and_scale_indexes.sql
-- Purpose:
-- 1. Add composite indexes on public.profiles(role, status) and
--    public.students(current_class_id, status) for >1,000 student rosters.
-- 2. Wrap parameterless session RLS helpers (public.is_active_admin(),
--    public.current_role(), public.current_profile_id()) in scalar subqueries
--    `(SELECT ...)` across SELECT/ALL RLS policies so PostgreSQL evaluates them
--    once per statement via InitPlan instead of once per row across 1,000+ rows.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_role_status
    ON public.profiles(role, status);

CREATE INDEX IF NOT EXISTS idx_students_current_class_status
    ON public.students(current_class_id, status);

-- 1. PROFILES RLS (InitPlan-cached)
DROP POLICY IF EXISTS "admin_select_profiles" ON public.profiles;
DROP POLICY IF EXISTS "teacher_select_profiles" ON public.profiles;
DROP POLICY IF EXISTS "student_select_profiles" ON public.profiles;

CREATE POLICY "admin_select_profiles" ON public.profiles
    FOR SELECT TO authenticated
    USING ((SELECT public.is_active_admin()));

CREATE POLICY "teacher_select_profiles" ON public.profiles
    FOR SELECT TO authenticated
    USING (
        (SELECT public.current_role()) = 'teacher' AND (
            id = (SELECT public.current_profile_id())
            OR EXISTS (
                SELECT 1
                FROM public.students s
                JOIN public.classes c ON c.id = s.current_class_id
                JOIN public.class_teachers ct ON ct.class_id = s.current_class_id
                WHERE s.id = profiles.id
                  AND ct.teacher_profile_id = (SELECT public.current_profile_id())
                  AND s.status IN ('active', 'transferred')
                  AND c.status = 'active'
            )
        )
    );

CREATE POLICY "student_select_profiles" ON public.profiles
    FOR SELECT TO authenticated
    USING (
        (SELECT public.current_role()) = 'student'
        AND id = (SELECT public.current_profile_id())
    );

-- 2. CLASSES RLS (InitPlan-cached)
DROP POLICY IF EXISTS "admin_select_classes" ON public.classes;
DROP POLICY IF EXISTS "teacher_select_classes" ON public.classes;
DROP POLICY IF EXISTS "student_select_classes" ON public.classes;

CREATE POLICY "admin_select_classes" ON public.classes
    FOR SELECT TO authenticated
    USING ((SELECT public.is_active_admin()));

CREATE POLICY "teacher_select_classes" ON public.classes
    FOR SELECT TO authenticated
    USING (
        (SELECT public.current_role()) = 'teacher'
        AND status = 'active'
        AND public.is_teacher_of_class(id)
    );

CREATE POLICY "student_select_classes" ON public.classes
    FOR SELECT TO authenticated
    USING (
        (SELECT public.current_role()) = 'student'
        AND status = 'active'
        AND public.is_student_of_class(id)
    );

-- 3. CLASS_TEACHERS RLS (InitPlan-cached)
DROP POLICY IF EXISTS "admin_select_class_teachers" ON public.class_teachers;
DROP POLICY IF EXISTS "teacher_select_class_teachers" ON public.class_teachers;
DROP POLICY IF EXISTS "student_select_class_teachers" ON public.class_teachers;

CREATE POLICY "admin_select_class_teachers" ON public.class_teachers
    FOR SELECT TO authenticated
    USING ((SELECT public.is_active_admin()));

CREATE POLICY "teacher_select_class_teachers" ON public.class_teachers
    FOR SELECT TO authenticated
    USING (
        (SELECT public.current_role()) = 'teacher'
        AND teacher_profile_id = (SELECT public.current_profile_id())
        AND public.is_teacher_of_class(class_id)
    );

CREATE POLICY "student_select_class_teachers" ON public.class_teachers
    FOR SELECT TO authenticated
    USING (
        (SELECT public.current_role()) = 'student'
        AND public.is_student_of_class(class_id)
    );

-- 4. STUDENTS RLS (InitPlan-cached)
DROP POLICY IF EXISTS "admin_select_students" ON public.students;
DROP POLICY IF EXISTS "teacher_select_students" ON public.students;
DROP POLICY IF EXISTS "student_select_students" ON public.students;

CREATE POLICY "admin_select_students" ON public.students
    FOR SELECT TO authenticated
    USING ((SELECT public.is_active_admin()));

CREATE POLICY "teacher_select_students" ON public.students
    FOR SELECT TO authenticated
    USING (
        (SELECT public.current_role()) = 'teacher'
        AND status IN ('active', 'transferred')
        AND public.is_teacher_of_class(current_class_id)
    );

CREATE POLICY "student_select_students" ON public.students
    FOR SELECT TO authenticated
    USING (
        (SELECT public.current_role()) = 'student'
        AND id = (SELECT public.current_profile_id())
    );

-- 5. COURSES RLS (InitPlan-cached, preserving teacher class assignment boundary)
DROP POLICY IF EXISTS "m3_courses_select_authenticated" ON public.courses;
DROP POLICY IF EXISTS "m3_courses_select_staff" ON public.courses;
DROP POLICY IF EXISTS "m3_courses_select_student" ON public.courses;
DROP POLICY IF EXISTS "m3_courses_admin_write" ON public.courses;

CREATE POLICY "m3_courses_select_authenticated" ON public.courses
    FOR SELECT TO authenticated
    USING (
        (SELECT public.is_active_admin())
        OR (
            (SELECT public.current_role()) = 'teacher'
            AND EXISTS (
                SELECT 1 FROM public.classes c
                JOIN public.class_teachers ct ON ct.class_id = c.id
                WHERE ct.teacher_profile_id = (SELECT public.current_profile_id())
                  AND c.course_id = courses.id
                  AND c.status = 'active'
            )
        )
        OR (
            (SELECT public.current_role()) = 'student'
            AND EXISTS (
                SELECT 1
                FROM public.students s
                JOIN public.classes c ON c.id = s.current_class_id
                WHERE s.id = (SELECT public.current_profile_id())
                  AND c.course_id = courses.id
                  AND s.status IN ('active', 'transferred')
                  AND c.status = 'active'
            )
        )
    );

CREATE POLICY "m3_courses_admin_write" ON public.courses
    FOR ALL TO authenticated
    USING ((SELECT public.is_active_admin()))
    WITH CHECK ((SELECT public.is_active_admin()));

-- 6. LESSONS RLS (InitPlan-cached)
DROP POLICY IF EXISTS "m3_lessons_admin_select" ON public.lessons;
DROP POLICY IF EXISTS "m3_lessons_teacher_select" ON public.lessons;
DROP POLICY IF EXISTS "m3_lessons_student_select" ON public.lessons;
DROP POLICY IF EXISTS "m3_lessons_admin_write" ON public.lessons;

CREATE POLICY "m3_lessons_admin_select" ON public.lessons
    FOR SELECT TO authenticated
    USING ((SELECT public.is_active_admin()));

CREATE POLICY "m3_lessons_teacher_select" ON public.lessons
    FOR SELECT TO authenticated
    USING (
        (SELECT public.current_role()) = 'teacher'
        AND EXISTS (
            SELECT 1 FROM public.class_teachers ct
            JOIN public.classes c ON c.id = ct.class_id
            WHERE ct.teacher_profile_id = (SELECT public.current_profile_id())
              AND c.course_id = lessons.course_id
              AND c.status = 'active'
        )
    );

CREATE POLICY "m3_lessons_student_select" ON public.lessons
    FOR SELECT TO authenticated
    USING (
        (SELECT public.current_role()) = 'student'
        AND status = 'published'
        AND EXISTS (
            SELECT 1 FROM public.students s
            JOIN public.classes c ON c.id = s.current_class_id
            WHERE s.id = (SELECT public.current_profile_id())
              AND c.course_id = lessons.course_id
              AND s.status IN ('active', 'transferred')
              AND c.status = 'active'
        )
    );

CREATE POLICY "m3_lessons_admin_write" ON public.lessons
    FOR ALL TO authenticated
    USING ((SELECT public.is_active_admin()))
    WITH CHECK ((SELECT public.is_active_admin()));

-- 7. QUIZ RESULTS RLS (InitPlan-cached)
DROP POLICY IF EXISTS "m3_quiz_results_admin_select" ON public.quiz_results;
DROP POLICY IF EXISTS "m3_quiz_results_teacher_select" ON public.quiz_results;
DROP POLICY IF EXISTS "m3_quiz_results_student_select" ON public.quiz_results;

CREATE POLICY "m3_quiz_results_admin_select" ON public.quiz_results
    FOR SELECT TO authenticated
    USING ((SELECT public.is_active_admin()));

CREATE POLICY "m3_quiz_results_teacher_select" ON public.quiz_results
    FOR SELECT TO authenticated
    USING (
        (SELECT public.current_role()) = 'teacher'
        AND EXISTS (
            SELECT 1 FROM public.students s
            JOIN public.classes c ON c.id = s.current_class_id
            JOIN public.class_teachers ct ON ct.class_id = s.current_class_id
            WHERE s.id = quiz_results.student_id
              AND quiz_results.class_id = s.current_class_id
              AND ct.teacher_profile_id = (SELECT public.current_profile_id())
              AND s.status IN ('active', 'transferred')
              AND c.status = 'active'
        )
    );

CREATE POLICY "m3_quiz_results_student_select" ON public.quiz_results
    FOR SELECT TO authenticated
    USING (
        (SELECT public.current_role()) = 'student'
        AND student_id = (SELECT public.current_profile_id())
        AND EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.id = (SELECT public.current_profile_id())
              AND s.current_class_id = quiz_results.class_id
              AND s.status IN ('active', 'transferred')
        )
    );

-- 8. PRACTICE SUBMISSIONS RLS (InitPlan-cached)
DROP POLICY IF EXISTS "m3_submissions_admin_select" ON public.practice_submissions;
DROP POLICY IF EXISTS "m3_submissions_teacher_select" ON public.practice_submissions;
DROP POLICY IF EXISTS "m3_submissions_student_select" ON public.practice_submissions;

CREATE POLICY "m3_submissions_admin_select" ON public.practice_submissions
    FOR SELECT TO authenticated
    USING ((SELECT public.is_active_admin()));

CREATE POLICY "m3_submissions_teacher_select" ON public.practice_submissions
    FOR SELECT TO authenticated
    USING (
        (SELECT public.current_role()) = 'teacher'
        AND EXISTS (
            SELECT 1 FROM public.students s
            JOIN public.classes c ON c.id = s.current_class_id
            JOIN public.class_teachers ct ON ct.class_id = s.current_class_id
            WHERE s.id = practice_submissions.student_id
              AND practice_submissions.class_id = s.current_class_id
              AND ct.teacher_profile_id = (SELECT public.current_profile_id())
              AND s.status IN ('active', 'transferred')
              AND c.status = 'active'
        )
    );

CREATE POLICY "m3_submissions_student_select" ON public.practice_submissions
    FOR SELECT TO authenticated
    USING (
        (SELECT public.current_role()) = 'student'
        AND student_id = (SELECT public.current_profile_id())
        AND EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.id = (SELECT public.current_profile_id())
              AND s.current_class_id = practice_submissions.class_id
              AND s.status IN ('active', 'transferred')
        )
    );

-- 9. STORAGE INSERT PERMISSION COMPATIBILITY WITH SUPABASE STORAGE-API TWO-STEP INSERT/UPDATE
-- Supabase Storage API inserts into storage.objects with metadata = NULL before streaming to S3,
-- then updates metadata->>'size' upon stream completion. When p_object_size is NULL at the initial
-- INSERT trigger, validate against v_res.reserved_bytes (<= 2 MiB) and enforce exact metadata->>'size'
-- in m3_submit_practice.
CREATE OR REPLACE FUNCTION public.m3_check_storage_insert_permission(
    bucket_id TEXT,
    name TEXT,
    p_object_size BIGINT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, private, storage
AS $$
DECLARE
    v_parts TEXT[];
    v_student_id UUID;
    v_lesson_id UUID;
    v_clean_ext TEXT;
    v_res RECORD;
    v_cfg RECORD;
    v_baseline BIGINT := 0;
    v_hard_limit BIGINT := 838860800;
    v_used BIGINT := 0;
    v_other_reserved BIGINT := 0;
    v_effective_incoming BIGINT := 0;
BEGIN
    IF bucket_id IS DISTINCT FROM 'm3-practice-files' THEN
        RETURN FALSE;
    END IF;

    IF public.current_role() IS DISTINCT FROM 'student' THEN
        RETURN FALSE;
    END IF;

    v_parts := storage.foldername(name);
    IF array_length(v_parts, 1) < 2 THEN
        RETURN FALSE;
    END IF;

    BEGIN
        v_student_id := v_parts[1]::uuid;
        v_lesson_id := v_parts[2]::uuid;
    EXCEPTION WHEN OTHERS THEN
        RETURN FALSE;
    END;

    IF v_student_id IS DISTINCT FROM public.current_profile_id() THEN
        RETURN FALSE;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));
    PERFORM pg_advisory_xact_lock(hashtext('m5_storage_quota'));
    PERFORM pg_advisory_xact_lock(hashtext('reservation:' || v_student_id::text || ':' || v_lesson_id::text));

    v_clean_ext := pg_catalog.lower(storage.extension(name));
    IF v_clean_ext NOT IN ('zip', 'pdf', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'py', 'js', 'html', 'css', 'json', 'md', 'sb3') THEN
        RETURN FALSE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.students s
        JOIN public.classes c ON c.id = s.current_class_id
        JOIN public.lessons l ON l.course_id = c.course_id
        LEFT JOIN public.practice_submissions sub ON sub.student_id = s.id AND sub.lesson_id = l.id AND sub.class_id = c.id
        WHERE s.id = v_student_id
          AND s.status IN ('active', 'transferred')
          AND c.status = 'active'
          AND l.id = v_lesson_id
          AND l.status = 'published'
          AND l.has_practice = true
          AND l.practice_mode = 'file_allowed'
          AND (sub.id IS NULL OR sub.status <> 'approved' OR sub.can_resubmit = true)
        FOR KEY SHARE OF s
    ) THEN
        RETURN FALSE;
    END IF;

    SELECT * INTO v_res
    FROM public.m3_upload_reservations res
    WHERE res.object_path = name
      AND res.student_id = v_student_id
      AND res.status = 'reserved'
      AND res.consumed_at IS NULL
      AND res.released_at IS NULL
      AND res.expires_at > clock_timestamp()
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.m5_course_close_operations o
        WHERE o.class_id = v_res.class_id
          AND o.status IN ('deleting_storage', 'deleting_db', 'incomplete')
    ) THEN
        RETURN FALSE;
    END IF;

    IF v_res.reserved_bytes IS NULL OR v_res.reserved_bytes <= 0 OR v_res.reserved_bytes > 2097152 THEN
        RETURN FALSE;
    END IF;

    IF p_object_size IS NOT NULL AND (p_object_size <= 0 OR p_object_size > 2097152 OR p_object_size > v_res.reserved_bytes) THEN
        RETURN FALSE;
    END IF;

    SELECT * INTO v_cfg FROM public.m5_storage_quota_config WHERE id = 'default' LIMIT 1;
    IF NOT FOUND
       OR COALESCE(v_cfg.baseline_verified, false) = false
       OR COALESCE(v_cfg.environment_mode, 'unverified') = 'unverified'
    THEN
        RETURN FALSE;
    END IF;

    v_baseline := COALESCE(v_cfg.org_baseline_bytes, 0);
    v_hard_limit := LEAST(COALESCE(v_cfg.hard_limit_bytes, 838860800), 838860800);

    SELECT COALESCE(sum((metadata->>'size')::bigint), 0) INTO v_used
    FROM storage.objects;

    SELECT COALESCE(sum(reserved_bytes), 0) INTO v_other_reserved
    FROM public.m3_upload_reservations
    WHERE id <> v_res.id
      AND status IN ('reserved', 'claimed')
      AND consumed_at IS NULL
      AND released_at IS NULL
      AND expires_at > clock_timestamp();

    v_effective_incoming := COALESCE(p_object_size, v_res.reserved_bytes::bigint);

    IF (v_used + v_other_reserved + v_effective_incoming + v_baseline) > v_hard_limit THEN
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_check_storage_insert_permission(TEXT, TEXT, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.m3_check_storage_insert_permission(TEXT, TEXT, BIGINT) TO authenticated, service_role;
