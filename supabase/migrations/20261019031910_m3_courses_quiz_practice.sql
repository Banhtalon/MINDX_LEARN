-- ============================================================================
-- MINDX LEARN — M3 Courses, 14 Fixed Sessions, Quiz, Practice & Storage Migration
-- Target: Supabase PostgreSQL (TEST)
-- Migration: 20261018230000_m3_courses_quiz_practice.sql
-- ============================================================================

-- ============================================================================
-- 1. PUBLIC DOMAIN TABLES FOR MILESTONE 3
-- ============================================================================

-- 1.1 Courses (Fixed 14 sessions invariant enforced by check constraint)
CREATE TABLE IF NOT EXISTS public.courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    total_sessions INT NOT NULL DEFAULT 14 CONSTRAINT chk_courses_total_sessions CHECK (total_sessions = 14),
    is_fixture BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.2 Lessons (Fixed 1..14 sessions per course, unique session slot constraint)
CREATE TABLE IF NOT EXISTS public.lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    session_number INT NOT NULL CONSTRAINT chk_lessons_session_number CHECK (session_number >= 1 AND session_number <= 14),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    materials TEXT NOT NULL DEFAULT '',
    video_url TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    has_quiz BOOLEAN NOT NULL DEFAULT false,
    has_practice BOOLEAN NOT NULL DEFAULT false,
    practice_mode TEXT NOT NULL DEFAULT 'link_only' CHECK (practice_mode IN ('link_only', 'file_allowed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_lessons_course_session UNIQUE (course_id, session_number),
    CONSTRAINT chk_published_assessment CHECK (status <> 'published' OR (has_quiz = true OR has_practice = true))
);

CREATE INDEX IF NOT EXISTS idx_lessons_course ON public.lessons(course_id, session_number);

-- 1.3 Quiz Questions (Private to teacher/admin; server grades without leaking correctOptionIndex)
CREATE TABLE IF NOT EXISTS public.quiz_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    options JSONB NOT NULL DEFAULT '[]'::jsonb,
    correct_option_index INT NOT NULL CHECK (correct_option_index >= 0),
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_lesson ON public.quiz_questions(lesson_id, order_index);

-- 1.4 Quiz Results (Highest score retained, passed >= 70 threshold, unlimited attempts)
CREATE TABLE IF NOT EXISTS public.quiz_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    highest_score INT NOT NULL DEFAULT 0 CHECK (highest_score >= 0 AND highest_score <= 100),
    attempts_count INT NOT NULL DEFAULT 1 CHECK (attempts_count >= 1),
    passed BOOLEAN NOT NULL DEFAULT false,
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_student_lesson_quiz UNIQUE (student_id, lesson_id, class_id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_results_student ON public.quiz_results(student_id);
CREATE INDEX IF NOT EXISTS idx_quiz_results_lesson ON public.quiz_results(lesson_id);
CREATE INDEX IF NOT EXISTS idx_quiz_results_class ON public.quiz_results(class_id);

-- 1.5 Practice Submissions (Single current submission, max 2MB, can_resubmit lifecycle)
CREATE TABLE IF NOT EXISTS public.practice_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('link', 'file', 'text')),
    content TEXT NOT NULL,
    file_size_bytes INT CONSTRAINT chk_practice_submissions_file_size CHECK (file_size_bytes IS NULL OR (file_size_bytes >= 0 AND file_size_bytes <= 2097152)),
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'needs_revision')),
    teacher_feedback TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    graded_at TIMESTAMPTZ,
    graded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    can_resubmit BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_student_lesson_practice UNIQUE (student_id, lesson_id, class_id)
);

CREATE INDEX IF NOT EXISTS idx_submissions_student ON public.practice_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_lesson ON public.practice_submissions(lesson_id);
CREATE INDEX IF NOT EXISTS idx_submissions_class ON public.practice_submissions(class_id);

-- 1.6 Upload Reservations (Bounded pending upload cap, orphan prevention, exact path reservation)
CREATE TABLE IF NOT EXISTS public.m3_upload_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    object_path TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'reserved' CONSTRAINT chk_m3_upload_reservations_status CHECK (status IN ('reserved', 'claimed', 'consumed', 'released', 'cleaned')),
    reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
    consumed_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ
);

-- Ensure check constraint on status includes 'claimed' consistently across fresh installs and pre-existing tables
ALTER TABLE public.m3_upload_reservations DROP CONSTRAINT IF EXISTS chk_m3_upload_reservations_status;
ALTER TABLE public.m3_upload_reservations DROP CONSTRAINT IF EXISTS m3_upload_reservations_status_check;
ALTER TABLE public.m3_upload_reservations ADD CONSTRAINT chk_m3_upload_reservations_status CHECK (status IN ('reserved', 'claimed', 'consumed', 'released', 'cleaned'));

CREATE INDEX IF NOT EXISTS idx_reservations_student_lesson ON public.m3_upload_reservations(student_id, lesson_id, status);
CREATE INDEX IF NOT EXISTS idx_reservations_object_path ON public.m3_upload_reservations(object_path);

-- ============================================================================
-- 2. PRIVATE STORAGE BUCKET FOR M3 PRACTICE FILES (MAX 2MB, STRICT ALLOWLIST)
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'm3-practice-files',
    'm3-practice-files',
    false,
    2097152,
    ARRAY[
        'application/zip',
        'application/x-zip-compressed',
        'application/pdf',
        'image/png',
        'image/jpeg',
        'image/webp',
        'text/plain',
        'text/x-python',
        'text/javascript',
        'application/javascript',
        'text/html',
        'text/css',
        'application/json',
        'text/markdown',
        'application/x.scratch.sb3'
    ]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 2097152,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================================
-- 3. M3 RPC FUNCTIONS (SECURITY DEFINER, PINNED SEARCH_PATH)
-- ============================================================================

