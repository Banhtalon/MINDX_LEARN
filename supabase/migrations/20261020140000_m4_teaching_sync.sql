-- ============================================================================
-- MINDX LEARN — Mốc 4 Teaching Sync Atomic RPCs & Explicit Sync Markers
-- Migration: 20261020140000_m4_teaching_sync.sql
-- Purpose:
-- 1. Add explicit `m4_synced` boolean marker on `public.classes`, `public.profiles`,
--    and `public.students` so `reset-teaching-sync` only deletes records created
--    by M4 fixture sync and never deletes Admin-created classes (`is_fixture=true`).
-- 2. Execute `apply-teaching-sync` in a single atomic DB transaction (`m4_apply_teaching_sync`)
--    with row-level locking (`FOR UPDATE`) and optimistic concurrency checking on
--    `previousName` / `previousClassCode` so stale previews cannot overwrite newer server edits
--    and mid-flight DB errors roll back 100% of changes (zero orphan profiles/students/classes).
-- 3. Execute `reset-teaching-sync` in a single atomic DB transaction (`m4_reset_teaching_sync`).
-- ============================================================================

ALTER TABLE public.classes
    ADD COLUMN IF NOT EXISTS m4_synced BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS m4_synced BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.students
    ADD COLUMN IF NOT EXISTS m4_synced BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS m4_previous_full_name TEXT;

-- ============================================================================
-- 1. Atomic Apply Teaching Sync Fixture RPC (Admin only, single transaction)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.m4_apply_teaching_sync(
    p_admin_profile_id UUID,
    p_diff_report JSONB
)
RETURNS TABLE (
    added_students_count INT,
    updated_students_count INT,
    created_classes_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
#variable_conflict use_column
DECLARE
    v_item JSONB;
    v_code TEXT;
    v_name TEXT;
    v_next_name TEXT;
    v_prev_name TEXT;
    v_item_class_code TEXT;
    v_prev_class_code TEXT;
    v_curr_class_code TEXT;
    v_curr_stu_name TEXT;
    v_curr_prof_name TEXT;
    v_cls RECORD;
    v_stu RECORD;
    v_prof RECORD;
    v_encoded TEXT;
    v_ch TEXT;
    v_i INT;
    v_participant_id TEXT;
    v_new_id UUID;
    v_canonical_stu JSONB := '{
        "HS_ROB_002": {"name": "Phạm Quỳnh Chi (Đồng bộ M4)", "previousName": "Phạm Quỳnh Chi", "classCode": "ROB-K14-01"},
        "HS_ROB_M4_101": {"name": "Học Sinh Giả Lập M4-01", "classCode": "ROB-K14-01"},
        "HS_ROB_M4_102": {"name": "Học Sinh Giả Lập M4-02", "classCode": "ROB-K14-01"},
        "HS_ROB_M4_103": {"name": "Học Sinh Giả Lập M4-03", "classCode": "ROB-K14-02"},
        "HS_ROB_M4_104": {"name": "Học Sinh Giả Lập M4-04", "classCode": "ROB-K14-02"},
        "HS_ROB_M4_105": {"name": "Học Sinh Giả Lập M4-05", "classCode": "ROB-K14-03"},
        "HS_ROB_M4_106": {"name": "Học Sinh Giả Lập M4-06", "classCode": "ROB-K14-03"},
        "HS_ROB_M4_107": {"name": "Học Sinh Giả Lập M4-07", "classCode": "ROB-K14-M4-04"},
        "HS_ROB_M4_108": {"name": "Học Sinh Giả Lập M4-08", "classCode": "ROB-K14-M4-04"},
        "HS_WEB_M4_201": {"name": "Học Sinh Giả Web 01", "classCode": "WEB-K14-01"},
        "HS_GAM_M4_202": {"name": "Học Sinh Giả Game 02", "classCode": "GAM-K14-02"},
        "HS_WEB_M4_203": {"name": "Học Sinh Giả Web 03", "classCode": "WEB-K14-01"},
        "HS_WEB_M4_204": {"name": "Học Sinh Giả Web 04", "classCode": "WEB-K14-02"},
        "HS_PYT_M4_205": {"name": "Học Sinh Giả Python 05", "classCode": "PYT-K14-01"},
        "HS_PYT_M4_206": {"name": "Học Sinh Giả Python 06", "classCode": "PYT-K14-01"},
        "HS_UIX_M4_207": {"name": "Học Sinh Giả UIUX 07", "classCode": "UIX-K14-01"},
        "HS_UIX_M4_208": {"name": "Học Sinh Giả UIUX 08", "classCode": "UIX-K14-01"},
        "HS_DAT_M4_209": {"name": "Học Sinh Giả Data 09", "classCode": "DAT-K14-01"},
        "HS_DAT_M4_210": {"name": "Học Sinh Giả Data 10", "classCode": "DAT-K14-01"},
        "HS_GAM_M4_211": {"name": "Học Sinh Giả Game 11", "classCode": "GAM-K14-03"},
        "HS_GAM_M4_212": {"name": "Học Sinh Giả Game 12", "classCode": "GAM-K14-03"}
    }'::jsonb;
    v_canon_entry JSONB;
    v_added_students_count INT := 0;
    v_updated_students_count INT := 0;
    v_created_classes_count INT := 0;
