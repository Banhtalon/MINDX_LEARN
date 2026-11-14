-- ============================================================================
-- MINDX LEARN — Atomic Quiz Completeness Validation, Snapshot Check & Answer Review Return
-- Cập nhật public.m3_submit_quiz_attempt để:
-- 1. Giữ nguyên thứ tự khóa M5 (m4_teaching_sync -> student:<id> -> m5_close:<class_id> -> classes KEY SHARE).
-- 2. Kiểm tra snapshot câu hỏi p_expected_question_ids (nếu client gửi kèm) ngay trong transaction khóa m4_teaching_sync;
--    nếu Admin vừa sửa/đổi thứ tự câu hỏi kể cả cùng số lượng -> từ chối QUIZ_CHANGED_MID_ATTEMPT.
-- 3. Kiểm tra đủ số câu hỏi, không có phần tử NULL/âm và index đáp án nằm trong bounds của quiz_questions.options
--    ngay trong cùng transaction đã khóa m4_teaching_sync.
-- 4. Trả về cột answer_review JSONB khớp 100% với bộ câu hỏi vừa được chấm điểm.
-- 5. Đồng bộ làm rõ câu chữ Câu 17 (66666666-6666-4666-8666-666666666717) trên DB thực tế để chỉ có 1 đáp án đúng QLineEdit.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.m3_submit_quiz_attempt(UUID, UUID, INT[]);
DROP FUNCTION IF EXISTS public.m3_submit_quiz_attempt(UUID, UUID, INT[], TEXT[]);