-- 3.1 Create Course with exactly 14 fixed sessions (Admin only)
CREATE OR REPLACE FUNCTION public.m3_create_course(
    p_admin_profile_id UUID,
    p_title TEXT,
    p_description TEXT DEFAULT ''
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    description TEXT,
    total_sessions INT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
    v_course_id UUID := gen_random_uuid();
    v_clean_title TEXT;
    v_clean_desc TEXT;
    v_i INT;
BEGIN
    -- Verify active admin caller
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = p_admin_profile_id AND role = 'admin' AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN: Chỉ có Quản trị viên mới được tạo khóa học.';
    END IF;

    v_clean_title := pg_catalog.btrim(COALESCE(p_title, ''));
    IF v_clean_title = '' THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Tiêu đề khóa học không được để trống.';
    END IF;

    v_clean_desc := pg_catalog.btrim(COALESCE(p_description, ''));

    -- Insert Course
    INSERT INTO public.courses (id, title, description, total_sessions, is_fixture)
    VALUES (v_course_id, v_clean_title, v_clean_desc, 14, true);

    -- Atomically initialize exactly 14 slots (Buổi 1 to Buổi 14)
    FOR v_i IN 1..14 LOOP
        INSERT INTO public.lessons (
            course_id, session_number, title, description, materials, video_url,
            status, has_quiz, has_practice, practice_mode
        )
        VALUES (
            v_course_id,
            v_i,
            'Buổi ' || v_i || ': Bài học Buổi ' || v_i,
            'Nội dung tóm tắt buổi ' || v_i,
            '',
            '',
            'draft',
            false,
            false,
            'link_only'
        );
    END LOOP;

    RETURN QUERY
    SELECT c.id, c.title, c.description, c.total_sessions, c.created_at
    FROM public.courses c
    WHERE c.id = v_course_id;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_create_course(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m3_create_course(UUID, TEXT, TEXT) TO service_role;

-- 3.2 Update Course Info (Admin only)
CREATE OR REPLACE FUNCTION public.m3_update_course(
    p_admin_profile_id UUID,
    p_course_id UUID,
    p_title TEXT,
    p_description TEXT DEFAULT ''
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    description TEXT,
    total_sessions INT,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
    v_clean_title TEXT;
    v_clean_desc TEXT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = p_admin_profile_id AND role = 'admin' AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN: Chỉ có Quản trị viên mới được cập nhật khóa học.';
    END IF;

    v_clean_title := pg_catalog.btrim(COALESCE(p_title, ''));
    IF v_clean_title = '' THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Tiêu đề khóa học không được để trống.';
    END IF;

    v_clean_desc := pg_catalog.btrim(COALESCE(p_description, ''));

    UPDATE public.courses
    SET title = v_clean_title,
        description = v_clean_desc,
        updated_at = now()
    WHERE courses.id = p_course_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Không tìm thấy khóa học cần cập nhật.';
    END IF;

    RETURN QUERY
    SELECT c.id, c.title, c.description, c.total_sessions, c.updated_at
    FROM public.courses c
    WHERE c.id = p_course_id;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_update_course(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m3_update_course(UUID, UUID, TEXT, TEXT) TO service_role;

-- 3.3 Update Lesson Content & Questions (Admin only, checks publish rule, preserves existing quiz results)
CREATE OR REPLACE FUNCTION public.m3_update_lesson(
    p_admin_profile_id UUID,
    p_lesson_id UUID,
    p_title TEXT,
    p_description TEXT,
    p_materials TEXT,
    p_video_url TEXT,
    p_status TEXT,
    p_has_quiz BOOLEAN,
    p_has_practice BOOLEAN,
    p_practice_mode TEXT,
    p_questions JSONB DEFAULT '[]'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
    v_clean_title TEXT;
    v_clean_status TEXT;
    v_clean_mode TEXT;
    v_q JSONB;
    v_idx INT := 0;
    v_valid_q_count INT := 0;
    v_prompt TEXT;
    v_options JSONB;
    v_correct INT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = p_admin_profile_id AND role = 'admin' AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN: Chỉ có Quản trị viên mới được chỉnh sửa bài học.';
    END IF;

    v_clean_title := pg_catalog.btrim(COALESCE(p_title, ''));
    IF v_clean_title = '' THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Tiêu đề bài học không được để trống.';
    END IF;

    v_clean_status := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_status, 'draft')));
    IF v_clean_status NOT IN ('draft', 'published') THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Trạng thái bài học chỉ có thể là draft hoặc published.';
    END IF;

    v_clean_mode := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_practice_mode, 'link_only')));
    IF v_clean_mode NOT IN ('link_only', 'file_allowed') THEN
        v_clean_mode := 'link_only';
    END IF;

    -- Publish rule check: cannot publish lesson without quiz or practice
    IF v_clean_status = 'published' AND NOT p_has_quiz AND NOT p_has_practice THEN
        RAISE EXCEPTION 'CANNOT_PUBLISH_THEORY_ONLY: Chặn xuất bản: Buổi học phải có Quiz, Thực hành hoặc cả hai; không được xuất bản bài chỉ có lý thuyết.';
    END IF;

    UPDATE public.lessons
    SET title = v_clean_title,
        description = COALESCE(p_description, ''),
        materials = COALESCE(p_materials, ''),
        video_url = COALESCE(p_video_url, ''),
        status = v_clean_status,
        has_quiz = p_has_quiz,
        has_practice = p_has_practice,
        practice_mode = v_clean_mode,
        updated_at = now()
    WHERE lessons.id = p_lesson_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Không tìm thấy bài học.';
    END IF;

    -- Update questions if provided (replaces question definitions for future attempts without wiping student quiz_results)
    IF p_questions IS NOT NULL AND jsonb_typeof(p_questions) = 'array' THEN
        DELETE FROM public.quiz_questions WHERE lesson_id = p_lesson_id;

        FOR v_q IN SELECT * FROM jsonb_array_elements(p_questions) LOOP
            v_prompt := pg_catalog.btrim(COALESCE(v_q->>'prompt', ''));
            v_options := v_q->'options';
            v_correct := COALESCE((v_q->>'correctOptionIndex')::INT, -1);

            -- Validate: prompt non-empty, options array length >= 2, and correct option index strictly within options array bounds
            IF v_prompt <> '' AND jsonb_typeof(v_options) = 'array' AND jsonb_array_length(v_options) >= 2 AND v_correct >= 0 AND v_correct < jsonb_array_length(v_options) THEN
                INSERT INTO public.quiz_questions (
                    lesson_id, prompt, options, correct_option_index, order_index
                )
                VALUES (
                    p_lesson_id, v_prompt, v_options, v_correct, v_idx
                );
                v_idx := v_idx + 1;
                v_valid_q_count := v_valid_q_count + 1;
            END IF;
        END LOOP;
    ELSE
        SELECT count(*)::INT INTO v_valid_q_count
        FROM public.quiz_questions
        WHERE lesson_id = p_lesson_id;
    END IF;

    -- Publish rule check: cannot publish quiz with 0 valid questions
    IF v_clean_status = 'published' AND p_has_quiz AND v_valid_q_count = 0 THEN
        RAISE EXCEPTION 'CANNOT_PUBLISH_EMPTY_QUIZ: Chặn xuất bản: Buổi học bật trắc nghiệm nhưng không có câu hỏi hợp lệ nào (mỗi câu cần ít nhất 2 đáp án và chỉ số đáp án đúng nằm trong danh sách đáp án).';
    END IF;

    RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_update_lesson(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m3_update_lesson(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT, JSONB) TO service_role;

-- 3.4 Submit Quiz Attempt (Server grading, 70% threshold, highest score retained)
CREATE OR REPLACE FUNCTION public.m3_submit_quiz_attempt(
    p_student_profile_id UUID,
    p_lesson_id UUID,
    p_answers INT[]
)
RETURNS TABLE (
    score INT,
    passed BOOLEAN,
    highest_score INT,
    attempts_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
    v_lesson RECORD;
    v_student RECORD;
    v_class RECORD;
    v_total_q INT;
    v_correct_count INT := 0;
    v_i INT := 1;
    v_calc_score INT;
    v_calc_passed BOOLEAN;
    v_existing RECORD;
    v_new_highest INT;
    v_new_passed BOOLEAN;
    v_new_attempts INT;
    v_rec RECORD;
BEGIN
    -- Verify active student profile
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

    -- Verify lesson is published and belongs to class's course
    SELECT * INTO v_lesson
    FROM public.lessons l
    WHERE l.id = p_lesson_id
      AND l.course_id = v_class.course_id
      AND l.status = 'published'
      AND l.has_quiz = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FORBIDDEN: Bài học chưa xuất bản hoặc không có trắc nghiệm.';
    END IF;

    -- Count total questions
    SELECT count(*)::INT INTO v_total_q
    FROM public.quiz_questions
    WHERE lesson_id = p_lesson_id;

    IF v_total_q = 0 THEN
        RAISE EXCEPTION 'INVALID_STATE: Bài trắc nghiệm chưa có câu hỏi.';
    END IF;

    -- Server-side grading of submitted answers
    FOR v_rec IN (
        SELECT correct_option_index
        FROM public.quiz_questions
        WHERE lesson_id = p_lesson_id
        ORDER BY order_index ASC
    ) LOOP
        IF p_answers IS NOT NULL AND pg_catalog.array_length(p_answers, 1) >= v_i THEN
            IF p_answers[v_i] = v_rec.correct_option_index THEN
                v_correct_count := v_correct_count + 1;
            END IF;
        END IF;
        v_i := v_i + 1;
    END LOOP;

    v_calc_passed := ((v_correct_count::numeric / v_total_q::numeric) >= 0.70);
    v_calc_score := pg_catalog.round((v_correct_count::numeric / v_total_q::numeric) * 100)::INT;

    -- Concurrency row-level lock on student's quiz attempt scoped to current cohort/class
    PERFORM pg_advisory_xact_lock(hashtext('quiz:' || p_student_profile_id::text || ':' || p_lesson_id::text || ':' || v_student.current_class_id::text));

    SELECT * INTO v_existing
    FROM public.quiz_results
    WHERE student_id = p_student_profile_id AND lesson_id = p_lesson_id AND class_id = v_student.current_class_id
    FOR UPDATE;

    IF FOUND THEN
        v_new_highest := GREATEST(v_existing.highest_score, v_calc_score);
        v_new_passed := v_existing.passed OR v_calc_passed;
        v_new_attempts := v_existing.attempts_count + 1;

        UPDATE public.quiz_results
        SET highest_score = v_new_highest,
            passed = v_new_passed,
            attempts_count = v_new_attempts,
            last_attempt_at = now(),
            updated_at = now()
        WHERE student_id = p_student_profile_id AND lesson_id = p_lesson_id AND class_id = v_student.current_class_id;
    ELSE
        v_new_highest := v_calc_score;
        v_new_passed := v_calc_passed;
        v_new_attempts := 1;

        INSERT INTO public.quiz_results (
            student_id, lesson_id, class_id, highest_score, attempts_count, passed, last_attempt_at
        )
        VALUES (
            p_student_profile_id, p_lesson_id, v_student.current_class_id, v_new_highest, 1, v_new_passed, now()
        );
    END IF;

    RETURN QUERY
    SELECT v_calc_score, v_calc_passed, v_new_highest, v_new_attempts;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_submit_quiz_attempt(UUID, UUID, INT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m3_submit_quiz_attempt(UUID, UUID, INT[]) TO service_role;

-- 3.4b Reserve Practice Upload (DB-derived verification, atomic advisory lock, finite pending cap)
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
SET search_path = pg_catalog, public, private
AS $$
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
    -- Verify caller matches student ID
    IF public.current_role() <> 'student' OR public.current_profile_id() <> p_student_id THEN
        RAISE EXCEPTION 'FORBIDDEN: Chỉ học sinh sở hữu mới được đặt trước lượt tải tệp.';
    END IF;

    -- Atomic advisory lock per student and lesson
    PERFORM pg_advisory_xact_lock(hashtext('reservation:' || p_student_id::text || ':' || p_lesson_id::text));

    -- DB-derived active student verification
    SELECT * INTO v_student
    FROM public.students s
    JOIN public.profiles p ON p.id = s.id
    WHERE s.id = p_student_id
      AND s.status IN ('active', 'transferred')
      AND p.status = 'active';

    IF NOT FOUND OR v_student.current_class_id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Học sinh không hoạt động hoặc chưa được phân vào lớp.';
    END IF;

    -- DB-derived active class verification
    SELECT * INTO v_class
    FROM public.classes c
    WHERE c.id = v_student.current_class_id
      AND c.status = 'active';

    IF NOT FOUND OR v_class.course_id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Lớp học chưa kích hoạt hoặc chưa được gán khóa học.';
    END IF;

    -- DB-derived published lesson & file_allowed practice verification
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

    -- Verify submission resubmit lock
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

    -- Validate extension against allowlist
    v_clean_ext := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_file_extension, '')));
    IF v_clean_ext NOT IN ('zip', 'pdf', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'py', 'js', 'html', 'css', 'json', 'md', 'sb3') THEN
        RAISE EXCEPTION 'INVALID_FILE_TYPE: Định dạng tệp không được hỗ trợ.';
    END IF;

    -- Enforce finite pending cap across all uncommitted reservations (including expired or claimed)
    SELECT count(*)::INT INTO v_pending_count
    FROM public.m3_upload_reservations r
    WHERE r.student_id = p_student_id
      AND r.lesson_id = p_lesson_id
      AND r.class_id = v_student.current_class_id
      AND r.status IN ('reserved', 'claimed');

    IF v_pending_count >= 2 THEN
        RAISE EXCEPTION 'PENDING_UPLOAD_CAP_EXCEEDED: Bạn có quá nhiều yêu cầu tải tệp đang chờ xử lý. Vui lòng hoàn tất hoặc thử lại sau.';
    END IF;

    -- Generate exact random path
    v_token := encode(gen_random_bytes(16), 'hex');
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