BEGIN
    -- 1. Verify active Admin actor
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = p_admin_profile_id AND p.role = 'admin' AND p.status = 'active'
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN: Chỉ có Quản trị viên mới được áp dụng đồng bộ.';
    END IF;

    -- 2. Serialize M4 sync operations within transaction
    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));

    -- 3. Validate report payload and Mốc 4 synthetic fixture boundary
    IF p_diff_report IS NULL OR pg_catalog.jsonb_typeof(p_diff_report) <> 'object' THEN
        RAISE EXCEPTION 'INVALID_DIFF_REPORT: Báo cáo xem trước đồng bộ không hợp lệ.';
    END IF;

    IF COALESCE(p_diff_report->>'sourceMode', '') <> 'synthetic_fixture' THEN
        RAISE EXCEPTION 'REAL_ROSTER_APPLY_FORBIDDEN_IN_M4: Chốt chặn an toàn Mốc 4 — chỉ chấp nhận sourceMode=synthetic_fixture, tuyệt đối không áp dụng danh sách học sinh Teaching thật vào TEST.';
    END IF;

    -- 4. Create new classes (marked with m4_synced = true)
    IF pg_catalog.jsonb_typeof(p_diff_report->'newClassesToCreate') = 'array' THEN
        FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_diff_report->'newClassesToCreate') LOOP
            v_code := pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(COALESCE(v_item->>'code', '')), '\s+', ' ', 'g'));
            IF v_code = '' THEN
                CONTINUE;
            END IF;

            IF v_code NOT IN (
                'ROB-K14-01',
                'ROB-K14-02',
                'ROB-K14-03',
                'ROB-K14-M4-04',
                'WEB-K14-01',
                'WEB-K14-02',
                'GAM-K14-02',
                'GAM-K14-03',
                'PYT-K14-01',
                'UIX-K14-01',
                'DAT-K14-01'
            ) THEN
                RAISE EXCEPTION 'REAL_ROSTER_APPLY_FORBIDDEN_IN_M4: Mã lớp % không nằm trong bộ fixture mẫu Mốc 4 đã phê duyệt.', v_code;
            END IF;

            v_name := 'Lớp Robotics ' || v_code || ' (Mới đồng bộ — Chờ Admin gán khóa học)';
            IF pg_catalog.btrim(COALESCE(v_item->>'name', '')) <> ''
               AND pg_catalog.regexp_replace(pg_catalog.btrim(v_item->>'name'), '\s+', ' ', 'g') <> v_name THEN
                RAISE EXCEPTION 'REAL_ROSTER_APPLY_FORBIDDEN_IN_M4: Tên lớp của mã % không khớp tên chuẩn của bộ fixture mẫu Mốc 4.', v_code;
            END IF;

            PERFORM pg_advisory_xact_lock(hashtext('class_code:' || pg_catalog.lower(v_code)));

            SELECT c.* INTO v_cls
            FROM public.classes c
            WHERE pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(c.code), '\s+', ' ', 'g')) = v_code
            FOR UPDATE;

            IF NOT FOUND THEN
                INSERT INTO public.classes (
                    code,
                    name,
                    course_id,
                    status,
                    is_14_sessions_confirmed,
                    is_fixture,
                    m4_synced
                ) VALUES (
                    v_code,
                    v_name,
                    NULL,
                    'active',
                    false,
                    true,
                    true
                );

                v_created_classes_count := v_created_classes_count + 1;
            END IF;
        END LOOP;
    END IF;

    -- 5. Update existing active students with strict preview concurrency verification
    IF pg_catalog.jsonb_typeof(p_diff_report->'updated') = 'array' THEN
        FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_diff_report->'updated') LOOP
            v_code := pg_catalog.upper(pg_catalog.btrim(COALESCE(v_item->>'id', '')));
            v_next_name := pg_catalog.regexp_replace(pg_catalog.btrim(COALESCE(v_item->>'name', '')), '\s+', ' ', 'g');
            v_prev_name := pg_catalog.regexp_replace(pg_catalog.btrim(COALESCE(v_item->>'previousName', '')), '\s+', ' ', 'g');
            v_item_class_code := pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(COALESCE(v_item->>'classCode', '')), '\s+', ' ', 'g'));
            v_prev_class_code := pg_catalog.upper(
                pg_catalog.regexp_replace(pg_catalog.btrim(COALESCE(v_item->>'previousClassCode', '')), '\s+', ' ', 'g')
            );

            IF v_code = '' OR v_next_name = '' OR v_prev_name = '' OR v_item_class_code = '' OR v_prev_class_code = '' THEN
                RAISE EXCEPTION 'INVALID_DIFF_REPORT: Bản ghi cập nhật thiếu id, name, previousName, classCode hoặc previousClassCode.';
            END IF;

            v_canon_entry := v_canonical_stu->v_code;
            IF v_canon_entry IS NULL
               OR COALESCE(v_canon_entry->>'previousName', '') = ''
               OR COALESCE(v_canon_entry->>'name', '') <> v_next_name
               OR COALESCE(v_canon_entry->>'previousName', '') <> v_prev_name
               OR COALESCE(v_canon_entry->>'classCode', '') <> v_item_class_code
               OR COALESCE(v_canon_entry->>'classCode', '') <> v_prev_class_code THEN
                RAISE EXCEPTION 'REAL_ROSTER_APPLY_FORBIDDEN_IN_M4: Bản ghi cập nhật % không khớp bộ fixture mẫu Mốc 4 đã phê duyệt.', v_code;
            END IF;

            SELECT s.* INTO v_stu
            FROM public.students s
            WHERE pg_catalog.upper(pg_catalog.btrim(s.student_code)) = v_code
            FOR UPDATE;

            IF NOT FOUND OR v_stu.status = 'archived' THEN
                RAISE EXCEPTION 'STALE_PREVIEW_CONFLICT: Hồ sơ học sinh % không tồn tại hoặc đã lưu trữ sau thời điểm xem trước.', v_code;
            END IF;

            SELECT p.* INTO v_prof
            FROM public.profiles p
            WHERE p.id = v_stu.id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'STALE_PREVIEW_CONFLICT: Không tìm thấy tài khoản hồ sơ của học sinh %.', v_code;
            END IF;

            SELECT c.* INTO v_cls
            FROM public.classes c
            WHERE c.id = v_stu.current_class_id
            FOR SHARE;

            v_curr_class_code := pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(COALESCE(v_cls.code, '')), '\s+', ' ', 'g'));
            IF v_curr_class_code = '' OR v_curr_class_code <> v_item_class_code OR v_curr_class_code <> v_prev_class_code THEN
                RAISE EXCEPTION 'STALE_PREVIEW_CONFLICT: Lớp hiện tại của học sinh % đã thay đổi sau thời điểm xem trước.', v_code;
            END IF;

            v_curr_stu_name := pg_catalog.regexp_replace(pg_catalog.btrim(COALESCE(v_stu.full_name, '')), '\s+', ' ', 'g');
            v_curr_prof_name := pg_catalog.regexp_replace(pg_catalog.btrim(COALESCE(v_prof.full_name, '')), '\s+', ' ', 'g');

            IF v_curr_stu_name = v_next_name AND v_curr_prof_name = v_next_name THEN
                CONTINUE;
            END IF;

            IF v_curr_stu_name <> v_prev_name OR v_curr_prof_name <> v_prev_name THEN
                RAISE EXCEPTION 'STALE_PREVIEW_CONFLICT: Họ tên học sinh % trên máy chủ đã thay đổi sau thời điểm xem trước.', v_code;
            END IF;

            UPDATE public.students AS s
            SET full_name = v_next_name,
                m4_previous_full_name = COALESCE(s.m4_previous_full_name, v_curr_stu_name),
                updated_at = now()
            WHERE s.id = v_stu.id;

            UPDATE public.profiles AS p
            SET full_name = v_next_name,
                updated_at = now()
            WHERE p.id = v_stu.id;

            v_updated_students_count := v_updated_students_count + 1;
        END LOOP;
    END IF;

    -- 6. Insert newly added students (marked with m4_synced = true, never auto-issuing PINs)
    IF pg_catalog.jsonb_typeof(p_diff_report->'added') = 'array' THEN
        FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_diff_report->'added') LOOP
            v_code := pg_catalog.upper(pg_catalog.btrim(COALESCE(v_item->>'id', '')));
            v_next_name := pg_catalog.regexp_replace(pg_catalog.btrim(COALESCE(v_item->>'name', '')), '\s+', ' ', 'g');
            v_item_class_code := pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(COALESCE(v_item->>'classCode', '')), '\s+', ' ', 'g'));

            IF v_code = '' OR v_next_name = '' OR v_item_class_code = '' THEN
                RAISE EXCEPTION 'INVALID_DIFF_REPORT: Bản ghi thêm mới thiếu id, name hoặc classCode.';
            END IF;

            v_canon_entry := v_canonical_stu->v_code;
            IF v_canon_entry IS NULL
               OR COALESCE(v_canon_entry->>'previousName', '') <> ''
               OR COALESCE(v_canon_entry->>'name', '') <> v_next_name
               OR COALESCE(v_canon_entry->>'classCode', '') <> v_item_class_code THEN
                RAISE EXCEPTION 'REAL_ROSTER_APPLY_FORBIDDEN_IN_M4: Bản ghi thêm mới % không nằm trong bộ fixture mẫu Mốc 4 đã phê duyệt.', v_code;
            END IF;

            SELECT s.* INTO v_stu
            FROM public.students s
            WHERE pg_catalog.upper(pg_catalog.btrim(s.student_code)) = v_code
            FOR UPDATE;

            IF FOUND THEN
                CONTINUE;
            END IF;

            SELECT c.* INTO v_cls
            FROM public.classes c
            WHERE pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(c.code), '\s+', ' ', 'g')) = v_item_class_code
            FOR UPDATE;

            IF NOT FOUND OR v_cls.status <> 'active' THEN
                RAISE EXCEPTION 'STALE_PREVIEW_CONFLICT: Lớp đích % không tồn tại hoặc không còn hoạt động.', v_item_class_code;
            END IF;

            v_encoded := '';
            FOR v_i IN 1..pg_catalog.char_length(v_code) LOOP
                v_ch := pg_catalog.substr(v_code, v_i, 1);
                IF v_ch ~ '^[A-Za-z0-9]$' THEN
                    v_encoded := v_encoded || pg_catalog.lower(v_ch);
                ELSE
                    v_encoded := v_encoded || '_x' || pg_catalog.lpad(pg_catalog.to_hex(pg_catalog.ascii(v_ch)), 4, '0') || '_';
                END IF;
            END LOOP;
            v_participant_id := 'part_sync_' || v_encoded;

            IF EXISTS (SELECT 1 FROM public.students s WHERE s.participant_id = v_participant_id) THEN
                RAISE EXCEPTION 'INTERNAL_ID_COLLISION: Xung đột mã định danh participant_id (%) cho học sinh %.', v_participant_id, v_code;
            END IF;

            IF EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE pg_catalog.upper(pg_catalog.btrim(COALESCE(p.student_code, ''))) = v_code
            ) THEN
                RAISE EXCEPTION 'INTERNAL_ID_COLLISION: Mã học sinh % đã tồn tại trong bảng profiles.', v_code;
            END IF;

            v_new_id := gen_random_uuid();

            INSERT INTO public.profiles (
                id,
                role,
                full_name,
                student_code,
                status,
                session_version,
                is_fixture,
                m4_synced
            ) VALUES (
                v_new_id,
                'student',
                v_next_name,
                v_code,
                'active',
                1,
                true,
                true
            );

            INSERT INTO public.students (
                id,
                participant_id,
                student_code,
                full_name,
                current_class_id,
                original_class_id,
                pin_issued_at,
                status,
                notes,
                is_fixture,
                m4_synced
            ) VALUES (
                v_new_id,
                v_participant_id,
                v_code,
                v_next_name,
                v_cls.id,
                v_cls.id,
                NULL,
                'active',
                'Đồng bộ từ fixture DataTables Mốc 4 (Chờ Admin cấp mã PIN riêng)',
                true,
                true
            );

            v_added_students_count := v_added_students_count + 1;
        END LOOP;
    END IF;

    RETURN QUERY
    SELECT v_added_students_count, v_updated_students_count, v_created_classes_count;
