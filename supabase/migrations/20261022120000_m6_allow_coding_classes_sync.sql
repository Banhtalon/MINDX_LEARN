-- ============================================================================
-- MINDX LEARN — Mở rộng đồng bộ danh sách lớp Lập trình & Robotics từ Teaching
-- Migration: 20261022120000_m6_allow_coding_classes_sync.sql
--
-- Hỗ trợ đồng bộ cả các lớp Lập trình (JSB, JSA, CSI, CSA, C4K, WEB, PYT, GAM...)
-- lẫn lớp Robotics (ROB) khi robFilterMode = 'all_classes' hoặc lọc theo targetClassCode.
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
    v_env_mode TEXT := 'test';
    v_source_mode TEXT;
    v_is_real_sync BOOLEAN := false;
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

    -- 2. Serialize sync operations within transaction
    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));

    -- 3. Validate report payload and environment mode
    IF p_diff_report IS NULL OR pg_catalog.jsonb_typeof(p_diff_report) <> 'object' THEN
        RAISE EXCEPTION 'INVALID_DIFF_REPORT: Báo cáo xem trước đồng bộ không hợp lệ.';
    END IF;

    SELECT COALESCE(c.environment_mode, 'test')
    INTO v_env_mode
    FROM public.m5_storage_quota_config c
    WHERE c.id = 'default';

    v_source_mode := COALESCE(p_diff_report->>'sourceMode', '');
    v_is_real_sync := (v_source_mode = 'real_teaching_sync');

    IF v_source_mode <> 'synthetic_fixture' AND NOT v_is_real_sync THEN
        RAISE EXCEPTION 'REAL_ROSTER_APPLY_FORBIDDEN_IN_M4: Chỉ chấp nhận sourceMode=synthetic_fixture hoặc real_teaching_sync.';
    END IF;

    IF NOT v_is_real_sync AND v_env_mode = 'production' THEN
        RAISE EXCEPTION 'SYNTHETIC_FIXTURE_FORBIDDEN_IN_PROD: Không được phép áp dụng bộ dữ liệu giả lập TEST trên môi trường chính thức (PROD).';
    END IF;

    -- 4. Create new classes
    IF pg_catalog.jsonb_typeof(p_diff_report->'newClassesToCreate') = 'array' THEN
        FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_diff_report->'newClassesToCreate') LOOP
            v_code := pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(COALESCE(v_item->>'code', '')), '\s+', ' ', 'g'));
            IF v_code = '' THEN
                CONTINUE;
            END IF;

            IF v_is_real_sync THEN
                IF COALESCE(p_diff_report->>'robFilterMode', 'include_rob') <> 'all_classes'
                   AND pg_catalog.btrim(COALESCE(p_diff_report->>'targetClassCode', '')) = ''
                   AND v_code !~* 'ROB' THEN
                    RAISE EXCEPTION 'INVALID_DIFF_REPORT: Mã lớp % không thuộc diện lớp Robotics (ROB).', v_code;
                END IF;
            ELSE
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
            END IF;

            IF v_is_real_sync AND v_code !~* 'ROB' THEN
                v_name := 'Lớp ' || v_code || ' (Mới đồng bộ — Chờ Admin gán khóa học)';
            ELSE
                v_name := 'Lớp Robotics ' || v_code || ' (Mới đồng bộ — Chờ Admin gán khóa học)';
            END IF;
            IF pg_catalog.btrim(COALESCE(v_item->>'name', '')) <> ''
               AND pg_catalog.regexp_replace(pg_catalog.btrim(v_item->>'name'), '\s+', ' ', 'g') NOT IN (
                   'Lớp Robotics ' || v_code || ' (Mới đồng bộ — Chờ Admin gán khóa học)',
                   'Lớp ' || v_code || ' (Mới đồng bộ — Chờ Admin gán khóa học)'
               ) THEN
                IF v_is_real_sync THEN
                    RAISE EXCEPTION 'INVALID_DIFF_REPORT: Tên lớp của mã % không khớp định dạng chuẩn.', v_code;
                ELSE
                    RAISE EXCEPTION 'REAL_ROSTER_APPLY_FORBIDDEN_IN_M4: Tên lớp của mã % không khớp tên chuẩn của bộ fixture mẫu Mốc 4.', v_code;
                END IF;
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
                    NOT v_is_real_sync,
                    NOT v_is_real_sync
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

            IF v_is_real_sync THEN
                IF v_item_class_code <> v_prev_class_code
                   OR (COALESCE(p_diff_report->>'robFilterMode', 'include_rob') <> 'all_classes'
                       AND pg_catalog.btrim(COALESCE(p_diff_report->>'targetClassCode', '')) = ''
                       AND v_item_class_code !~* 'ROB') THEN
                    RAISE EXCEPTION 'INVALID_DIFF_REPORT: Bản ghi cập nhật % có mã lớp không hợp lệ.', v_code;
                END IF;
            ELSE
                v_canon_entry := v_canonical_stu->v_code;
                IF v_canon_entry IS NULL
                   OR COALESCE(v_canon_entry->>'previousName', '') = ''
                   OR COALESCE(v_canon_entry->>'name', '') <> v_next_name
                   OR COALESCE(v_canon_entry->>'previousName', '') <> v_prev_name
                   OR COALESCE(v_canon_entry->>'classCode', '') <> v_item_class_code
                   OR COALESCE(v_canon_entry->>'classCode', '') <> v_prev_class_code THEN
                    RAISE EXCEPTION 'REAL_ROSTER_APPLY_FORBIDDEN_IN_M4: Bản ghi cập nhật % không khớp bộ fixture mẫu Mốc 4 đã phê duyệt.', v_code;
                END IF;
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
                m4_previous_full_name = CASE WHEN v_is_real_sync THEN NULL ELSE COALESCE(s.m4_previous_full_name, v_curr_stu_name) END,
                updated_at = now()
            WHERE s.id = v_stu.id;

            UPDATE public.profiles AS p
            SET full_name = v_next_name,
                updated_at = now()
            WHERE p.id = v_stu.id;

            v_updated_students_count := v_updated_students_count + 1;
        END LOOP;
    END IF;

    -- 6. Insert newly added students (never auto-issuing PINs)
    IF pg_catalog.jsonb_typeof(p_diff_report->'added') = 'array' THEN
        FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_diff_report->'added') LOOP
            v_code := pg_catalog.upper(pg_catalog.btrim(COALESCE(v_item->>'id', '')));
            v_next_name := pg_catalog.regexp_replace(pg_catalog.btrim(COALESCE(v_item->>'name', '')), '\s+', ' ', 'g');
            v_item_class_code := pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(COALESCE(v_item->>'classCode', '')), '\s+', ' ', 'g'));

            IF v_code = '' OR v_next_name = '' OR v_item_class_code = '' THEN
                RAISE EXCEPTION 'INVALID_DIFF_REPORT: Bản ghi thêm mới thiếu id, name hoặc classCode.';
            END IF;

            IF v_is_real_sync THEN
                IF COALESCE(p_diff_report->>'robFilterMode', 'include_rob') <> 'all_classes'
                   AND pg_catalog.btrim(COALESCE(p_diff_report->>'targetClassCode', '')) = ''
                   AND v_item_class_code !~* 'ROB' THEN
                    RAISE EXCEPTION 'INVALID_DIFF_REPORT: Bản ghi thêm mới % có mã lớp % không thuộc diện ROB.', v_code, v_item_class_code;
                END IF;
            ELSE
                v_canon_entry := v_canonical_stu->v_code;
                IF v_canon_entry IS NULL
                   OR COALESCE(v_canon_entry->>'previousName', '') <> ''
                   OR COALESCE(v_canon_entry->>'name', '') <> v_next_name
                   OR COALESCE(v_canon_entry->>'classCode', '') <> v_item_class_code THEN
                    RAISE EXCEPTION 'REAL_ROSTER_APPLY_FORBIDDEN_IN_M4: Bản ghi thêm mới % không nằm trong bộ fixture mẫu Mốc 4 đã phê duyệt.', v_code;
                END IF;
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
                NOT v_is_real_sync,
                NOT v_is_real_sync
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
                CASE
                    WHEN v_is_real_sync THEN 'Đồng bộ từ Teaching MindX (Chờ Admin cấp mã PIN riêng)'
                    ELSE 'Đồng bộ từ fixture DataTables Mốc 4 (Chờ Admin cấp mã PIN riêng)'
                END,
                NOT v_is_real_sync,
                NOT v_is_real_sync
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