-- 3.4c Release Upload Reservation (Strict verification: ownership, unreferenced, and confirmed storage absence)
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
    -- 1. Read student_id and lesson_id via unreserved SELECT (no row lock before advisory lock)
    SELECT r.student_id, r.lesson_id INTO v_init
    FROM public.m3_upload_reservations r
    WHERE r.id = p_reservation_id
      AND r.object_path = p_object_path;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- 2. Acquire transaction advisory lock on student/lesson namespace FIRST
    PERFORM pg_advisory_xact_lock(hashtext('reservation:' || v_init.student_id::text || ':' || v_init.lesson_id::text));

    -- 3. SELECT row FOR UPDATE under the advisory lock and revalidate reservation id + exact object_path + owner
    SELECT * INTO v_res
    FROM public.m3_upload_reservations r
    WHERE r.id = p_reservation_id
      AND r.object_path = p_object_path
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Revalidate ownership: caller must be the student owner or trusted service_role
    IF public.current_role() <> 'service_role' THEN
        IF public.current_role() <> 'student' OR public.current_profile_id() <> v_res.student_id THEN
            RAISE EXCEPTION 'FORBIDDEN: Bạn không có quyền giải phóng lượt đặt trước này.';
        END IF;
    END IF;

    -- 4. Check if referenced by any submission
    IF EXISTS (
        SELECT 1 FROM public.practice_submissions sub
        WHERE sub.content = p_object_path
    ) THEN
        RAISE EXCEPTION 'CANNOT_RELEASE: Tệp này đang được sử dụng trong bài nộp, không thể giải phóng.';
    END IF;

    -- 5. Object-absence check: verify object does NOT exist in storage.objects
    IF EXISTS (
        SELECT 1 FROM storage.objects o
        WHERE o.bucket_id = 'm3-practice-files'
          AND o.name = p_object_path
    ) THEN
        RAISE EXCEPTION 'OBJECT_STILL_EXISTS: Tệp lưu trữ vẫn tồn tại trên hệ thống, không thể giải phóng đặt chỗ.';
    END IF;

    -- 6. Update status to cleaned
    UPDATE public.m3_upload_reservations
    SET status = 'cleaned',
        released_at = now()
    WHERE id = p_reservation_id;

    RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_release_upload_reservation(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.m3_release_upload_reservation(UUID, TEXT) TO authenticated, service_role;

-- 3.4d Cleanup Stale Reservations (Claim stale reservations for opportunistic deletion by caller)
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
BEGIN
    -- Ownership check: caller must be the student owner or trusted service_role
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
    UPDATE public.m3_upload_reservations u
    SET status = 'claimed'
    FROM candidate c
    WHERE u.id = c.id
    RETURNING c.id, c.object_path;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_cleanup_stale_reservations(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.m3_cleanup_stale_reservations(UUID, UUID) TO authenticated, service_role;

-- 3.5 Submit Practice (Server validation of type, size <= 2MB, reservation verify & consume, can_resubmit rule)
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
        -- Atomic lock on reservation namespace to serialize with reserve, cleanup, and release
        PERFORM pg_advisory_xact_lock(hashtext('reservation:' || p_student_profile_id::text || ':' || p_lesson_id::text));

        IF p_file_size_bytes IS NOT NULL AND p_file_size_bytes > 2097152 THEN
            RAISE EXCEPTION 'FILE_TOO_LARGE: Kích thước tệp vượt quá giới hạn 2 MB.';
        END IF;

        -- Strictly bind uploaded file path to current student and lesson
        IF v_clean_content NOT LIKE (p_student_profile_id::text || '/' || p_lesson_id::text || '/%') THEN
            RAISE EXCEPTION 'INVALID_FILE_PATH: Đường dẫn tệp bài nộp không hợp lệ hoặc không thuộc về học sinh và bài học này.';
        END IF;

        -- Validate extension against Plan allowlist
        v_file_ext := pg_catalog.lower(pg_catalog.split_part(v_clean_content, '.', array_length(pg_catalog.string_to_array(v_clean_content, '.'), 1)));
        IF v_file_ext NOT IN ('zip', 'pdf', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'py', 'js', 'html', 'css', 'json', 'md', 'sb3') THEN
            RAISE EXCEPTION 'INVALID_FILE_TYPE: Định dạng tệp không nằm trong danh sách cho phép (ZIP, PDF, PNG, JPG/JPEG, WEBP, TXT, PY, JS, HTML, CSS, JSON, MD, SB3).';
        END IF;

        -- Verify exact reservation exists and is reserved (atomic reservation check)
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

        -- Verify that the object actually exists in storage.objects in bucket m3-practice-files
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

        -- If owner is recorded, ensure ownership binding via private.actor_auth
        IF v_owner IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM private.actor_auth aa
                WHERE aa.profile_id = p_student_profile_id
                  AND aa.auth_user_id = v_owner
            ) THEN
                RAISE EXCEPTION 'FORBIDDEN: Đối tượng tệp lưu trữ không thuộc quyền sở hữu của tài khoản học sinh này.';
            END IF;
        END IF;

        -- Ensure this exact object path is not already tied to another submission
        IF EXISTS (
            SELECT 1 FROM public.practice_submissions sub
            WHERE sub.content = v_clean_content
              AND (sub.student_id <> p_student_profile_id OR sub.lesson_id <> p_lesson_id OR sub.class_id <> v_student.current_class_id)
        ) THEN
            RAISE EXCEPTION 'DUPLICATE_FILE: Tệp này đã được sử dụng cho một bài nộp khác.';
        END IF;
    END IF;

    -- Concurrency lock on practice submission for this student, lesson, and cohort/class
    PERFORM pg_advisory_xact_lock(hashtext('practice:' || p_student_profile_id::text || ':' || p_lesson_id::text || ':' || v_student.current_class_id::text));

    SELECT * INTO v_existing
    FROM public.practice_submissions
    WHERE practice_submissions.student_id = p_student_profile_id
      AND practice_submissions.lesson_id = p_lesson_id
      AND practice_submissions.class_id = v_student.current_class_id
    FOR UPDATE;

    IF FOUND THEN
        -- If approved and teacher hasn't reopened, student cannot resubmit
        IF v_existing.status = 'approved' AND v_existing.can_resubmit = false THEN
            RAISE EXCEPTION 'CANNOT_RESUBMIT_APPROVED: Bài nộp đã được giáo viên duyệt Đạt. Giáo viên phải mở lại quyền nộp bài trước khi học sinh được nộp bản thay thế.';
        END IF;

        -- If replacing a previous file, mark old path for caller cleanup via Storage API (NEVER direct DELETE from storage.objects)
        IF v_existing.type = 'file' AND v_existing.content <> v_clean_content THEN
            v_old_file_path := v_existing.content;
        END IF;

        UPDATE public.practice_submissions
        SET type = v_clean_type,
            content = v_clean_content,
            file_size_bytes = p_file_size_bytes,
            notes = COALESCE(p_notes, ''),
            status = 'submitted',
            teacher_feedback = NULL,
            can_resubmit = true,
            submitted_at = now(),
            updated_at = now()
        WHERE practice_submissions.student_id = p_student_profile_id
          AND practice_submissions.lesson_id = p_lesson_id
          AND practice_submissions.class_id = v_student.current_class_id
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
        UPDATE public.m3_upload_reservations
        SET status = 'consumed',
            consumed_at = now()
        WHERE id = v_res_id;
    END IF;

    RETURN QUERY
    SELECT v_res.id, v_res.student_id, v_res.lesson_id, v_res.type, v_res.content,
           v_res.file_size_bytes, v_res.notes, v_res.status, v_res.can_resubmit, v_res.submitted_at, v_old_file_path;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_submit_practice(UUID, UUID, TEXT, TEXT, INT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m3_submit_practice(UUID, UUID, TEXT, TEXT, INT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.m3_submit_practice(UUID, UUID, TEXT, TEXT, INT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m3_submit_practice(UUID, UUID, TEXT, TEXT, INT, TEXT) TO service_role;

-- 3.6 Grade Practice Submission (Teacher assigned to class or Admin only)
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
DECLARE
    v_actor RECORD;
    v_sub RECORD;
    v_student RECORD;
    v_clean_status TEXT;
    v_res RECORD;
    v_can_resubmit BOOLEAN;
BEGIN
    SELECT * INTO v_actor
    FROM public.profiles
    WHERE profiles.id = p_actor_profile_id AND status = 'active';

    IF NOT FOUND OR v_actor.role NOT IN ('admin', 'teacher') THEN
        RAISE EXCEPTION 'FORBIDDEN: Chỉ có Giáo viên phụ trách hoặc Quản trị viên mới được chấm bài.';
    END IF;

    SELECT * INTO v_sub
    FROM public.practice_submissions
    WHERE practice_submissions.id = p_submission_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Không tìm thấy bài nộp.';
    END IF;

    SELECT * INTO v_student
    FROM public.students
    WHERE students.id = v_sub.student_id;

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

    -- Invariant: an approved submission CANNOT be demoted to needs_revision directly.
    -- The teacher must first reopen it (m3_reopen_submission), and the student must submit a replacement (which resets status to 'submitted').
    IF v_sub.status = 'approved' AND v_clean_status = 'needs_revision' THEN
        RAISE EXCEPTION 'CANNOT_DEMOTE_APPROVED: Bài nộp đã được duyệt Đạt không thể chuyển trực tiếp sang Cần làm lại. Giáo viên cần mở lại quyền nộp bài và chờ học sinh nộp bản thay thế mới.';
    END IF;

    -- Approved locks submission unless reopened; needs_revision allows resubmission
    v_can_resubmit := (v_clean_status = 'needs_revision');

    UPDATE public.practice_submissions
    SET status = v_clean_status,
        teacher_feedback = COALESCE(p_feedback, ''),
        graded_at = now(),
        graded_by = p_actor_profile_id,
        can_resubmit = v_can_resubmit,
        updated_at = now()
    WHERE practice_submissions.id = p_submission_id
    RETURNING * INTO v_res;

    RETURN QUERY
    SELECT v_res.id, v_res.student_id, v_res.lesson_id, v_res.status,
           v_res.teacher_feedback, v_res.can_resubmit, v_res.graded_at;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_grade_submission(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m3_grade_submission(UUID, UUID, TEXT, TEXT) TO service_role;

-- 3.7 Reopen Approved Submission (Teacher assigned or Admin only; sets can_resubmit = true without erasing approved status)
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
DECLARE
    v_actor RECORD;
    v_sub RECORD;
    v_student RECORD;
    v_res RECORD;
BEGIN
    SELECT * INTO v_actor
    FROM public.profiles
    WHERE profiles.id = p_actor_profile_id AND status = 'active';

    IF NOT FOUND OR v_actor.role NOT IN ('admin', 'teacher') THEN
        RAISE EXCEPTION 'FORBIDDEN: Chỉ có Giáo viên phụ trách hoặc Quản trị viên mới được mở lại quyền nộp bài.';
    END IF;

    SELECT * INTO v_sub
    FROM public.practice_submissions
    WHERE practice_submissions.id = p_submission_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Không tìm thấy bài nộp.';
    END IF;

    SELECT * INTO v_student
    FROM public.students
    WHERE students.id = v_sub.student_id;

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

    -- Set can_resubmit = true; preserve approved status until student submits replacement
    UPDATE public.practice_submissions
    SET can_resubmit = true,
        updated_at = now()
    WHERE practice_submissions.id = p_submission_id
    RETURNING * INTO v_res;

    RETURN QUERY
    SELECT v_res.id, v_res.student_id, v_res.lesson_id, v_res.status, v_res.can_resubmit;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_reopen_submission(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m3_reopen_submission(UUID, UUID) TO service_role;

-- 3.8 Transfer Student with Destination Progress Reset (Admin only)
CREATE OR REPLACE FUNCTION public.m3_transfer_student(
    p_admin_profile_id UUID,
    p_student_id UUID,
    p_target_class_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
    v_target_class RECORD;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = p_admin_profile_id AND role = 'admin' AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN: Chỉ có Quản trị viên mới được chuyển lớp học sinh.';
    END IF;

    SELECT * INTO v_target_class
    FROM public.classes
    WHERE classes.id = p_target_class_id AND status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Lớp học đích không tồn tại hoặc không ở trạng thái hoạt động.';
    END IF;

    -- Concurrency lock on student
    PERFORM pg_advisory_xact_lock(hashtext('student:' || p_student_id::text));

    UPDATE public.students
    SET current_class_id = p_target_class_id,
        status = 'active',
        updated_at = now()
    WHERE students.id = p_student_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Không tìm thấy học sinh cần chuyển lớp.';
    END IF;

    -- Invariant: Do NOT delete historical results/submissions of source class/cohort.
    -- Historical results stay preserved under the source class_id.
    -- Moving to p_target_class_id automatically starts a fresh progress for the target class/cohort.

    RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_transfer_student(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m3_transfer_student(UUID, UUID, UUID) TO service_role;

-- 3.9 Reset Student Progress explicitly (Admin only)
CREATE OR REPLACE FUNCTION public.m3_reset_student_progress(
    p_admin_profile_id UUID,
    p_student_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = p_admin_profile_id AND role = 'admin' AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN: Chỉ có Quản trị viên mới được đặt lại kết quả học tập.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('student:' || p_student_id::text));

    DELETE FROM public.quiz_results WHERE student_id = p_student_id;
    DELETE FROM public.practice_submissions WHERE student_id = p_student_id;

    RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_reset_student_progress(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m3_reset_student_progress(UUID, UUID) TO service_role;

-- 3.10 Set Class Course atomically (Admin only)
CREATE OR REPLACE FUNCTION public.m3_set_class_course(
    p_admin_profile_id UUID,
    p_class_id UUID,
    p_course_id UUID
)
RETURNS TABLE (
    id UUID,
    course_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = p_admin_profile_id AND role = 'admin' AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN: Chỉ có Quản trị viên mới được gán khóa học cho lớp.';
    END IF;

    IF p_course_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.courses WHERE courses.id = p_course_id
    ) THEN
        RAISE EXCEPTION 'NOT_FOUND: Khóa học không tồn tại.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('class:' || p_class_id::text));

    UPDATE public.classes
    SET course_id = p_course_id,
        updated_at = now()
    WHERE classes.id = p_class_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Lớp học không tồn tại.';
    END IF;

    RETURN QUERY
    SELECT c.id, c.course_id FROM public.classes c WHERE c.id = p_class_id;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_set_class_course(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m3_set_class_course(UUID, UUID, UUID) TO service_role;

-- 3.11 Save Class atomically with Course Assignment (Admin only, resolves omitted fields inside transaction)
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
        SELECT 1 FROM public.profiles
        WHERE profiles.id = p_admin_profile_id AND role = 'admin' AND status = 'active'
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
            IF NOT EXISTS (SELECT 1 FROM public.courses WHERE courses.id = p_course_id) THEN
                RAISE EXCEPTION 'NOT_FOUND: Khóa học không tồn tại.';
            END IF;
        END IF;

        IF p_teacher_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.profiles
                WHERE profiles.id = p_teacher_id AND role = 'teacher' AND status = 'active'
            ) THEN
                RAISE EXCEPTION 'NOT_FOUND: Hồ sơ giáo viên không hợp lệ hoặc không hoạt động.';
            END IF;
        END IF;

        -- Lock code namespace
        PERFORM pg_advisory_xact_lock(hashtext('class_code:' || pg_catalog.lower(v_final_code)));

        IF EXISTS (SELECT 1 FROM public.classes WHERE pg_catalog.lower(classes.code) = pg_catalog.lower(v_final_code)) THEN
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
        FROM public.classes
        WHERE classes.id = v_class_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'NOT_FOUND: Không tìm thấy lớp học: %', v_class_id;
        END IF;

        -- Resolve code (missing vs updated)
        IF p_code IS NOT NULL AND pg_catalog.btrim(p_code) <> '' THEN
            v_final_code := pg_catalog.btrim(p_code);
            IF pg_catalog.lower(v_class.code) <> pg_catalog.lower(v_final_code) THEN
                PERFORM pg_advisory_xact_lock(hashtext('class_code:' || pg_catalog.lower(v_final_code)));
                IF EXISTS (SELECT 1 FROM public.classes WHERE pg_catalog.lower(classes.code) = pg_catalog.lower(v_final_code) AND classes.id <> v_class_id) THEN
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
                IF NOT EXISTS (SELECT 1 FROM public.courses WHERE courses.id = p_course_id) THEN
                    RAISE EXCEPTION 'NOT_FOUND: Khóa học không tồn tại.';
                END IF;
            END IF;
            v_final_course_id := p_course_id;
        ELSE
            v_final_course_id := v_class.course_id;
        END IF;

        UPDATE public.classes
        SET code = v_final_code,
            name = v_final_name,
            course_id = v_final_course_id,
            updated_at = now()
        WHERE classes.id = v_class_id
        RETURNING * INTO v_class;

        -- Resolve teacher assignment (missing vs updated)
        IF p_update_teacher THEN
            IF p_teacher_id IS NOT NULL THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE profiles.id = p_teacher_id AND role = 'teacher' AND status = 'active'
                ) THEN
                    RAISE EXCEPTION 'NOT_FOUND: Hồ sơ giáo viên không hợp lệ hoặc không hoạt động.';
                END IF;
            END IF;

            DELETE FROM public.class_teachers WHERE class_teachers.class_id = v_class_id;
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

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES FOR M3 TABLES
-- ============================================================================

GRANT SELECT ON public.courses, public.lessons, public.quiz_results, public.practice_submissions TO authenticated;
GRANT ALL ON public.courses, public.lessons, public.quiz_questions, public.quiz_results, public.practice_submissions TO service_role;
REVOKE ALL ON public.courses, public.lessons, public.quiz_questions, public.quiz_results, public.practice_submissions FROM anon;

-- Explicitly revoke all direct access to quiz_questions/answer keys from authenticated users (Finding 10)
REVOKE ALL ON public.quiz_questions FROM authenticated, anon, PUBLIC;
GRANT ALL ON public.quiz_questions TO service_role;

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_submissions ENABLE ROW LEVEL SECURITY;

-- 4.1 COURSES RLS
DROP POLICY IF EXISTS "m3_courses_select_authenticated" ON public.courses;
DROP POLICY IF EXISTS "m3_courses_admin_write" ON public.courses;

CREATE POLICY "m3_courses_select_authenticated" ON public.courses
    FOR SELECT TO authenticated
    USING (
        public.is_active_admin()
        OR (
            public.current_role() = 'teacher'
            AND EXISTS (
                SELECT 1 FROM public.classes c
                JOIN public.class_teachers ct ON ct.class_id = c.id
                WHERE ct.teacher_profile_id = public.current_profile_id()
                  AND c.course_id = courses.id
                  AND c.status = 'active'
            )
        )
        OR (
            public.current_role() = 'student'
            AND EXISTS (
                SELECT 1 FROM public.students s
                JOIN public.classes c ON c.id = s.current_class_id
                WHERE s.id = public.current_profile_id()
                  AND c.course_id = courses.id
                  AND s.status IN ('active', 'transferred')
                  AND c.status = 'active'
            )
        )
    );

CREATE POLICY "m3_courses_admin_write" ON public.courses
    FOR ALL TO authenticated
    USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());

-- 4.2 LESSONS RLS
DROP POLICY IF EXISTS "m3_lessons_admin_select" ON public.lessons;
DROP POLICY IF EXISTS "m3_lessons_teacher_select" ON public.lessons;
DROP POLICY IF EXISTS "m3_lessons_student_select" ON public.lessons;
DROP POLICY IF EXISTS "m3_lessons_admin_write" ON public.lessons;

CREATE POLICY "m3_lessons_admin_select" ON public.lessons
    FOR SELECT TO authenticated
    USING (public.is_active_admin());

CREATE POLICY "m3_lessons_teacher_select" ON public.lessons
    FOR SELECT TO authenticated
    USING (
        public.current_role() = 'teacher'
        AND EXISTS (
            SELECT 1 FROM public.class_teachers ct
            JOIN public.classes c ON c.id = ct.class_id
            WHERE ct.teacher_profile_id = public.current_profile_id()
              AND c.course_id = lessons.course_id
              AND c.status = 'active'
        )
    );

CREATE POLICY "m3_lessons_student_select" ON public.lessons
    FOR SELECT TO authenticated
    USING (
        public.current_role() = 'student'
        AND status = 'published'
        AND EXISTS (
            SELECT 1 FROM public.students s
            JOIN public.classes c ON c.id = s.current_class_id
            WHERE s.id = public.current_profile_id()
              AND c.course_id = lessons.course_id
              AND s.status IN ('active', 'transferred')
              AND c.status = 'active'
        )
    );

CREATE POLICY "m3_lessons_admin_write" ON public.lessons
    FOR ALL TO authenticated
    USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());

-- 4.3 QUIZ QUESTIONS RLS (Strictly service-role-only; no SELECT or access for authenticated)
DROP POLICY IF EXISTS "m3_quiz_questions_select_staff" ON public.quiz_questions;
DROP POLICY IF EXISTS "m3_quiz_questions_admin_write" ON public.quiz_questions;

-- No policies are granted to authenticated on public.quiz_questions.
-- Direct access is completely blocked (REVOKE ALL FROM authenticated, anon, PUBLIC).
-- Only service_role can read/write quiz_questions (e.g. server-side grading & sanitized Edge DTOs).

-- 4.4 QUIZ RESULTS RLS
DROP POLICY IF EXISTS "m3_quiz_results_admin_select" ON public.quiz_results;
DROP POLICY IF EXISTS "m3_quiz_results_teacher_select" ON public.quiz_results;
DROP POLICY IF EXISTS "m3_quiz_results_student_select" ON public.quiz_results;

CREATE POLICY "m3_quiz_results_admin_select" ON public.quiz_results
    FOR SELECT TO authenticated
    USING (public.is_active_admin());

CREATE POLICY "m3_quiz_results_teacher_select" ON public.quiz_results
    FOR SELECT TO authenticated
    USING (
        public.current_role() = 'teacher'
        AND EXISTS (
            SELECT 1 FROM public.students s
            JOIN public.classes c ON c.id = s.current_class_id
            JOIN public.class_teachers ct ON ct.class_id = s.current_class_id
            WHERE s.id = quiz_results.student_id
              AND quiz_results.class_id = s.current_class_id
              AND ct.teacher_profile_id = public.current_profile_id()
              AND s.status IN ('active', 'transferred')
              AND c.status = 'active'
        )
    );

CREATE POLICY "m3_quiz_results_student_select" ON public.quiz_results
    FOR SELECT TO authenticated
    USING (
        public.current_role() = 'student'
        AND student_id = public.current_profile_id()
        AND EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.id = public.current_profile_id()
              AND s.current_class_id = quiz_results.class_id
              AND s.status IN ('active', 'transferred')
        )
    );

-- 4.5 PRACTICE SUBMISSIONS RLS
DROP POLICY IF EXISTS "m3_submissions_admin_select" ON public.practice_submissions;
DROP POLICY IF EXISTS "m3_submissions_teacher_select" ON public.practice_submissions;
DROP POLICY IF EXISTS "m3_submissions_student_select" ON public.practice_submissions;

CREATE POLICY "m3_submissions_admin_select" ON public.practice_submissions
    FOR SELECT TO authenticated
    USING (public.is_active_admin());

CREATE POLICY "m3_submissions_teacher_select" ON public.practice_submissions
    FOR SELECT TO authenticated
    USING (
        public.current_role() = 'teacher'
        AND EXISTS (
            SELECT 1 FROM public.students s
            JOIN public.classes c ON c.id = s.current_class_id
            JOIN public.class_teachers ct ON ct.class_id = s.current_class_id
            WHERE s.id = practice_submissions.student_id
              AND practice_submissions.class_id = s.current_class_id
              AND ct.teacher_profile_id = public.current_profile_id()
              AND s.status IN ('active', 'transferred')
              AND c.status = 'active'
        )
    );

CREATE POLICY "m3_submissions_student_select" ON public.practice_submissions
    FOR SELECT TO authenticated
    USING (
        public.current_role() = 'student'
        AND student_id = public.current_profile_id()
        AND EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.id = public.current_profile_id()
              AND s.current_class_id = practice_submissions.class_id
              AND s.status IN ('active', 'transferred')
        )
    );

-- 4.6 STORAGE OBJECTS RLS FOR M3 PRACTICE BUCKET
DROP POLICY IF EXISTS "m3_storage_select_policy" ON storage.objects;
DROP POLICY IF EXISTS "m3_storage_student_insert" ON storage.objects;

CREATE POLICY "m3_storage_select_policy" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'm3-practice-files' AND (
            public.is_active_admin()
            OR (
                public.current_role() = 'student'
                AND (storage.foldername(name))[1] = public.current_profile_id()::text
                AND EXISTS (
                    SELECT 1
                    FROM public.students s
                    JOIN public.classes c ON c.id = s.current_class_id
                    JOIN public.practice_submissions sub ON sub.student_id = s.id AND sub.class_id = c.id
                    WHERE s.id = public.current_profile_id()
                      AND s.status IN ('active', 'transferred')
                      AND c.status = 'active'
                      AND sub.content = name
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
                    WHERE s.id::text = (storage.foldername(name))[1]
                      AND ct.teacher_profile_id = public.current_profile_id()
                      AND s.status IN ('active', 'transferred')
                      AND c.status = 'active'
                      AND sub.content = name
                )
            )
        )
    );

-- Storage policies for opportunistic cleanup of claimed stale reservations
DROP POLICY IF EXISTS "m3_storage_student_claimed_select" ON storage.objects;
CREATE POLICY "m3_storage_student_claimed_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'm3-practice-files'
        AND public.current_role() = 'student'
        AND (storage.foldername(name))[1] = public.current_profile_id()::text
        AND EXISTS (
            SELECT 1
            FROM public.m3_upload_reservations res
            WHERE res.object_path = name
              AND res.student_id = public.current_profile_id()
              AND res.status = 'claimed'
              AND NOT EXISTS (
                  SELECT 1 FROM public.practice_submissions sub
                  WHERE sub.content = name
              )
        )
    );

DROP POLICY IF EXISTS "m3_storage_student_claimed_delete" ON storage.objects;
CREATE POLICY "m3_storage_student_claimed_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'm3-practice-files'
        AND public.current_role() = 'student'
        AND (storage.foldername(name))[1] = public.current_profile_id()::text
        AND EXISTS (
            SELECT 1
            FROM public.m3_upload_reservations res
            WHERE res.object_path = name
              AND res.student_id = public.current_profile_id()
              AND res.status = 'claimed'
              AND NOT EXISTS (
                  SELECT 1 FROM public.practice_submissions sub
                  WHERE sub.content = name
              )
        )
    );

-- Helper function (VOLATILE SECURITY DEFINER) to atomically verify Storage INSERT and lock transaction against cleanup race
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
    IF bucket_id <> 'm3-practice-files' THEN
        RETURN FALSE;
    END IF;

    IF public.current_role() <> 'student' THEN
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

    IF v_student_id <> public.current_profile_id() THEN
        RETURN FALSE;
    END IF;

    -- 1. ACQUIRE TRANSACTION ADVISORY LOCK on student+lesson BEFORE checking reservation.
    -- Because this function is VOLATILE, Postgres executes it in the INSERT transaction
    -- and holds the xact lock until the INSERT transaction commits or aborts.
    -- This serializes with cleanup/claim/release and prevents race conditions.
    PERFORM pg_advisory_xact_lock(hashtext('reservation:' || v_student_id::text || ':' || v_lesson_id::text));

    -- 2. Extension check against allowlist
    v_clean_ext := pg_catalog.lower(storage.extension(name));
    IF v_clean_ext NOT IN ('zip', 'pdf', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'py', 'js', 'html', 'css', 'json', 'md', 'sb3') THEN
        RETURN FALSE;
    END IF;

    -- 3. Verify active student, class, and published lesson with practice
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
    ) THEN
        RETURN FALSE;
    END IF;

    -- 4. Verify exact unexpired reservation exists and is reserved
    IF NOT EXISTS (
        SELECT 1
        FROM public.m3_upload_reservations res
        WHERE res.object_path = name
          AND res.student_id = v_student_id
          AND res.status = 'reserved'
          AND res.expires_at > now()
    ) THEN
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_check_storage_insert_permission(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.m3_check_storage_insert_permission(TEXT, TEXT) TO authenticated, service_role;

DROP POLICY IF EXISTS "m3_storage_student_insert" ON storage.objects;
CREATE POLICY "m3_storage_student_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        public.m3_check_storage_insert_permission(bucket_id, name)
    );