END;
$$;

REVOKE ALL ON FUNCTION public.m4_apply_teaching_sync(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m4_apply_teaching_sync(UUID, JSONB) TO service_role;

-- ============================================================================
-- 2. Durable M4 Storage Cleanup Queue & Atomic Reset Teaching Sync Fixture RPC
-- ============================================================================
CREATE TABLE IF NOT EXISTS private.m4_storage_cleanup_queue (
    object_path TEXT PRIMARY KEY,
    bucket_id TEXT NOT NULL DEFAULT 'm3-practice-files',
    student_id UUID,
    queued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE private.m4_storage_cleanup_queue FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE private.m4_storage_cleanup_queue TO service_role;

DROP FUNCTION IF EXISTS public.m4_reset_teaching_sync(UUID);

CREATE OR REPLACE FUNCTION public.m4_reset_teaching_sync(
    p_admin_profile_id UUID
)
RETURNS TABLE (
    reset_ok BOOLEAN,
    cleanup_paths TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, storage, pg_catalog
AS $$
#variable_conflict use_column
DECLARE
    v_cleanup_paths TEXT[] := '{}'::TEXT[];
BEGIN
    -- 1. Verify active Admin actor
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = p_admin_profile_id AND p.role = 'admin' AND p.status = 'active'
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN: Chỉ có Quản trị viên mới được khôi phục dữ liệu mẫu Mốc 4.';
    END IF;

    -- 2. Serialize M4 sync operations within transaction
    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));

    -- 3. Enqueue storage object paths in m3-practice-files belonging ONLY to M4-synced students
    --    BEFORE cascade-deleting M4-synced students/profiles so paths are durably retained if storage removal fails.
    INSERT INTO private.m4_storage_cleanup_queue (object_path, bucket_id, student_id, queued_at)
    SELECT DISTINCT candidate.object_path, 'm3-practice-files', candidate.student_id, now()
    FROM (
        SELECT ps.content AS object_path, ps.student_id AS student_id
        FROM public.practice_submissions ps
        JOIN public.profiles p ON p.id = ps.student_id
        WHERE ps.type = 'file'
          AND ps.content IS NOT NULL
          AND pg_catalog.btrim(ps.content) <> ''
          AND p.role = 'student'
          AND p.m4_synced = true
          AND ps.content LIKE (p.id::text || '/%')
        UNION
        SELECT r.object_path AS object_path, r.student_id AS student_id
        FROM public.m3_upload_reservations r
        JOIN public.students s ON s.id = r.student_id
        WHERE r.object_path IS NOT NULL
          AND pg_catalog.btrim(r.object_path) <> ''
          AND s.m4_synced = true
          AND r.object_path LIKE (s.id::text || '/%')
        UNION
        SELECT o.name AS object_path, p.id AS student_id
        FROM storage.objects o
        JOIN public.profiles p ON o.name LIKE (p.id::text || '/%')
        WHERE o.bucket_id = 'm3-practice-files'
          AND p.role = 'student'
          AND p.m4_synced = true
    ) AS candidate
    WHERE NOT EXISTS (
        SELECT 1 FROM public.practice_submissions sub
        JOIN public.profiles p_keep ON p_keep.id = sub.student_id
        WHERE sub.type = 'file'
          AND sub.content = candidate.object_path
          AND p_keep.m4_synced = false
    )
    ON CONFLICT (object_path) DO NOTHING;

    -- 4. Remove ONLY M4-synced students and M4-synced student profiles atomically
    DELETE FROM public.students AS s
    WHERE s.m4_synced = true;

    DELETE FROM public.profiles AS p
    WHERE p.role = 'student'
      AND p.m4_synced = true;

    -- 5. Restore previous names ONLY for students whose names were updated by M4 sync
    UPDATE public.profiles AS p
    SET full_name = s.m4_previous_full_name,
        updated_at = now()
    FROM public.students AS s
    WHERE p.id = s.id
      AND s.m4_previous_full_name IS NOT NULL;

    UPDATE public.students AS s
    SET full_name = s.m4_previous_full_name,
        m4_previous_full_name = NULL,
        updated_at = now()
    WHERE s.m4_previous_full_name IS NOT NULL;

    -- 6. Remove ONLY classes explicitly created by M4 sync (m4_synced = true) that have no students
    DELETE FROM public.classes AS c
    WHERE c.m4_synced = true
      AND NOT EXISTS (
          SELECT 1 FROM public.students s
          WHERE s.current_class_id = c.id OR s.original_class_id = c.id
      );

    -- 7. Return all pending M4 storage paths from the durable queue (including any retained from a prior failed cleanup)
    SELECT COALESCE(pg_catalog.array_agg(q.object_path ORDER BY q.queued_at ASC, q.object_path ASC), '{}'::TEXT[])
    INTO v_cleanup_paths
    FROM private.m4_storage_cleanup_queue q
    WHERE q.bucket_id = 'm3-practice-files';

    RETURN QUERY
    SELECT true, COALESCE(v_cleanup_paths, '{}'::TEXT[]);
END;
$$;

REVOKE ALL ON FUNCTION public.m4_reset_teaching_sync(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m4_reset_teaching_sync(UUID) TO service_role;

-- ============================================================================
-- 3. Acknowledge & Prune Completed M4 Storage Cleanup Queue Items
-- ============================================================================
CREATE OR REPLACE FUNCTION public.m4_ack_storage_cleanup(
    p_admin_profile_id UUID,
    p_paths TEXT[]
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, storage, pg_catalog
AS $$
#variable_conflict use_column
DECLARE
    v_remaining_count INT := 0;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = p_admin_profile_id AND p.role = 'admin' AND p.status = 'active'
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN: Chỉ có Quản trị viên mới được xác nhận dọn kho lưu trữ Mốc 4.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));

    IF p_paths IS NULL OR pg_catalog.array_length(p_paths, 1) IS NULL THEN
        RETURN 0;
    END IF;

    DELETE FROM private.m4_storage_cleanup_queue AS q
    WHERE q.bucket_id = 'm3-practice-files'
      AND q.object_path = ANY(p_paths)
      AND NOT EXISTS (
          SELECT 1 FROM storage.objects o
          WHERE o.bucket_id = 'm3-practice-files'
            AND o.name = q.object_path
      );

    -- Count any requested path still remaining in either the cleanup queue or storage.objects.
    -- Paths already cleaned and acknowledged by a concurrent reset call are counted as satisfied.
    SELECT count(DISTINCT u.p)::INT INTO v_remaining_count
    FROM pg_catalog.unnest(p_paths) AS u(p)
    WHERE EXISTS (
        SELECT 1 FROM private.m4_storage_cleanup_queue q
        WHERE q.bucket_id = 'm3-practice-files'
          AND q.object_path = u.p
    )
    OR EXISTS (
        SELECT 1 FROM storage.objects o
        WHERE o.bucket_id = 'm3-practice-files'
          AND o.name = u.p
    );

    RETURN GREATEST(0, COALESCE(pg_catalog.array_length(p_paths, 1), 0) - v_remaining_count);
END;
$$;

REVOKE ALL ON FUNCTION public.m4_ack_storage_cleanup(UUID, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m4_ack_storage_cleanup(UUID, TEXT[]) TO service_role;

-- 6. Atomic RPC for update-student: updates public.students and public.profiles
-- in a single transaction under m4_teaching_sync + student advisory locks so
-- manual admin edits never interleave with M4 reset/apply or leave diverged names.
CREATE OR REPLACE FUNCTION public.m4_update_student(
    p_admin_profile_id UUID,
    p_student_id UUID,
    p_full_name TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_update_name BOOLEAN DEFAULT FALSE,
    p_update_notes BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_name TEXT := regexp_replace(btrim(COALESCE(p_full_name, '')), '\s+', ' ', 'g');
    v_clean_notes TEXT := btrim(COALESCE(p_notes, ''));
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = p_admin_profile_id AND p.role = 'admin' AND p.status = 'active'
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN: Chỉ có Quản trị viên mới được cập nhật thông tin học sinh.';
    END IF;

    IF p_student_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Mã học sinh không hợp lệ.';
    END IF;

    -- Serialize with M4 teaching sync apply/reset and per-student mutations
    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));
    PERFORM pg_advisory_xact_lock(hashtext('student:' || p_student_id::text));

    IF NOT EXISTS (
        SELECT 1 FROM public.students s WHERE s.id = p_student_id FOR UPDATE
    ) THEN
        RAISE EXCEPTION 'NOT_FOUND: Không tìm thấy học sinh.';
    END IF;

    IF p_update_name AND v_clean_name = '' THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Họ tên học sinh không được để trống.';
    END IF;

    UPDATE public.students s
    SET full_name = CASE WHEN p_update_name THEN v_clean_name ELSE s.full_name END,
        notes = CASE WHEN p_update_notes THEN v_clean_notes ELSE s.notes END,
        m4_previous_full_name = CASE
            WHEN p_update_name
                 AND regexp_replace(btrim(COALESCE(s.full_name, '')), '\s+', ' ', 'g') <> v_clean_name
            THEN NULL
            ELSE s.m4_previous_full_name
        END,
        updated_at = now()
    WHERE s.id = p_student_id;

    IF p_update_name THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles p WHERE p.id = p_student_id FOR UPDATE
        ) THEN
            RAISE EXCEPTION 'NOT_FOUND: Không tìm thấy hồ sơ định danh của học sinh.';
        END IF;

        UPDATE public.profiles p
        SET full_name = v_clean_name,
            updated_at = now()
        WHERE p.id = p_student_id;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.m4_update_student(UUID, UUID, TEXT, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m4_update_student(UUID, UUID, TEXT, TEXT, BOOLEAN, BOOLEAN) TO service_role;

-- 7. Serialize Storage INSERT permission for m3-practice-files with m4_teaching_sync lock
-- so an in-flight student upload cannot commit after m4_reset_teaching_sync + m4_ack_storage_cleanup
-- and leave an orphaned file in storage.objects.
CREATE OR REPLACE FUNCTION public.m3_check_storage_insert_permission(
    bucket_id TEXT,
    name TEXT
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

    -- 1. Acquire M4 teaching sync lock FIRST, then student+lesson reservation lock.
    -- This serializes the Storage INSERT transaction against m4_reset_teaching_sync:
    -- either the upload commits before reset (so reset queues & deletes the object),
    -- or reset commits first (deleting the student/reservation so FOR KEY SHARE / FOR UPDATE below returns FALSE).
    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));
    PERFORM pg_advisory_xact_lock(hashtext('reservation:' || v_student_id::text || ':' || v_lesson_id::text));

    -- 2. Extension check against allowlist
    v_clean_ext := pg_catalog.lower(storage.extension(name));
    IF v_clean_ext NOT IN ('zip', 'pdf', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'py', 'js', 'html', 'css', 'json', 'md', 'sb3') THEN
        RETURN FALSE;
    END IF;

    -- 3. Verify active student (FOR KEY SHARE re-evaluates latest committed row), class, and published lesson with practice
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

    -- 4. Verify exact unexpired reservation exists and is reserved (FOR UPDATE re-evaluates latest committed row)
    IF NOT EXISTS (
        SELECT 1
        FROM public.m3_upload_reservations res
        WHERE res.object_path = name
          AND res.student_id = v_student_id
          AND res.status = 'reserved'
          AND res.expires_at > now()
        FOR UPDATE
    ) THEN
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_check_storage_insert_permission(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.m3_check_storage_insert_permission(TEXT, TEXT) TO authenticated, service_role;

-- 8. Harden M3 upload reservation RPCs with NULL-safe IS DISTINCT FROM checks (R12-F1)
-- so revoked sessions (where current_role() / current_profile_id() return NULL) never bypass <> checks.
CREATE OR REPLACE FUNCTION public.m3_reserve_practice_upload(
    p_student_id UUID,
    p_lesson_id UUID,
    p_file_extension TEXT
)
RETURNS TABLE (
    reservation_id UUID,
    object_path TEXT,
    expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, extensions
AS $$
#variable_conflict use_column
DECLARE
    v_student RECORD;
    v_class RECORD;
    v_lesson RECORD;
    v_clean_ext TEXT;
    v_pending_count INT;
    v_res_id UUID := gen_random_uuid();
    v_token TEXT;
    v_path TEXT;
    v_expires TIMESTAMPTZ := now() + interval '10 minutes';
BEGIN
    IF public.current_role() IS DISTINCT FROM 'student'
       OR public.current_profile_id() IS DISTINCT FROM p_student_id THEN
        RAISE EXCEPTION 'FORBIDDEN: Chỉ học sinh sở hữu mới được đặt trước lượt tải tệp.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));
    PERFORM pg_advisory_xact_lock(hashtext('reservation:' || p_student_id::text || ':' || p_lesson_id::text));

    SELECT * INTO v_student
    FROM public.students s
    JOIN public.profiles p ON p.id = s.id
    WHERE s.id = p_student_id
      AND s.status IN ('active', 'transferred')
      AND p.status = 'active';

    IF NOT FOUND OR v_student.current_class_id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Học sinh không hoạt động hoặc chưa được phân vào lớp.';
    END IF;

    SELECT * INTO v_class
    FROM public.classes c
    WHERE c.id = v_student.current_class_id
      AND c.status = 'active';

    IF NOT FOUND OR v_class.course_id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Lớp học chưa kích hoạt hoặc chưa được gán khóa học.';
    END IF;

    SELECT * INTO v_lesson
    FROM public.lessons l
    WHERE l.id = p_lesson_id
      AND l.course_id = v_class.course_id
      AND l.status = 'published'
      AND l.has_practice = true
      AND l.practice_mode = 'file_allowed';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FORBIDDEN: Bài học không tồn tại, chưa xuất bản hoặc không cho phép nộp tệp.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.practice_submissions sub
        WHERE sub.student_id = p_student_id
          AND sub.lesson_id = p_lesson_id
          AND sub.class_id = v_student.current_class_id
          AND sub.status = 'approved'
          AND sub.can_resubmit = false
    ) THEN
        RAISE EXCEPTION 'CANNOT_RESUBMIT_APPROVED: Bài nộp đã được giáo viên duyệt Đạt. Giáo viên phải mở lại quyền nộp bài trước khi nộp bản thay thế.';
    END IF;

    v_clean_ext := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_file_extension, '')));
    IF v_clean_ext NOT IN ('zip', 'pdf', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'py', 'js', 'html', 'css', 'json', 'md', 'sb3') THEN
        RAISE EXCEPTION 'INVALID_FILE_TYPE: Định dạng tệp không được hỗ trợ.';
    END IF;

    SELECT count(*)::INT INTO v_pending_count
    FROM public.m3_upload_reservations r
    WHERE r.student_id = p_student_id
      AND r.lesson_id = p_lesson_id
      AND r.class_id = v_student.current_class_id
      AND r.status IN ('reserved', 'claimed');

    IF v_pending_count >= 2 THEN
        RAISE EXCEPTION 'PENDING_UPLOAD_CAP_EXCEEDED: Bạn có quá nhiều yêu cầu tải tệp đang chờ xử lý. Vui lòng hoàn tất hoặc thử lại sau.';
    END IF;

    v_token := encode(extensions.gen_random_bytes(16), 'hex');
    v_path := p_student_id::text || '/' || p_lesson_id::text || '/' || extract(epoch from now())::bigint || '_' || v_token || '.' || v_clean_ext;

    INSERT INTO public.m3_upload_reservations (
        id, student_id, lesson_id, class_id, object_path, status, reserved_at, expires_at
    )
    VALUES (
        v_res_id, p_student_id, p_lesson_id, v_student.current_class_id, v_path, 'reserved', now(), v_expires
    );

    RETURN QUERY
    SELECT v_res_id, v_path, v_expires;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_reserve_practice_upload(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.m3_reserve_practice_upload(UUID, UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.m3_release_upload_reservation(
    p_reservation_id UUID,
    p_object_path TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, storage
AS $$
DECLARE
    v_init RECORD;
    v_res RECORD;
BEGIN
    SELECT r.student_id, r.lesson_id INTO v_init
    FROM public.m3_upload_reservations r
    WHERE r.id = p_reservation_id
      AND r.object_path = p_object_path;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));
    PERFORM pg_advisory_xact_lock(hashtext('reservation:' || v_init.student_id::text || ':' || v_init.lesson_id::text));

    SELECT * INTO v_res
    FROM public.m3_upload_reservations r
    WHERE r.id = p_reservation_id
      AND r.object_path = p_object_path
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF public.current_role() IS DISTINCT FROM 'service_role' THEN
        IF public.current_role() IS DISTINCT FROM 'student'
           OR public.current_profile_id() IS DISTINCT FROM v_res.student_id THEN
            RAISE EXCEPTION 'FORBIDDEN: Bạn không có quyền giải phóng lượt đặt trước này.';
        END IF;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.practice_submissions sub
        WHERE sub.content = p_object_path
    ) THEN
        RAISE EXCEPTION 'CANNOT_RELEASE: Tệp này đang được sử dụng trong bài nộp, không thể giải phóng.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM storage.objects o
        WHERE o.bucket_id = 'm3-practice-files'
          AND o.name = p_object_path
    ) THEN
        RAISE EXCEPTION 'OBJECT_STILL_EXISTS: Tệp lưu trữ vẫn tồn tại trên hệ thống, không thể giải phóng đặt chỗ.';
    END IF;

    UPDATE public.m3_upload_reservations
    SET status = 'cleaned',
        released_at = now()
    WHERE id = p_reservation_id;

    RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_release_upload_reservation(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.m3_release_upload_reservation(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.m3_cleanup_stale_reservations(
    p_student_id UUID,
    p_lesson_id UUID
)
RETURNS TABLE (
    reservation_id UUID,
    object_path TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
#variable_conflict use_column
BEGIN
    IF public.current_role() IS DISTINCT FROM 'service_role' THEN
        IF public.current_role() IS DISTINCT FROM 'student'
           OR public.current_profile_id() IS DISTINCT FROM p_student_id THEN
            RAISE EXCEPTION 'FORBIDDEN: Chỉ học sinh sở hữu mới có quyền claim dọn dẹp.';
        END IF;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));
    PERFORM pg_advisory_xact_lock(hashtext('reservation:' || p_student_id::text || ':' || p_lesson_id::text));

    RETURN QUERY
    WITH candidate AS (
        SELECT r.id, r.object_path
        FROM public.m3_upload_reservations r
        WHERE r.student_id = p_student_id
          AND r.lesson_id = p_lesson_id
          AND (
              (r.status = 'reserved' AND r.expires_at <= now())
              OR r.status = 'claimed'
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.practice_submissions sub
              WHERE sub.content = r.object_path
          )
        FOR UPDATE
    )
    UPDATE public.m3_upload_reservations AS u
    SET status = 'claimed'
    FROM candidate c
    WHERE u.id = c.id
    RETURNING c.id, c.object_path;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_cleanup_stale_reservations(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.m3_cleanup_stale_reservations(UUID, UUID) TO authenticated, service_role;



