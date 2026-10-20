-- ============================================================================
-- MINDX LEARN — M3 RPC & Storage RLS Runtime Fix
-- Migration: 20261020035000_m3_rpc_and_storage_rls_runtime_fix.sql
-- Fixes:
-- 1. PostgreSQL 42702 column reference ambiguity in RETURNS TABLE PL/pgSQL RPCs
--    (m3_save_class, m3_save_lesson, m3_grade_submission, m3_reopen_submission,
--     m3_submit_practice, m3_transfer_student, m3_reserve_practice_upload,
--     m3_cleanup_stale_reservations) via #variable_conflict use_column & table aliases.
-- 2. Include extensions schema in m3_reserve_practice_upload search_path for gen_random_bytes(16).
-- 3. Qualify objects.name in m3_storage_select_policy on storage.objects so inner joins
--    against public.classes c do not shadow storage.objects.name with c.name.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.m3_save_class(
    p_admin_profile_id UUID,
    p_class_id UUID DEFAULT NULL,
    p_code TEXT DEFAULT NULL,
    p_name TEXT DEFAULT NULL,
    p_teacher_id UUID DEFAULT NULL,
    p_course_id UUID DEFAULT NULL,
    p_update_teacher BOOLEAN DEFAULT FALSE,
    p_update_course BOOLEAN DEFAULT FALSE
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
#variable_conflict use_column
DECLARE
    v_class_id UUID := p_class_id;
    v_class RECORD;
    v_final_code TEXT;
    v_final_name TEXT;
    v_final_teacher_id UUID;
    v_final_course_id UUID;
BEGIN
    -- 1. Validate active admin
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = p_admin_profile_id AND p.role = 'admin' AND p.status = 'active'
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN: Chỉ có Quản trị viên mới được tạo hoặc sửa lớp học.';
    END IF;

    -- 2. Create or Update
    IF v_class_id IS NULL THEN
        v_class_id := gen_random_uuid();

        v_final_code := pg_catalog.btrim(COALESCE(p_code, ''));
        v_final_name := pg_catalog.btrim(COALESCE(p_name, ''));
        IF v_final_code = '' OR v_final_name = '' THEN
            RAISE EXCEPTION 'INVALID_PAYLOAD: Mã lớp và tên lớp không được để trống.';
        END IF;

        IF p_course_id IS NOT NULL THEN
            IF NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = p_course_id) THEN
                RAISE EXCEPTION 'NOT_FOUND: Khóa học không tồn tại.';
            END IF;
        END IF;

        IF p_teacher_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = p_teacher_id AND p.role = 'teacher' AND p.status = 'active'
            ) THEN
                RAISE EXCEPTION 'NOT_FOUND: Hồ sơ giáo viên không hợp lệ hoặc không hoạt động.';
            END IF;
        END IF;

        -- Lock code namespace
        PERFORM pg_advisory_xact_lock(hashtext('class_code:' || pg_catalog.lower(v_final_code)));

        IF EXISTS (SELECT 1 FROM public.classes c WHERE pg_catalog.lower(c.code) = pg_catalog.lower(v_final_code)) THEN
            RAISE EXCEPTION 'DUPLICATE_CODE: Mã lớp đã tồn tại: %', v_final_code;
        END IF;

        INSERT INTO public.classes (id, code, name, course_id, status, is_14_sessions_confirmed, is_fixture)
        VALUES (v_class_id, v_final_code, v_final_name, p_course_id, 'active', false, true)
        RETURNING * INTO v_class;

        IF p_teacher_id IS NOT NULL THEN
            INSERT INTO public.class_teachers (class_id, teacher_profile_id)
            VALUES (v_class_id, p_teacher_id);
        END IF;
        v_final_teacher_id := p_teacher_id;
    ELSE
        -- Canonical class lock
        PERFORM pg_advisory_xact_lock(hashtext('class:' || v_class_id::text));

        SELECT * INTO v_class
        FROM public.classes c
        WHERE c.id = v_class_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'NOT_FOUND: Không tìm thấy lớp học: %', v_class_id;
        END IF;

        -- Resolve code (missing vs updated)
        IF p_code IS NOT NULL AND pg_catalog.btrim(p_code) <> '' THEN
            v_final_code := pg_catalog.btrim(p_code);
            IF pg_catalog.lower(v_class.code) <> pg_catalog.lower(v_final_code) THEN
                PERFORM pg_advisory_xact_lock(hashtext('class_code:' || pg_catalog.lower(v_final_code)));
                IF EXISTS (SELECT 1 FROM public.classes c WHERE pg_catalog.lower(c.code) = pg_catalog.lower(v_final_code) AND c.id <> v_class_id) THEN
                    RAISE EXCEPTION 'DUPLICATE_CODE: Mã lớp đã tồn tại: %', v_final_code;
                END IF;
            END IF;
        ELSE
            v_final_code := v_class.code;
        END IF;

        -- Resolve name (missing vs updated)
        IF p_name IS NOT NULL AND pg_catalog.btrim(p_name) <> '' THEN
            v_final_name := pg_catalog.btrim(p_name);
        ELSE
            v_final_name := v_class.name;
        END IF;

        -- Resolve course_id (missing vs updated)
        IF p_update_course THEN
            IF p_course_id IS NOT NULL THEN
                IF NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = p_course_id) THEN
                    RAISE EXCEPTION 'NOT_FOUND: Khóa học không tồn tại.';
                END IF;
            END IF;
            v_final_course_id := p_course_id;
        ELSE
            v_final_course_id := v_class.course_id;
        END IF;

        UPDATE public.classes AS c
        SET code = v_final_code,
            name = v_final_name,
            course_id = v_final_course_id,
            updated_at = now()
        WHERE c.id = v_class_id
        RETURNING * INTO v_class;

        -- Resolve teacher assignment (missing vs updated)
        IF p_update_teacher THEN
            IF p_teacher_id IS NOT NULL THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.profiles p
                    WHERE p.id = p_teacher_id AND p.role = 'teacher' AND p.status = 'active'
                ) THEN
                    RAISE EXCEPTION 'NOT_FOUND: Hồ sơ giáo viên không hợp lệ hoặc không hoạt động.';
                END IF;
            END IF;

            DELETE FROM public.class_teachers AS ct WHERE ct.class_id = v_class_id;
            IF p_teacher_id IS NOT NULL THEN
                INSERT INTO public.class_teachers (class_id, teacher_profile_id)
                VALUES (v_class_id, p_teacher_id);
            END IF;
            v_final_teacher_id := p_teacher_id;
        ELSE
            -- Preserve existing teacher assignment
            SELECT ct.teacher_profile_id INTO v_final_teacher_id
            FROM public.class_teachers ct
            WHERE ct.class_id = v_class_id;
        END IF;
    END IF;

    RETURN QUERY
    SELECT 
        v_class.id,
        v_class.code,
        v_class.name,
        v_class.course_id,
        v_final_teacher_id,
        v_class.status,
        v_class.is_14_sessions_confirmed;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_save_class(UUID, UUID, TEXT, TEXT, UUID, UUID, BOOLEAN, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m3_save_class(UUID, UUID, TEXT, TEXT, UUID, UUID, BOOLEAN, BOOLEAN) TO service_role;

CREATE OR REPLACE FUNCTION public.m3_grade_submission(
    p_actor_profile_id UUID,
    p_submission_id UUID,
    p_status TEXT,
    p_feedback TEXT DEFAULT ''
)
RETURNS TABLE (
    id UUID,
    student_id UUID,
    lesson_id UUID,
    status TEXT,
    teacher_feedback TEXT,
    can_resubmit BOOLEAN,
    graded_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
#variable_conflict use_column
DECLARE
    v_actor RECORD;
    v_sub RECORD;
    v_student RECORD;
    v_clean_status TEXT;
    v_res RECORD;
    v_can_resubmit BOOLEAN;
BEGIN
    SELECT * INTO v_actor
    FROM public.profiles p
    WHERE p.id = p_actor_profile_id AND p.status = 'active';

    IF NOT FOUND OR v_actor.role NOT IN ('admin', 'teacher') THEN
        RAISE EXCEPTION 'FORBIDDEN: Chỉ có Giáo viên phụ trách hoặc Quản trị viên mới được chấm bài.';
    END IF;

    SELECT * INTO v_sub
    FROM public.practice_submissions ps
    WHERE ps.id = p_submission_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Không tìm thấy bài nộp.';
    END IF;

    SELECT * INTO v_student
    FROM public.students s
    WHERE s.id = v_sub.student_id;

    -- If teacher, verify assigned class
    IF v_actor.role = 'teacher' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.class_teachers ct
            JOIN public.classes c ON c.id = ct.class_id
            WHERE ct.teacher_profile_id = p_actor_profile_id
              AND ct.class_id = v_student.current_class_id
              AND c.status = 'active'
        ) THEN
            RAISE EXCEPTION 'FORBIDDEN: Giáo viên không được phân công phụ trách lớp học của học sinh này.';
        END IF;
    END IF;

    v_clean_status := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_status, '')));
    IF v_clean_status NOT IN ('approved', 'needs_revision') THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Kết quả chấm bài phải là approved (Đạt) hoặc needs_revision (Cần làm lại).';
    END IF;

    IF v_sub.status = 'approved' AND v_clean_status = 'needs_revision' THEN
        RAISE EXCEPTION 'CANNOT_DEMOTE_APPROVED: Bài nộp đã được duyệt Đạt không thể chuyển trực tiếp sang Cần làm lại. Giáo viên cần mở lại quyền nộp bài và chờ học sinh nộp bản thay thế mới.';
    END IF;

    v_can_resubmit := (v_clean_status = 'needs_revision');

    UPDATE public.practice_submissions AS ps
    SET status = v_clean_status,
        teacher_feedback = COALESCE(p_feedback, ''),
        graded_at = now(),
        graded_by = p_actor_profile_id,
        can_resubmit = v_can_resubmit,
        updated_at = now()
    WHERE ps.id = p_submission_id
    RETURNING * INTO v_res;

    RETURN QUERY
    SELECT v_res.id, v_res.student_id, v_res.lesson_id, v_res.status,
           v_res.teacher_feedback, v_res.can_resubmit, v_res.graded_at;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_grade_submission(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m3_grade_submission(UUID, UUID, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.m3_reopen_submission(
    p_actor_profile_id UUID,
    p_submission_id UUID
)
RETURNS TABLE (
    id UUID,
    student_id UUID,
    lesson_id UUID,
    status TEXT,
    can_resubmit BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
#variable_conflict use_column
DECLARE
    v_actor RECORD;
    v_sub RECORD;
    v_student RECORD;
    v_res RECORD;
BEGIN
    SELECT * INTO v_actor
    FROM public.profiles p
    WHERE p.id = p_actor_profile_id AND p.status = 'active';

    IF NOT FOUND OR v_actor.role NOT IN ('admin', 'teacher') THEN
        RAISE EXCEPTION 'FORBIDDEN: Chỉ có Giáo viên phụ trách hoặc Quản trị viên mới được mở lại quyền nộp bài.';
    END IF;

    SELECT * INTO v_sub
    FROM public.practice_submissions ps
    WHERE ps.id = p_submission_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Không tìm thấy bài nộp.';
    END IF;

    SELECT * INTO v_student
    FROM public.students s
    WHERE s.id = v_sub.student_id;

    IF v_actor.role = 'teacher' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.class_teachers ct
            JOIN public.classes c ON c.id = ct.class_id
            WHERE ct.teacher_profile_id = p_actor_profile_id
              AND ct.class_id = v_student.current_class_id
              AND c.status = 'active'
        ) THEN
            RAISE EXCEPTION 'FORBIDDEN: Giáo viên không được phân công phụ trách lớp học của học sinh này.';
        END IF;
    END IF;

    UPDATE public.practice_submissions AS ps
    SET can_resubmit = true,
        updated_at = now()
    WHERE ps.id = p_submission_id
    RETURNING * INTO v_res;

    RETURN QUERY
    SELECT v_res.id, v_res.student_id, v_res.lesson_id, v_res.status, v_res.can_resubmit;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_reopen_submission(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m3_reopen_submission(UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.m3_submit_practice(
    p_student_profile_id UUID,
    p_lesson_id UUID,
    p_type TEXT,
    p_content TEXT,
    p_file_size_bytes INT DEFAULT NULL,
    p_notes TEXT DEFAULT ''
)
RETURNS TABLE (
    id UUID,
    student_id UUID,
    lesson_id UUID,
    type TEXT,
    content TEXT,
    file_size_bytes INT,
    notes TEXT,
    status TEXT,
    can_resubmit BOOLEAN,
    submitted_at TIMESTAMPTZ,
    old_file_path TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
#variable_conflict use_column
DECLARE
    v_student RECORD;
    v_class RECORD;
    v_lesson RECORD;
    v_clean_type TEXT;
    v_clean_content TEXT;
    v_existing RECORD;
    v_res RECORD;
    v_actual_size BIGINT;
    v_owner UUID;
    v_file_ext TEXT;
    v_old_file_path TEXT := NULL;
    v_res_id UUID;
BEGIN
    -- Verify active student
    SELECT * INTO v_student
    FROM public.students s
    JOIN public.profiles p ON p.id = s.id
    WHERE s.id = p_student_profile_id
      AND s.status IN ('active', 'transferred')
      AND p.status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FORBIDDEN: Học sinh không hoạt động hoặc không tồn tại.';
    END IF;

    -- Verify active class
    SELECT * INTO v_class
    FROM public.classes c
    WHERE c.id = v_student.current_class_id
      AND c.status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FORBIDDEN: Lớp học chưa kích hoạt.';
    END IF;

    -- Verify published lesson with practice
    SELECT * INTO v_lesson
    FROM public.lessons l
    WHERE l.id = p_lesson_id
      AND l.course_id = v_class.course_id
      AND l.status = 'published'
      AND l.has_practice = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FORBIDDEN: Bài học chưa xuất bản hoặc không có phần thực hành.';
    END IF;

    v_clean_type := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_type, 'link')));
    IF v_clean_type NOT IN ('link', 'file', 'text') THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Hình thức nộp chỉ chấp nhận link, file hoặc text.';
    END IF;

    IF v_clean_type = 'file' AND v_lesson.practice_mode <> 'file_allowed' THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Bài học này chỉ chấp nhận nộp qua đường dẫn liên kết hoặc văn bản.';
    END IF;

    v_clean_content := pg_catalog.btrim(COALESCE(p_content, ''));
    IF v_clean_content = '' THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Nội dung bài nộp không được để trống.';
    END IF;

    IF v_clean_type = 'link' THEN
        IF v_clean_content !~* '^https?://[^\s]+' THEN
            RAISE EXCEPTION 'INVALID_LINK_SCHEME: Đường dẫn bài nộp phải có scheme http:// hoặc https://.';
        END IF;
    END IF;

    IF v_clean_type = 'file' THEN
        PERFORM pg_advisory_xact_lock(hashtext('reservation:' || p_student_profile_id::text || ':' || p_lesson_id::text));

        IF p_file_size_bytes IS NOT NULL AND p_file_size_bytes > 2097152 THEN
            RAISE EXCEPTION 'FILE_TOO_LARGE: Kích thước tệp vượt quá giới hạn 2 MB.';
        END IF;

        IF v_clean_content NOT LIKE (p_student_profile_id::text || '/' || p_lesson_id::text || '/%') THEN
            RAISE EXCEPTION 'INVALID_FILE_PATH: Đường dẫn tệp bài nộp không hợp lệ hoặc không thuộc về học sinh và bài học này.';
        END IF;

        v_file_ext := pg_catalog.lower(pg_catalog.split_part(v_clean_content, '.', array_length(pg_catalog.string_to_array(v_clean_content, '.'), 1)));
        IF v_file_ext NOT IN ('zip', 'pdf', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'py', 'js', 'html', 'css', 'json', 'md', 'sb3') THEN
            RAISE EXCEPTION 'INVALID_FILE_TYPE: Định dạng tệp không nằm trong danh sách cho phép (ZIP, PDF, PNG, JPG/JPEG, WEBP, TXT, PY, JS, HTML, CSS, JSON, MD, SB3).';
        END IF;

        SELECT r.id INTO v_res_id
        FROM public.m3_upload_reservations r
        WHERE r.object_path = v_clean_content
          AND r.student_id = p_student_profile_id
          AND r.lesson_id = p_lesson_id
          AND r.class_id = v_student.current_class_id
          AND r.status = 'reserved'
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'INVALID_RESERVATION: Tệp bài làm không có lượt đặt trước hợp lệ hoặc đã được sử dụng.';
        END IF;

        SELECT (o.metadata->>'size')::bigint, o.owner INTO v_actual_size, v_owner
        FROM storage.objects o
        WHERE o.bucket_id = 'm3-practice-files'
          AND o.name = v_clean_content;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'FILE_NOT_FOUND: Tệp bài làm chưa được tải lên hệ thống lưu trữ hoặc đối tượng không tồn tại.';
        END IF;

        IF v_actual_size IS NOT NULL AND v_actual_size > 2097152 THEN
            RAISE EXCEPTION 'FILE_TOO_LARGE: Kích thước tệp lưu trữ vượt quá giới hạn 2 MB.';
        END IF;

        IF v_owner IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM private.actor_auth aa
                WHERE aa.profile_id = p_student_profile_id
                  AND aa.auth_user_id = v_owner
            ) THEN
                RAISE EXCEPTION 'FORBIDDEN: Đối tượng tệp lưu trữ không thuộc quyền sở hữu của tài khoản học sinh này.';
            END IF;
        END IF;

        IF EXISTS (
            SELECT 1 FROM public.practice_submissions sub
            WHERE sub.content = v_clean_content
              AND (sub.student_id <> p_student_profile_id OR sub.lesson_id <> p_lesson_id OR sub.class_id <> v_student.current_class_id)
        ) THEN
            RAISE EXCEPTION 'DUPLICATE_FILE: Tệp này đã được sử dụng cho một bài nộp khác.';
        END IF;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('practice:' || p_student_profile_id::text || ':' || p_lesson_id::text || ':' || v_student.current_class_id::text));

    SELECT * INTO v_existing
    FROM public.practice_submissions ps
    WHERE ps.student_id = p_student_profile_id
      AND ps.lesson_id = p_lesson_id
      AND ps.class_id = v_student.current_class_id
    FOR UPDATE;

    IF FOUND THEN
        IF v_existing.status = 'approved' AND v_existing.can_resubmit = false THEN
            RAISE EXCEPTION 'CANNOT_RESUBMIT_APPROVED: Bài nộp đã được giáo viên duyệt Đạt. Giáo viên phải mở lại quyền nộp bài trước khi học sinh được nộp bản thay thế.';
        END IF;

        IF v_existing.type = 'file' AND v_existing.content <> v_clean_content THEN
            v_old_file_path := v_existing.content;
        END IF;

        UPDATE public.practice_submissions AS ps
        SET type = v_clean_type,
            content = v_clean_content,
            file_size_bytes = p_file_size_bytes,
            notes = COALESCE(p_notes, ''),
            status = 'submitted',
            teacher_feedback = NULL,
            can_resubmit = true,
            submitted_at = now(),
            updated_at = now()
        WHERE ps.student_id = p_student_profile_id
          AND ps.lesson_id = p_lesson_id
          AND ps.class_id = v_student.current_class_id
        RETURNING * INTO v_res;
    ELSE
        INSERT INTO public.practice_submissions (
            student_id, lesson_id, class_id, type, content, file_size_bytes, notes, status, can_resubmit, submitted_at
        )
        VALUES (
            p_student_profile_id, p_lesson_id, v_student.current_class_id, v_clean_type, v_clean_content, p_file_size_bytes, COALESCE(p_notes, ''), 'submitted', true, now()
        )
        RETURNING * INTO v_res;
    END IF;

    -- Atomically consume reservation
    IF v_res_id IS NOT NULL THEN
        UPDATE public.m3_upload_reservations AS r
        SET status = 'consumed',
            consumed_at = now()
        WHERE r.id = v_res_id;
    END IF;

    RETURN QUERY
    SELECT v_res.id, v_res.student_id, v_res.lesson_id, v_res.type, v_res.content,
           v_res.file_size_bytes, v_res.notes, v_res.status, v_res.can_resubmit, v_res.submitted_at, v_old_file_path;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_submit_practice(UUID, UUID, TEXT, TEXT, INT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m3_submit_practice(UUID, UUID, TEXT, TEXT, INT, TEXT) TO service_role;

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
    IF public.current_role() <> 'student' OR public.current_profile_id() <> p_student_id THEN
        RAISE EXCEPTION 'FORBIDDEN: Chỉ học sinh sở hữu mới được đặt trước lượt tải tệp.';
    END IF;

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
    IF public.current_role() <> 'service_role' THEN
        IF public.current_role() <> 'student' OR public.current_profile_id() <> p_student_id THEN
            RAISE EXCEPTION 'FORBIDDEN: Chỉ học sinh sở hữu mới có quyền claim dọn dẹp.';
        END IF;
    END IF;

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

-- Qualify storage.objects.name in m3_storage_select_policy so inner joins against public.classes c
-- do not bind unqualified `name` to `c.name` (the class display name).
DROP POLICY IF EXISTS "m3_storage_select_policy" ON storage.objects;
CREATE POLICY "m3_storage_select_policy" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'm3-practice-files' AND (
            public.is_active_admin()
            OR (
                public.current_role() = 'student'
                AND (storage.foldername(objects.name))[1] = public.current_profile_id()::text
                AND EXISTS (
                    SELECT 1
                    FROM public.students s
                    JOIN public.classes c ON c.id = s.current_class_id
                    JOIN public.practice_submissions sub ON sub.student_id = s.id AND sub.class_id = c.id
                    WHERE s.id = public.current_profile_id()
                      AND s.status IN ('active', 'transferred')
                      AND c.status = 'active'
                      AND sub.content = objects.name
                )
            )
            OR (
                public.current_role() = 'teacher'
                AND EXISTS (
                    SELECT 1
                    FROM public.students s
                    JOIN public.class_teachers ct ON ct.class_id = s.current_class_id
                    JOIN public.classes c ON c.id = s.current_class_id
                    JOIN public.practice_submissions sub ON sub.student_id = s.id AND sub.class_id = c.id
                    WHERE s.id::text = (storage.foldername(objects.name))[1]
                      AND ct.teacher_profile_id = public.current_profile_id()
                      AND s.status IN ('active', 'transferred')
                      AND c.status = 'active'
                      AND sub.content = objects.name
                )
            )
        )
    );