-- 4.7 M3 UPLOAD RESERVATIONS RLS
ALTER TABLE public.m3_upload_reservations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.m3_upload_reservations TO authenticated;
GRANT ALL ON public.m3_upload_reservations TO service_role;
REVOKE ALL ON public.m3_upload_reservations FROM anon, PUBLIC;

DROP POLICY IF EXISTS "m3_reservations_student_select" ON public.m3_upload_reservations;
CREATE POLICY "m3_reservations_student_select" ON public.m3_upload_reservations
    FOR SELECT TO authenticated
    USING (student_id = public.current_profile_id());

-- ============================================================================
-- 5. SYNTHETIC FIXTURE SEED DATA FOR MILESTONE 3
-- ============================================================================

-- 5.1 Insert Synthetic Course with Fixed 14 Slots
INSERT INTO public.courses (id, title, description, total_sessions, is_fixture)
VALUES (
    '44444444-4444-4444-8444-444444444401',
    'Khóa học Robotics K14 — Lập trình & Chế tạo Robot thông minh',
    'Chương trình chuẩn 14 buổi học khám phá robotics, cảm biến và tự động hóa cho học sinh MindX.',
    14,
    true
)
ON CONFLICT (id) DO UPDATE
SET title = EXCLUDED.title,
    description = EXCLUDED.description,
    total_sessions = 14,
    is_fixture = true;