CREATE OR REPLACE FUNCTION public.m3_submit_quiz_attempt(
    p_student_profile_id UUID,
    p_lesson_id UUID,
    p_answers INT[],
    p_expected_question_ids TEXT[] DEFAULT NULL
)
RETURNS TABLE (
    score INT,
    passed BOOLEAN,
    highest_score INT,
    attempts_count INT,
    answer_review JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
    v_lesson RECORD;
    v_student RECORD;
    v_class RECORD;
    v_total_q INT := 0;
    v_correct_count INT := 0;
    v_calc_score INT;
    v_calc_passed BOOLEAN;
    v_existing RECORD;
    v_new_highest INT;
    v_new_passed BOOLEAN;
    v_new_attempts INT;
    v_rec RECORD;
    v_class_id UUID;
    v_student_status TEXT;
    v_profile_status TEXT;
    v_opt_len INT;
    v_ans INT;
    v_review JSONB := '[]'::jsonb;
BEGIN
    -- R3-03: Lấy khóa tuần tự toàn cục: m4_teaching_sync -> student:<id>
    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));
    PERFORM pg_advisory_xact_lock(hashtext('student:' || p_student_profile_id::text));

    SELECT s.current_class_id, s.status, p.status INTO v_class_id, v_student_status, v_profile_status
    FROM public.students s
    JOIN public.profiles p ON p.id = s.id
    WHERE s.id = p_student_profile_id
    FOR KEY SHARE OF s;

    IF NOT FOUND OR v_class_id IS NULL OR v_student_status NOT IN ('active', 'transferred') OR v_profile_status <> 'active' THEN
        RAISE EXCEPTION 'FORBIDDEN: Học sinh không hoạt động hoặc không tồn tại.';
    END IF;

    -- P1-01 / R3-03: Lấy khóa advisory tuần tự chuẩn m4_teaching_sync -> m5_close:<class_id> -> classes KEY SHARE
    PERFORM pg_advisory_xact_lock(hashtext('m5_close:' || v_class_id::text));
    PERFORM 1 FROM public.classes c WHERE c.id = v_class_id FOR KEY SHARE;

    SELECT * INTO v_student
    FROM public.students s
    WHERE s.id = p_student_profile_id;

    IF v_student.current_class_id IS DISTINCT FROM v_class_id THEN
        RAISE EXCEPTION 'STUDENT_CLASS_CHANGED: Lớp học của học sinh đã thay đổi. Vui lòng thử lại.' USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.m5_course_close_operations o
        WHERE o.class_id = v_class_id
          AND o.status IN ('deleting_storage', 'deleting_db', 'incomplete')
    ) THEN
        RAISE EXCEPTION 'CLASS_CLOSE_IN_PROGRESS: Lớp học đang trong quá trình đóng khóa hoặc tác vụ chưa hoàn tất.' USING ERRCODE = 'P0001';
    END IF;

    -- Verify active class
    SELECT * INTO v_class
    FROM public.classes c
    WHERE c.id = v_class_id
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

    -- Atomic single-pass read, snapshot verification, completeness/bounds validation, grading, and review construction
    FOR v_rec IN (
        SELECT q.id, q.options, q.correct_option_index, q.explanation
        FROM public.quiz_questions q
        WHERE q.lesson_id = p_lesson_id
        ORDER BY q.order_index ASC, q.id ASC
    ) LOOP
        v_total_q := v_total_q + 1;

        IF p_expected_question_ids IS NOT NULL THEN
            IF pg_catalog.array_ndims(p_expected_question_ids) IS DISTINCT FROM 1
               OR pg_catalog.array_lower(p_expected_question_ids, 1) IS DISTINCT FROM 1
               OR COALESCE(pg_catalog.array_length(p_expected_question_ids, 1), 0) < v_total_q
               OR p_expected_question_ids[v_total_q] IS DISTINCT FROM v_rec.id::text THEN
                RAISE EXCEPTION 'QUIZ_CHANGED_MID_ATTEMPT: Nội dung bài trắc nghiệm đã được giáo viên cập nhật trong lúc bạn đang làm bài. Hệ thống đã tải lại bộ câu hỏi mới nhất, vui lòng kiểm tra và nộp lại.' USING ERRCODE = 'P0001';
            END IF;
        END IF;

        IF p_answers IS NULL
           OR pg_catalog.array_ndims(p_answers) IS DISTINCT FROM 1
           OR pg_catalog.array_lower(p_answers, 1) IS DISTINCT FROM 1
           OR COALESCE(pg_catalog.array_length(p_answers, 1), 0) < v_total_q THEN
            RAISE EXCEPTION 'INCOMPLETE_QUIZ_ANSWERS: Vui lòng chọn đáp án cho tất cả các câu hỏi trước khi nộp bài.' USING ERRCODE = 'P0001';
        END IF;

        v_opt_len := CASE
            WHEN v_rec.options IS NOT NULL AND jsonb_typeof(v_rec.options) = 'array'
            THEN jsonb_array_length(v_rec.options)
            ELSE 0
        END;
        v_ans := p_answers[v_total_q];

        IF v_ans IS NULL OR v_ans < 0 OR v_ans >= v_opt_len THEN
            RAISE EXCEPTION 'INCOMPLETE_QUIZ_ANSWERS: Vui lòng chọn đáp án cho tất cả các câu hỏi trước khi nộp bài.' USING ERRCODE = 'P0001';
        END IF;

        IF v_ans = v_rec.correct_option_index THEN
            v_correct_count := v_correct_count + 1;
        END IF;

        v_review := v_review || jsonb_build_array(
            jsonb_build_object(
                'questionId', v_rec.id::text,
                'correctOptionIndex', v_rec.correct_option_index,
                'explanation', COALESCE(v_rec.explanation, '')
            )
        );
    END LOOP;

    IF v_total_q = 0 THEN
        RAISE EXCEPTION 'INVALID_STATE: Bài trắc nghiệm chưa có câu hỏi.';
    END IF;

    IF p_expected_question_ids IS NOT NULL
       AND pg_catalog.array_length(p_expected_question_ids, 1) IS DISTINCT FROM v_total_q THEN
        RAISE EXCEPTION 'QUIZ_CHANGED_MID_ATTEMPT: Nội dung bài trắc nghiệm đã được giáo viên cập nhật trong lúc bạn đang làm bài. Hệ thống đã tải lại bộ câu hỏi mới nhất, vui lòng kiểm tra và nộp lại.' USING ERRCODE = 'P0001';
    END IF;

    IF pg_catalog.array_length(p_answers, 1) IS DISTINCT FROM v_total_q THEN
        RAISE EXCEPTION 'INCOMPLETE_QUIZ_ANSWERS: Vui lòng chọn đáp án cho tất cả các câu hỏi trước khi nộp bài.' USING ERRCODE = 'P0001';
    END IF;

    v_calc_passed := ((v_correct_count::numeric / v_total_q::numeric) >= 0.70);
    v_calc_score := pg_catalog.round((v_correct_count::numeric / v_total_q::numeric) * 100)::INT;

    -- Concurrency row-level lock on student's quiz attempt scoped to current cohort/class
    PERFORM pg_advisory_xact_lock(hashtext('quiz:' || p_student_profile_id::text || ':' || p_lesson_id::text || ':' || v_class_id::text));

    SELECT * INTO v_existing
    FROM public.quiz_results
    WHERE student_id = p_student_profile_id AND lesson_id = p_lesson_id AND class_id = v_class_id
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
        WHERE student_id = p_student_profile_id AND lesson_id = p_lesson_id AND class_id = v_class_id;
    ELSE
        v_new_highest := v_calc_score;
        v_new_passed := v_calc_passed;
        v_new_attempts := 1;

        INSERT INTO public.quiz_results (
            student_id, lesson_id, class_id, highest_score, attempts_count, passed, last_attempt_at
        )
        VALUES (
            p_student_profile_id, p_lesson_id, v_class_id, v_new_highest, 1, v_new_passed, now()
        );
    END IF;

    RETURN QUERY
    SELECT v_calc_score, v_calc_passed, v_new_highest, v_new_attempts, v_review;
END;
$$;

REVOKE ALL ON FUNCTION public.m3_submit_quiz_attempt(UUID, UUID, INT[], TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m3_submit_quiz_attempt(UUID, UUID, INT[], TEXT[]) TO service_role;

UPDATE public.quiz_questions
SET prompt = $P17$Trong PyQt6, thành phần giao diện nào được dùng để tạo ô nhập liệu văn bản trên một dòng?$P17$,
    explanation = $E17$QLineEdit là ô cho phép người dùng nhập và chỉnh sửa văn bản trên một dòng (khác với QLabel chỉ hiển thị nhãn văn bản tĩnh và QTextEdit dùng cho văn bản nhiều dòng).$E17$
WHERE id = '66666666-6666-4666-8666-666666666717';

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261114093000', 'm6_submit_quiz_atomic_review')
ON CONFLICT (version) DO NOTHING;

COMMIT;