-- Assign Course to ROB-K14-01 and ROB-K14-02; Leave ROB-K14-03 unassigned (NULL)
UPDATE public.classes
SET course_id = '44444444-4444-4444-8444-444444444401'
WHERE code IN ('ROB-K14-01', 'ROB-K14-02');

UPDATE public.classes
SET course_id = NULL
WHERE code = 'ROB-K14-03';

-- 5.2 Insert 14 Sessions for Course 44444444-4444-4444-8444-444444444401
-- Buổi 1: Published, Quiz-only
INSERT INTO public.lessons (
    id, course_id, session_number, title, description, materials, video_url,
    status, has_quiz, has_practice, practice_mode
)
VALUES (
    '55555555-5555-4555-8555-555555555501',
    '44444444-4444-4444-8444-444444444401',
    1,
    'Buổi 1: Giới thiệu kiến trúc phần cứng Robot & Vi điều khiển',
    'Tìm hiểu tổng quan về bo mạch vi điều khiển, cổng kết nối I/O và nguyên lý cấp nguồn an toàn cho động cơ.',
    'Tài liệu PDF: Sơ đồ chân cắm vi điều khiển và cấu trúc nguồn điện.\nLiên kết tham khảo: https://docs.arduino.cc',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    'published',
    true,
    false,
    'link_only'
)
ON CONFLICT (course_id, session_number) DO UPDATE
SET title = EXCLUDED.title,
    description = EXCLUDED.description,
    materials = EXCLUDED.materials,
    video_url = EXCLUDED.video_url,
    status = EXCLUDED.status,
    has_quiz = EXCLUDED.has_quiz,
    has_practice = EXCLUDED.has_practice,
    practice_mode = EXCLUDED.practice_mode;

-- Buổi 2: Published, Practice-only (File allowed)
INSERT INTO public.lessons (
    id, course_id, session_number, title, description, materials, video_url,
    status, has_quiz, has_practice, practice_mode
)
VALUES (
    '55555555-5555-4555-8555-555555555502',
    '44444444-4444-4444-8444-444444444401',
    2,
    'Buổi 2: Thiết kế khung xe 2 bánh vi sai & Lập trình di chuyển cơ bản',
    'Lắp ráp khung gầm chassis, kết nối driver động cơ L298N và viết hàm điều khiển tiến, lùi, quay trái, quay phải.',
    'Hướng dẫn bước: Lắp ráp cơ khí và đấu nối dây tín hiệu PWM.\nCode mẫu: MoveForward(), MoveBackward(), StopRobot().',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    'published',
    false,
    true,
    'file_allowed'
)
ON CONFLICT (course_id, session_number) DO UPDATE
SET title = EXCLUDED.title,
    description = EXCLUDED.description,
    materials = EXCLUDED.materials,
    video_url = EXCLUDED.video_url,
    status = EXCLUDED.status,
    has_quiz = EXCLUDED.has_quiz,
    has_practice = EXCLUDED.has_practice,
    practice_mode = EXCLUDED.practice_mode;

-- Buổi 3: Published, Both Quiz & Practice
INSERT INTO public.lessons (
    id, course_id, session_number, title, description, materials, video_url,
    status, has_quiz, has_practice, practice_mode
)
VALUES (
    '55555555-5555-4555-8555-555555555503',
    '44444444-4444-4444-8444-444444444401',
    3,
    'Buổi 3: Cảm biến siêu âm & Thuật toán tránh vật cản tự động',
    'Nguyên lý phát và thu sóng siêu âm HC-SR04, tính toán khoảng cách theo vận tốc âm thanh và thuật toán phản xạ đổi hướng.',
    'Tài liệu thuật toán: Lưu đồ khối quét vật cản và ngưỡng khoảng cách an toàn (d < 20cm).',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    'published',
    true,
    true,
    'file_allowed'
)
ON CONFLICT (course_id, session_number) DO UPDATE
SET title = EXCLUDED.title,
    description = EXCLUDED.description,
    materials = EXCLUDED.materials,
    video_url = EXCLUDED.video_url,
    status = EXCLUDED.status,
    has_quiz = EXCLUDED.has_quiz,
    has_practice = EXCLUDED.has_practice,
    practice_mode = EXCLUDED.practice_mode;

-- Buổi 4 đến 14: Draft (Bản nháp)
DO $$
DECLARE
    v_s INT;
    v_lid UUID;
    v_titles TEXT[] := ARRAY[
        'Buổi 4: Cảm biến hồng ngoại dò đường Line-tracking',
        'Buổi 5: Thuật toán PID cơ bản điều khiển bám đường',
        'Buổi 6: Giao tiếp không dây Bluetooth & Điều khiển qua App',
        'Buổi 7: Cánh tay robot gắp vật thể 3 bậc tự do (3-DOF)',
        'Buổi 8: Lập trình Servo và tọa độ góc quay cánh tay',
        'Buổi 9: Tích hợp cánh tay gắp lên xe robot tự hành',
        'Buổi 10: Nhận diện vật thể bằng Camera AI cơ bản',
        'Buổi 11: Phân loại màu sắc và định vị vật thể trên băng chuyền',
        'Buổi 12: Hoàn thiện mô hình Robot Logistics Mini',
        'Buổi 13: Thử nghiệm thực địa & Tối ưu hóa hiệu năng thi đấu',
        'Buổi 14: Báo cáo dự án tốt nghiệp & Trình diễn Robot cuối khóa'
    ];
BEGIN
    FOR v_s IN 4..14 LOOP
        INSERT INTO public.lessons (
            course_id, session_number, title, description, materials, video_url,
            status, has_quiz, has_practice, practice_mode
        )
        VALUES (
            '44444444-4444-4444-8444-444444444401',
            v_s,
            v_titles[v_s - 3],
            'Nội dung chuẩn bị cho buổi ' || v_s || ' (Đang ở trạng thái Bản nháp, giáo viên đang hoàn thiện giáo án).',
            'Tài liệu đang soạn thảo.',
            '',
            'draft',
            false,
            false,
            'link_only'
        )
        ON CONFLICT (course_id, session_number) DO UPDATE
        SET title = EXCLUDED.title,
            description = EXCLUDED.description;
    END LOOP;
END;
$$;

-- 5.3 Questions for Buổi 1 and Buổi 3
DELETE FROM public.quiz_questions
WHERE lesson_id IN ('55555555-5555-4555-8555-555555555501', '55555555-5555-4555-8555-555555555503');

INSERT INTO public.quiz_questions (lesson_id, prompt, options, correct_option_index, order_index)
VALUES
    (
        '55555555-5555-4555-8555-555555555501',
        'Chân tín hiệu PWM (Pulse Width Modulation) trên bo mạch vi điều khiển thường dùng để làm gì?',
        '["Điều chỉnh tốc độ động cơ hoặc độ sáng đèn LED", "Chỉ dùng để bật tắt nguồn điện chính", "Đọc tín hiệu analog từ cảm biến nhiệt độ", "Cấp nguồn trực tiếp 220V"]'::jsonb,
        0,
        0
    ),
    (
        '55555555-5555-4555-8555-555555555501',
        'Vì sao không nên cấp nguồn trực tiếp cho động cơ DC từ chân 5V của vi điều khiển mà phải qua mạch cầu H (Driver)?',
        '["Vì động cơ tiêu thụ dòng điện lớn có thể gây sụt áp hoặc cháy chip vi điều khiển", "Vì động cơ chỉ chạy được với điện áp xoay chiều AC", "Vì vi điều khiển không có chân nối đất GND", "Vì động cơ sẽ quay ngược chiều kim đồng hồ"]'::jsonb,
        0,
        1
    ),
    (
        '55555555-5555-4555-8555-555555555503',
        'Vận tốc truyền âm thanh trong không khí ở điều kiện chuẩn xấp xỉ bao nhiêu?',
        '["Khoảng 340 m/s (343 m/s)", "Khoảng 300.000 km/s (tốc độ ánh sáng)", "Khoảng 1.500 m/s", "Khoảng 34 m/s"]'::jsonb,
        0,
        0
    ),
    (
        '55555555-5555-4555-8555-555555555503',
        'Khi tính khoảng cách từ cảm biến siêu âm HC-SR04, tại sao phải chia đôi (chia cho 2) thời gian đo được?',
        '["Vì sóng âm cần đi đến vật cản rồi phản xạ ngược trở lại cảm biến", "Vì cảm biến có 2 mắt phát và thu", "Vì vi điều khiển đếm xung theo chu kỳ kép", "Vì vận tốc âm thanh bị giảm đi một nửa khi gặp vật cản"]'::jsonb,
        0,
        1
    );

-- 5.4 Sample Initial Submission & Quiz Results for Student 1 (Lê Bảo Nam)
INSERT INTO public.quiz_results (student_id, lesson_id, class_id, highest_score, attempts_count, passed, last_attempt_at)
VALUES (
    '33333333-3333-4333-8333-333333333301',
    '55555555-5555-4555-8555-555555555501',
    '11111111-1111-4111-8111-111111111101',
    100,
    1,
    true,
    now()
)
ON CONFLICT (student_id, lesson_id, class_id) DO UPDATE
SET highest_score = EXCLUDED.highest_score,
    passed = EXCLUDED.passed,
    attempts_count = EXCLUDED.attempts_count;

INSERT INTO public.practice_submissions (
    student_id, lesson_id, class_id, type, content, file_size_bytes, notes, status, teacher_feedback, can_resubmit, submitted_at, graded_at, graded_by
)
VALUES (
    '33333333-3333-4333-8333-333333333301',
    '55555555-5555-4555-8555-555555555502',
    '11111111-1111-4111-8111-111111111101',
    'link',
    'https://github.com/mindx-test/robotics-k14-chassis-nam',
    NULL,
    'Em đã lắp xong khung gầm và viết xong 4 hàm di chuyển.',
    'approved',
    'Mã nguồn sạch sẽ, các hàm điều hướng hoạt động mượt mà. Đạt yêu cầu xuất sắc!',
    false,
    now() - interval '2 days',
    now() - interval '1 day',
    '22222222-2222-4222-8222-222222222201'
)
ON CONFLICT (student_id, lesson_id, class_id) DO UPDATE
SET status = EXCLUDED.status,
    teacher_feedback = EXCLUDED.teacher_feedback,
    can_resubmit = EXCLUDED.can_resubmit;
