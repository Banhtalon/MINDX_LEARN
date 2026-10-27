-- ============================================================================
-- MINDX LEARN — Mốc 5: CSV Tổng Kết 14 Buổi, Xóa Dữ Liệu Khóa Cũ & Cổng Quota 700MB/800MB
-- Migration: 20261020220000_m5_course_close_and_storage_quota.sql
-- ============================================================================

-- 1. Thêm cột reserved_bytes vào public.m3_upload_reservations
ALTER TABLE public.m3_upload_reservations
    ADD COLUMN IF NOT EXISTS reserved_bytes INTEGER NOT NULL DEFAULT 2097152
    CHECK (reserved_bytes > 0 AND reserved_bytes <= 2097152);

-- 2. Bảng cấu hình hạn mức Storage tổ chức
CREATE TABLE IF NOT EXISTS public.m5_storage_quota_config (
    id TEXT PRIMARY KEY DEFAULT 'default',
    org_baseline_bytes BIGINT NOT NULL DEFAULT 0,
    warning_threshold_bytes BIGINT NOT NULL DEFAULT 734003200, -- 700 MB
    hard_limit_bytes BIGINT NOT NULL DEFAULT 838860800,        -- 800 MB
    baseline_verified BOOLEAN NOT NULL DEFAULT false,
    environment_mode TEXT NOT NULL DEFAULT 'unverified' CHECK (environment_mode IN ('unverified', 'test', 'production')),
    approved_test_project_ref TEXT NOT NULL DEFAULT 'eythjapspkoyqdxlxtcd',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES public.profiles(id),
    CHECK (org_baseline_bytes >= 0 AND warning_threshold_bytes > 0 AND hard_limit_bytes > 0 AND hard_limit_bytes <= 838860800 AND warning_threshold_bytes <= hard_limit_bytes)
);

ALTER TABLE public.m5_storage_quota_config
    ADD COLUMN IF NOT EXISTS baseline_verified BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.m5_storage_quota_config DROP CONSTRAINT IF EXISTS m5_storage_quota_config_environment_mode_check;
ALTER TABLE public.m5_storage_quota_config
    ADD COLUMN IF NOT EXISTS environment_mode TEXT NOT NULL DEFAULT 'unverified';
ALTER TABLE public.m5_storage_quota_config
    ADD CONSTRAINT m5_storage_quota_config_environment_mode_check CHECK (environment_mode IN ('unverified', 'test', 'production'));

ALTER TABLE public.m5_storage_quota_config
    ADD COLUMN IF NOT EXISTS approved_test_project_ref TEXT NOT NULL DEFAULT 'eythjapspkoyqdxlxtcd';

ALTER TABLE public.m5_storage_quota_config ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.m5_storage_quota_config TO authenticated, service_role;
GRANT ALL ON public.m5_storage_quota_config TO service_role;
REVOKE ALL ON public.m5_storage_quota_config FROM anon, PUBLIC;

DROP POLICY IF EXISTS "m5_storage_quota_config_admin_read" ON public.m5_storage_quota_config;
CREATE POLICY "m5_storage_quota_config_admin_read" ON public.m5_storage_quota_config
    FOR SELECT TO authenticated
    USING (public.current_role() = 'admin');

DROP POLICY IF EXISTS "m5_storage_quota_config_admin_write" ON public.m5_storage_quota_config;
CREATE POLICY "m5_storage_quota_config_admin_write" ON public.m5_storage_quota_config
    FOR ALL TO authenticated
    USING (public.current_role() = 'admin')
    WITH CHECK (public.current_role() = 'admin');

INSERT INTO public.m5_storage_quota_config (id, org_baseline_bytes, warning_threshold_bytes, hard_limit_bytes, baseline_verified, environment_mode, approved_test_project_ref)
VALUES ('default', 0, 734003200, 838860800, false, 'unverified', 'eythjapspkoyqdxlxtcd')
ON CONFLICT (id) DO UPDATE SET
    hard_limit_bytes = LEAST(public.m5_storage_quota_config.hard_limit_bytes, 838860800),
    approved_test_project_ref = 'eythjapspkoyqdxlxtcd';

-- 3. Bảng lưu vết danh sách học sinh ổn định từng tham gia đợt học (Cohort Members)
CREATE TABLE IF NOT EXISTS public.m5_class_cohort_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    participant_id TEXT NOT NULL,
    membership_status TEXT NOT NULL DEFAULT 'active' CHECK (membership_status IN ('active', 'transferred', 'archived')),
    notes_snapshot TEXT,
    is_m5_fixture BOOLEAN NOT NULL DEFAULT false,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (class_id, course_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_m5_cohort_class_course ON public.m5_class_cohort_members(class_id, course_id);
CREATE INDEX IF NOT EXISTS idx_m5_cohort_participant ON public.m5_class_cohort_members(participant_id);

ALTER TABLE public.m5_class_cohort_members ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.m5_class_cohort_members TO authenticated, service_role;
GRANT ALL ON public.m5_class_cohort_members TO service_role;
REVOKE ALL ON public.m5_class_cohort_members FROM anon, PUBLIC;

DROP POLICY IF EXISTS "m5_cohort_admin_teacher_select" ON public.m5_class_cohort_members;
CREATE POLICY "m5_cohort_admin_teacher_select" ON public.m5_class_cohort_members
    FOR SELECT TO authenticated
    USING (
        public.current_role() = 'admin'
        OR (
            public.current_role() = 'teacher'
            AND EXISTS (
                SELECT 1 FROM public.class_teachers ct
                WHERE ct.class_id = m5_class_cohort_members.class_id
                  AND ct.teacher_profile_id = public.current_profile_id()
            )
        )
    );

-- 4. Bảng quản lý tiến trình tác vụ đóng khóa học (Course Close Operations)
CREATE TABLE IF NOT EXISTS public.m5_course_close_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    next_course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'previewed'
        CHECK (status IN ('previewed', 'csv_verified', 'deleting_storage', 'deleting_db', 'incomplete', 'completed')),
    target_storage_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
    deleted_storage_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
    remaining_storage_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_14_sessions_confirmed BOOLEAN NOT NULL DEFAULT false,
    csv_sha256 TEXT,
    snapshot_digest TEXT,
    last_error_code TEXT,
    last_error_message TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.m5_course_close_operations
    ADD COLUMN IF NOT EXISTS is_14_sessions_confirmed BOOLEAN NOT NULL DEFAULT false;

-- R13-06: khóa phiên thực thi (execution_run_id) và hạn giữ quyền (lease) để chặn 2 tiến trình Resume chạy song song
ALTER TABLE public.m5_course_close_operations
    ADD COLUMN IF NOT EXISTS execution_run_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.m5_course_close_operations
    ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_m5_close_ops_class_status ON public.m5_course_close_operations(class_id, status);

-- R7-01: Partial unique index đảm bảo mỗi class_id chỉ có tối đa 1 tác vụ chưa hoàn tất
DROP INDEX IF EXISTS idx_m5_close_ops_single_active_per_class;
CREATE UNIQUE INDEX idx_m5_close_ops_single_active_per_class
    ON public.m5_course_close_operations (class_id)
    WHERE status IN ('previewed', 'csv_verified', 'deleting_storage', 'deleting_db', 'incomplete');

ALTER TABLE public.m5_course_close_operations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.m5_course_close_operations TO authenticated, service_role;
GRANT ALL ON public.m5_course_close_operations TO service_role;
REVOKE ALL ON public.m5_course_close_operations FROM anon, PUBLIC;

DROP POLICY IF EXISTS "m5_close_ops_admin_all" ON public.m5_course_close_operations;
CREATE POLICY "m5_close_ops_admin_all" ON public.m5_course_close_operations
    FOR ALL TO authenticated
    USING (public.current_role() = 'admin')
    WITH CHECK (public.current_role() = 'admin');


-- Backfill học sinh hiện hữu vào public.m5_class_cohort_members (R4-02, M5-04, R6-02)
-- 1. Chèn học sinh theo current_class_id
INSERT INTO public.m5_class_cohort_members (
    class_id, course_id, student_id, participant_id, membership_status, notes_snapshot, is_m5_fixture
)
SELECT
    c.id,
    c.course_id,
    s.id,
    COALESCE(NULLIF(btrim(s.participant_id), ''), 'PART_' || substr(s.id::text, 1, 8)),
    CASE WHEN s.status IN ('archived', 'transferred') THEN s.status ELSE 'active' END,
    s.notes,
    false
FROM public.students s
JOIN public.classes c ON c.id = s.current_class_id
WHERE c.course_id IS NOT NULL
ON CONFLICT (class_id, course_id, student_id) DO NOTHING;

-- 2. Chèn học sinh có phát sinh quiz_results gắn với bài học lessons (R6-02)
INSERT INTO public.m5_class_cohort_members (
    class_id, course_id, student_id, participant_id, membership_status, notes_snapshot, is_m5_fixture
)
SELECT DISTINCT
    c.id,
    l.course_id,
    s.id,
    COALESCE(NULLIF(btrim(s.participant_id), ''), 'PART_' || substr(s.id::text, 1, 8)),
    CASE
        WHEN s.status = 'archived' THEN 'archived'
        WHEN s.current_class_id IS DISTINCT FROM c.id THEN 'transferred'
        ELSE 'active'
    END,
    s.notes,
    false
FROM public.quiz_results qr
JOIN public.classes c ON c.id = qr.class_id
JOIN public.lessons l ON l.id = qr.lesson_id
JOIN public.students s ON s.id = qr.student_id
WHERE l.course_id IS NOT NULL
ON CONFLICT (class_id, course_id, student_id) DO NOTHING;

-- 3. Chèn học sinh có phát sinh practice_submissions gắn với bài học lessons (R6-02)
INSERT INTO public.m5_class_cohort_members (
    class_id, course_id, student_id, participant_id, membership_status, notes_snapshot, is_m5_fixture
)
SELECT DISTINCT
    c.id,
    l.course_id,
    s.id,
    COALESCE(NULLIF(btrim(s.participant_id), ''), 'PART_' || substr(s.id::text, 1, 8)),
    CASE
        WHEN s.status = 'archived' THEN 'archived'
        WHEN s.current_class_id IS DISTINCT FROM c.id THEN 'transferred'
        ELSE 'active'
    END,
    s.notes,
    false
FROM public.practice_submissions ps
JOIN public.classes c ON c.id = ps.class_id
JOIN public.lessons l ON l.id = ps.lesson_id
JOIN public.students s ON s.id = ps.student_id
WHERE l.course_id IS NOT NULL
ON CONFLICT (class_id, course_id, student_id) DO NOTHING;

-- 4. Chèn học sinh theo original_class_id (R6-02: loại trừ nếu đã có cohort ở khóa khác hoặc lớp đã đóng khóa cũ)
INSERT INTO public.m5_class_cohort_members (
    class_id, course_id, student_id, participant_id, membership_status, notes_snapshot, is_m5_fixture
)
SELECT
    c.id,
    c.course_id,
    s.id,
    COALESCE(NULLIF(btrim(s.participant_id), ''), 'PART_' || substr(s.id::text, 1, 8)),
    CASE
        WHEN s.status = 'archived' THEN 'archived'
        WHEN s.current_class_id IS DISTINCT FROM c.id THEN 'transferred'
        ELSE 'active'
    END,
    s.notes,
    false
FROM public.students s
JOIN public.classes c ON c.id = s.original_class_id
WHERE c.course_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.m5_class_cohort_members cm_other
      WHERE cm_other.class_id = c.id
        AND cm_other.student_id = s.id
        AND cm_other.course_id IS DISTINCT FROM c.course_id
  )
  AND NOT EXISTS (
      SELECT 1 FROM public.m5_course_close_operations op
      WHERE op.class_id = c.id
        AND op.course_id IS DISTINCT FROM c.course_id
        AND op.status = 'completed'
        AND s.current_class_id IS DISTINCT FROM c.id
  )
ON CONFLICT (class_id, course_id, student_id) DO NOTHING;

-- Trigger tự động duy trì m5_class_cohort_members khi học sinh chuyển lớp hoặc thay đổi trạng thái (M5-04)
CREATE OR REPLACE FUNCTION public.m5_fn_record_cohort_membership_student()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_cls_course_id UUID;
    v_old_cls_course_id UUID;
    v_part_id TEXT;
BEGIN
    v_part_id := COALESCE(NULLIF(btrim(NEW.participant_id), ''), 'PART_' || substr(NEW.id::text, 1, 8));

    -- Nếu là UPDATE và lớp thay đổi (học sinh chuyển từ OLD.current_class_id sang NEW.current_class_id)
    IF TG_OP = 'UPDATE' AND OLD.current_class_id IS NOT NULL AND OLD.current_class_id IS DISTINCT FROM NEW.current_class_id THEN
        SELECT course_id INTO v_old_cls_course_id FROM public.classes WHERE id = OLD.current_class_id;
        UPDATE public.m5_class_cohort_members
        SET membership_status = 'transferred',
            notes_snapshot = NEW.notes
        WHERE class_id = OLD.current_class_id
          AND student_id = NEW.id
          AND (v_old_cls_course_id IS NULL OR course_id = v_old_cls_course_id);
    END IF;

    -- R12-01: đồng bộ notes_snapshot của mọi bản ghi cohort của học sinh khi ghi chú đổi (khớp s.notes trong m5_compute_db_snapshot_digest)
    IF TG_OP = 'UPDATE' AND OLD.notes IS DISTINCT FROM NEW.notes THEN
        UPDATE public.m5_class_cohort_members
        SET notes_snapshot = NEW.notes
        WHERE student_id = NEW.id;
    END IF;

    -- Ghi nhận học sinh vào lớp hiện tại (R3-06: đặt cứng false AS is_m5_fixture)
    IF NEW.current_class_id IS NOT NULL THEN
        SELECT course_id INTO v_cls_course_id FROM public.classes WHERE id = NEW.current_class_id;

        INSERT INTO public.m5_class_cohort_members (
            class_id, course_id, student_id, participant_id, membership_status, notes_snapshot, is_m5_fixture
        )
        VALUES (
            NEW.current_class_id,
            v_cls_course_id,
            NEW.id,
            v_part_id,
            CASE WHEN NEW.status IN ('archived', 'transferred') THEN NEW.status::text ELSE 'active'::text END,
            NEW.notes,
            false
        )
        ON CONFLICT (class_id, course_id, student_id) DO UPDATE SET
            course_id = COALESCE(EXCLUDED.course_id, public.m5_class_cohort_members.course_id),
            participant_id = EXCLUDED.participant_id,
            membership_status = CASE
                WHEN EXCLUDED.membership_status = 'archived' THEN 'archived'
                WHEN EXCLUDED.membership_status = 'transferred' OR public.m5_class_cohort_members.membership_status = 'transferred' THEN 'transferred'
                ELSE EXCLUDED.membership_status
            END,
            notes_snapshot = EXCLUDED.notes_snapshot,
            is_m5_fixture = public.m5_class_cohort_members.is_m5_fixture;
    END IF;

    -- Đồng thời nếu có original_class_id khác current_class_id, đảm bảo có bản ghi ở original_class_id (R3-06: false AS is_m5_fixture, R5-03: chỉ chèn fallback khi TG_OP = 'INSERT' hoặc chưa có bản ghi tại original_class_id)
    IF NEW.original_class_id IS NOT NULL AND NEW.original_class_id IS DISTINCT FROM NEW.current_class_id THEN
        IF TG_OP = 'INSERT' OR NOT EXISTS (
            SELECT 1 FROM public.m5_class_cohort_members cm
            WHERE cm.class_id = NEW.original_class_id AND cm.student_id = NEW.id
        ) THEN
            SELECT course_id INTO v_old_cls_course_id FROM public.classes WHERE id = NEW.original_class_id;
            INSERT INTO public.m5_class_cohort_members (
                class_id, course_id, student_id, participant_id, membership_status, notes_snapshot, is_m5_fixture
            )
            VALUES (
                NEW.original_class_id,
                v_old_cls_course_id,
                NEW.id,
                v_part_id,
                'transferred',
                NEW.notes,
                false
            )
            ON CONFLICT (class_id, course_id, student_id) DO NOTHING;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_m5_auto_record_cohort_membership_student ON public.students;
CREATE TRIGGER trg_m5_auto_record_cohort_membership_student
    AFTER INSERT OR UPDATE OF current_class_id, original_class_id, status, notes, participant_id ON public.students
    FOR EACH ROW
    EXECUTE FUNCTION public.m5_fn_record_cohort_membership_student();

CREATE OR REPLACE FUNCTION public.m5_fn_record_cohort_membership_class()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
BEGIN
    -- R5-03: Không UPDATE course_id của các dòng cũ (để bảo toàn lịch sử cohort của khóa cũ). Chỉ chèn/cập nhật thành viên khóa mới.
    IF NEW.course_id IS NOT NULL THEN
        INSERT INTO public.m5_class_cohort_members (
            class_id, course_id, student_id, participant_id, membership_status, notes_snapshot, is_m5_fixture
        )
        SELECT
            s.current_class_id,
            NEW.course_id,
            s.id,
            COALESCE(NULLIF(btrim(s.participant_id), ''), 'PART_' || substr(s.id::text, 1, 8)),
            CASE WHEN s.status IN ('archived', 'transferred') THEN s.status::text ELSE 'active'::text END,
            s.notes,
            false
        FROM public.students s
        WHERE s.current_class_id = NEW.id
        ON CONFLICT (class_id, course_id, student_id) DO UPDATE SET
            course_id = EXCLUDED.course_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_m5_auto_record_cohort_membership_class ON public.classes;
CREATE TRIGGER trg_m5_auto_record_cohort_membership_class
    AFTER INSERT OR UPDATE OF course_id ON public.classes
    FOR EACH ROW
    EXECUTE FUNCTION public.m5_fn_record_cohort_membership_class();

-- ============================================================================
-- 5. RPC ĐỌC VÀ CẤU HÌNH DUNG LƯỢNG STORAGE QUOTA
-- ============================================================================

CREATE OR REPLACE FUNCTION public.m5_get_storage_quota_status(
    p_incoming_bytes BIGINT DEFAULT 0
)
RETURNS TABLE (
    allowed BOOLEAN,
    is_warning BOOLEAN,
    is_exceeded BOOLEAN,
    code TEXT,
    message TEXT,
    current_total_bytes BIGINT,
    anticipated_total_bytes BIGINT,
    used_storage_bytes BIGINT,
    active_reserved_bytes BIGINT,
    org_baseline_bytes BIGINT,
    incoming_bytes BIGINT,
    warning_threshold_bytes BIGINT,
    hard_limit_bytes BIGINT,
    remaining_bytes BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, storage, extensions
AS $$
DECLARE
    v_cfg RECORD;
    v_used BIGINT := 0;
    v_reserved BIGINT := 0;
    v_baseline BIGINT := 0;
    v_warn_threshold BIGINT := 734003200; -- 700 MB
    v_hard_limit BIGINT := 838860800;     -- 800 MB
    v_current_total BIGINT := 0;
    v_anticipated BIGINT := 0;
    v_is_warn BOOLEAN := false;
    v_is_exceed BOOLEAN := false;
    v_remaining BIGINT := 0;
    v_code TEXT := 'OK';
    v_msg TEXT := 'Dung lượng lưu trữ nằm trong giới hạn an toàn.';
BEGIN
    -- R9-02: Chỉ cho phép service_role / postgres (bao gồm lời gọi nội bộ từ SECURITY DEFINER m3_reserve_practice_upload) hoặc Admin
    IF COALESCE(auth.role(), '') IS DISTINCT FROM 'service_role'
       AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin')
       AND COALESCE(public.current_role(), '') IS DISTINCT FROM 'admin'
    THEN
        RAISE EXCEPTION 'FORBIDDEN: Chỉ Quản trị viên mới được phép xem chi tiết dung lượng lưu trữ toàn tổ chức.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_cfg FROM public.m5_storage_quota_config WHERE id = 'default' LIMIT 1;
    IF FOUND THEN
        v_baseline := COALESCE(v_cfg.org_baseline_bytes, 0);
        v_warn_threshold := COALESCE(v_cfg.warning_threshold_bytes, 734003200);
        v_hard_limit := LEAST(COALESCE(v_cfg.hard_limit_bytes, 838860800), 838860800);
    END IF;

    -- Tính used_storage_bytes từ Storage objects hoặc practice_submissions dạng tệp
    SELECT COALESCE(sum((metadata->>'size')::bigint), 0) INTO v_used
    FROM storage.objects;

    IF v_used = 0 THEN
        SELECT COALESCE(sum(file_size_bytes), 0) INTO v_used
        FROM public.practice_submissions
        WHERE type = 'file';
    END IF;

    -- Tính active_reserved_bytes từ các lượt upload reservation chưa hết hạn (R3-09)
    SELECT COALESCE(sum(reserved_bytes), 0) INTO v_reserved
    FROM public.m3_upload_reservations
    WHERE status IN ('reserved', 'claimed')
      AND consumed_at IS NULL
      AND released_at IS NULL
      AND expires_at > clock_timestamp();

    v_current_total := v_used + v_reserved + v_baseline;
    v_anticipated := v_current_total + GREATEST(0, p_incoming_bytes);
    v_is_warn := (v_anticipated >= v_warn_threshold);
    v_is_exceed := (v_anticipated > v_hard_limit);
    v_remaining := GREATEST(0, v_hard_limit - v_anticipated);

    IF NOT FOUND
       OR v_cfg IS NULL
       OR COALESCE(v_cfg.baseline_verified, false) = false
       OR COALESCE(v_cfg.environment_mode, 'unverified') = 'unverified'
    THEN
        v_is_exceed := true;
        v_remaining := 0;
        v_code := 'STORAGE_BASELINE_UNVERIFIED';
        v_msg := 'Chưa xác minh dung lượng dùng chung của tổ chức (org_baseline_bytes). Admin cần kiểm tra và cập nhật dung lượng tổ chức trước khi mở tải tệp; học sinh vẫn có thể nộp bài bằng liên kết (link).';
    ELSIF v_is_exceed THEN
        v_code := 'STORAGE_QUOTA_EXCEEDED';
        v_msg := 'Dung lượng lưu trữ dự kiến vượt quá hạn mức tối đa cho phép. Không thể tải tệp mới. Vẫn có thể nộp bài bằng liên kết (link).';
    ELSIF v_is_warn THEN
        v_msg := 'Cảnh báo: Dung lượng lưu trữ dự kiến đã chạm hoặc vượt ngưỡng 700 MB.';
    END IF;

    RETURN QUERY
    SELECT
        NOT v_is_exceed,
        v_is_warn,
        v_is_exceed,
        v_code,
        v_msg,
        v_current_total,
        v_anticipated,
        v_used,
        v_reserved,
        v_baseline,
        GREATEST(0, p_incoming_bytes),
        v_warn_threshold,
        v_hard_limit,
        v_remaining;
END;
$$;
REVOKE ALL ON FUNCTION public.m5_get_storage_quota_status(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m5_get_storage_quota_status(BIGINT) TO service_role;

-- R9-02: Học sinh/giáo viên không được xem số liệu tổng dung lượng tổ chức; chỉ nhận cờ cảnh báo (không có số byte)
-- sau khi nộp tệp. Hàm SECURITY DEFINER này gọi nội bộ m5_get_storage_quota_status (current_user = owner).
CREATE OR REPLACE FUNCTION public.m5_get_storage_upload_warning()
RETURNS TABLE (
    is_warning BOOLEAN,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, storage, extensions
AS $$
DECLARE
    v_quota RECORD;
BEGIN
    IF auth.uid() IS NULL AND COALESCE(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'FORBIDDEN: Cần đăng nhập.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_quota FROM public.m5_get_storage_quota_status(0);
    RETURN QUERY
    SELECT
        COALESCE(v_quota.is_warning, false) AND NOT COALESCE(v_quota.is_exceeded, false),
        CASE
            WHEN COALESCE(v_quota.is_warning, false) AND NOT COALESCE(v_quota.is_exceeded, false)
            THEN v_quota.message
            ELSE NULL
        END;
END;
$$;
REVOKE ALL ON FUNCTION public.m5_get_storage_upload_warning() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.m5_get_storage_upload_warning() TO authenticated, service_role;

-- Cập nhật hạn mức Storage tổ chức với giới hạn nghiêm ngặt <= 800 MB (M5-10, R3-01, R3-04, R4-01, R4-05)
DROP FUNCTION IF EXISTS public.m5_set_storage_quota_baseline(BIGINT, BIGINT, BIGINT);
CREATE OR REPLACE FUNCTION public.m5_set_storage_quota_baseline(
    p_org_baseline_bytes BIGINT,
    p_warning_bytes BIGINT DEFAULT 734003200,
    p_hard_limit_bytes BIGINT DEFAULT 838860800,
    p_actor_id UUID DEFAULT NULL,
    p_test_project_ref TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_env_setting TEXT;
BEGIN
    -- R3-01: Khóa gọi trực tiếp, yêu cầu service_role
    IF COALESCE(auth.role(), '') IS DISTINCT FROM 'service_role' AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
        RAISE EXCEPTION 'DIRECT_RPC_FORBIDDEN: Must be invoked via m2-backend server workflow' USING ERRCODE = '42501';
    END IF;

    -- R3-01 / M5-03: Xác minh Admin actor trong profiles
    IF p_actor_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = p_actor_id AND p.role = 'admin' AND p.status = 'active'
    ) THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Verified admin actor required' USING ERRCODE = '42501';
    END IF;

    -- P1-06 / R3-04 / R4-05 / R5-04: Chặn thao tác điều chỉnh baseline thử nghiệm ngoài môi trường TEST (Fail-Closed)
    v_env_setting := COALESCE(NULLIF(btrim(current_setting('app.environment', true)), ''), 'unknown');
    IF p_test_project_ref IS NULL OR p_test_project_ref IS DISTINCT FROM 'eythjapspkoyqdxlxtcd' THEN
        RAISE EXCEPTION 'TEST_ONLY_OPERATION_FORBIDDEN: Thao tác chỉ cho phép trên dự án thử nghiệm eythjapspkoyqdxlxtcd.' USING ERRCODE = '42501';
    END IF;

    IF v_env_setting IN ('production', 'prod')
       OR COALESCE(NULLIF(btrim(current_setting('app.environment', true)), ''), 'unknown') = 'production'
       OR EXISTS (
         SELECT 1 FROM public.m5_storage_quota_config c
         WHERE c.id = 'default'
           AND (c.environment_mode = 'production' OR c.approved_test_project_ref IS DISTINCT FROM 'eythjapspkoyqdxlxtcd')
       )
       OR NOT EXISTS (
         SELECT 1 FROM public.m5_storage_quota_config c
         WHERE c.id = 'default'
           AND (c.environment_mode = 'test' OR c.environment_mode = 'unverified')
           AND c.approved_test_project_ref = 'eythjapspkoyqdxlxtcd'
       )
    THEN
        RAISE EXCEPTION 'TEST_OPERATION_DISABLED_IN_PROD: Thao tác điều chỉnh baseline thử nghiệm bị chặn trên môi trường Production.' USING ERRCODE = 'P0001';
    END IF;

    -- R5-04 / R6-01: Cập nhật mode sang test và baseline_verified khi Admin xác nhận baseline
    UPDATE public.m5_storage_quota_config
    SET environment_mode = 'test',
        approved_test_project_ref = 'eythjapspkoyqdxlxtcd',
        baseline_verified = true,
        updated_at = now(),
        updated_by = p_actor_id
    WHERE id = 'default' AND (environment_mode = 'unverified' OR environment_mode = 'test');

    IF p_org_baseline_bytes < 0 THEN
        RAISE EXCEPTION 'INVALID_STORAGE_QUOTA_CONFIG: Dung lượng cơ sở (baseline) không được là số âm.' USING ERRCODE = 'P0001';
    END IF;

    IF p_warning_bytes IS NULL OR p_warning_bytes <= 0 THEN
        RAISE EXCEPTION 'INVALID_STORAGE_QUOTA_CONFIG: Ngưỡng cảnh báo phải là số nguyên dương.' USING ERRCODE = 'P0001';
    END IF;

    IF p_hard_limit_bytes IS NULL OR p_hard_limit_bytes <= 0 OR p_hard_limit_bytes > 838860800 THEN
        RAISE EXCEPTION 'INVALID_STORAGE_QUOTA_CONFIG: Hard limit cannot exceed 800 MB (838860800 bytes)' USING ERRCODE = 'P0001';
    END IF;

    IF p_warning_bytes > p_hard_limit_bytes THEN
        RAISE EXCEPTION 'INVALID_STORAGE_QUOTA_CONFIG: Ngưỡng cảnh báo không được lớn hơn hạn mức tối đa.' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.m5_storage_quota_config (
        id, org_baseline_bytes, warning_threshold_bytes, hard_limit_bytes, baseline_verified, environment_mode, approved_test_project_ref, updated_at, updated_by
    )
    VALUES (
        'default',
        p_org_baseline_bytes,
        p_warning_bytes,
        p_hard_limit_bytes,
        true,
        'test',
        'eythjapspkoyqdxlxtcd',
        now(),
        p_actor_id
    )
    ON CONFLICT (id) DO UPDATE SET
        org_baseline_bytes = EXCLUDED.org_baseline_bytes,
        warning_threshold_bytes = EXCLUDED.warning_threshold_bytes,
        hard_limit_bytes = EXCLUDED.hard_limit_bytes,
        baseline_verified = true,
        environment_mode = 'test',
        approved_test_project_ref = 'eythjapspkoyqdxlxtcd',
        updated_at = now(),
        updated_by = EXCLUDED.updated_by;

    RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.m5_set_storage_quota_baseline(BIGINT, BIGINT, BIGINT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m5_set_storage_quota_baseline(BIGINT, BIGINT, BIGINT, UUID, TEXT) TO service_role;

-- ============================================================================
-- 5B. TÍNH BẢN TÓM TẮT DỮ LIỆU SNAPSHOT (SNAPSHOT DIGEST) ĐỐI CHIẾU TRƯỚC KHI XÓA (M5-06, R3-02)
-- ============================================================================

-- R3-02: Hàm mã hóa trường độ dài tiền tố (length-prefixed encoding)
CREATE OR REPLACE FUNCTION public.m5_enc_digest_field(p_val TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT char_length(COALESCE(p_val, ''))::text || '#' || COALESCE(p_val, '');
$$;
REVOKE ALL ON FUNCTION public.m5_enc_digest_field(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.m5_enc_digest_field(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.m5_compute_db_snapshot_digest(
    p_class_id UUID,
    p_course_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_class RECORD;
    v_class_part TEXT := '';
    v_lessons_part TEXT := '';
    v_participants_part TEXT := '';
    v_quizzes_part TEXT := '';
    v_subs_part TEXT := '';
    v_raw TEXT := '';
BEGIN
    -- R11-01: Chỉ cho phép service_role / postgres (gọi nội bộ từ các RPC đóng khóa) hoặc Admin
    IF COALESCE(auth.role(), '') IS DISTINCT FROM 'service_role'
       AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin')
       AND COALESCE(public.current_role(), '') IS DISTINCT FROM 'admin'
    THEN
        RAISE EXCEPTION 'FORBIDDEN: Chỉ hệ thống máy chủ hoặc Quản trị viên mới được phép tính toán snapshot digest.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_class FROM public.classes WHERE id = p_class_id;
    IF NOT FOUND THEN
        RETURN '';
    END IF;

    -- R3-02: Áp dụng m5_enc_digest_field cho mọi trường
    v_class_part := public.m5_enc_digest_field(v_class.id::text) || ':' ||
                    public.m5_enc_digest_field(v_class.course_id::text) || ':' ||
                    public.m5_enc_digest_field(v_class.code);

    -- Lessons (sessionNumber ASC)
    SELECT COALESCE(string_agg(
        public.m5_enc_digest_field(l.session_number::text) || ':' ||
        public.m5_enc_digest_field(l.id::text) || ':' ||
        public.m5_enc_digest_field(l.title) || ':' ||
        public.m5_enc_digest_field(l.status) || ':' ||
        public.m5_enc_digest_field(COALESCE(l.has_quiz, false)::text) || ':' ||
        public.m5_enc_digest_field(COALESCE(l.has_practice, false)::text),
        '|' ORDER BY l.session_number ASC
    ), '')
    INTO v_lessons_part
    FROM public.lessons l
    WHERE l.course_id = p_course_id;

    -- Participants (participantId ASC) - R4-03: Thống nhất 100% điều kiện chọn thành viên theo cặp (class_id, course_id)
    WITH cohort_candidates AS (
        SELECT DISTINCT s.id AS student_id,
               COALESCE(NULLIF(btrim(cm.participant_id), ''), NULLIF(btrim(s.participant_id), ''), 'PART_' || substr(s.id::text, 1, 8)) AS participant_id,
               s.student_code,
               p.full_name,
               CASE
                   WHEN s.status = 'archived' THEN 'archived'
                   WHEN s.current_class_id IS DISTINCT FROM p_class_id OR s.status = 'transferred' OR cm.membership_status = 'transferred' THEN 'transferred'
                   ELSE s.status
               END AS effective_status,
               COALESCE(s.notes, '') AS notes,
               COALESCE(s.current_class_id::text, '') AS current_class_id_str,
               COALESCE(s.original_class_id::text, '') AS original_class_id_str
        FROM public.students s
        JOIN public.profiles p ON p.id = s.id
        LEFT JOIN public.m5_class_cohort_members cm ON cm.student_id = s.id AND cm.class_id = p_class_id AND cm.course_id = p_course_id
        WHERE
            -- 1. Có trong m5_class_cohort_members của đúng cặp (p_class_id, p_course_id)
            (cm.id IS NOT NULL)
            -- 2. Đang thuộc lớp hiện tại
            OR (s.current_class_id = p_class_id)
            -- 3. Có s.original_class_id = p_class_id VÀ chưa có bản ghi đóng khóa hoàn tất của khóa cũ loại trừ họ (R5-03)
            OR (
                s.original_class_id = p_class_id
                AND NOT EXISTS (
                    SELECT 1 FROM public.m5_course_close_operations op
                    WHERE op.class_id = p_class_id
                      AND op.course_id IS DISTINCT FROM p_course_id
                      AND op.status = 'completed'
                      AND s.current_class_id IS DISTINCT FROM p_class_id
                )
                AND NOT EXISTS (
                    SELECT 1 FROM public.m5_class_cohort_members cm_other
                    WHERE cm_other.class_id = p_class_id
                      AND cm_other.student_id = s.id
                      AND cm_other.course_id IS DISTINCT FROM p_course_id
                )
            )
            -- 4. Có quiz_results / practice_submissions tại p_class_id thuộc bài học của p_course_id
            OR EXISTS (
                SELECT 1 FROM public.quiz_results qr
                JOIN public.lessons l ON l.id = qr.lesson_id
                WHERE qr.student_id = s.id AND qr.class_id = p_class_id AND l.course_id = p_course_id
            )
            OR EXISTS (
                SELECT 1 FROM public.practice_submissions ps
                JOIN public.lessons l ON l.id = ps.lesson_id
                WHERE ps.student_id = s.id AND ps.class_id = p_class_id AND l.course_id = p_course_id
            )
    )
    SELECT COALESCE(string_agg(
        public.m5_enc_digest_field(c.student_id::text) || ':' ||
        public.m5_enc_digest_field(c.participant_id) || ':' ||
        public.m5_enc_digest_field(c.student_code) || ':' ||
        public.m5_enc_digest_field(c.full_name) || ':' ||
        public.m5_enc_digest_field(c.effective_status) || ':' ||
        public.m5_enc_digest_field(c.notes) || ':' ||
        public.m5_enc_digest_field(c.current_class_id_str) || ':' ||
        public.m5_enc_digest_field(c.original_class_id_str),
        '|' ORDER BY c.participant_id ASC
    ), '')
    INTO v_participants_part
    FROM cohort_candidates c;

    -- Quizzes (studentId ASC, lessonId ASC) - R4-03
    SELECT COALESCE(string_agg(
        public.m5_enc_digest_field(qr.student_id::text) || ':' ||
        public.m5_enc_digest_field(qr.lesson_id::text) || ':' ||
        public.m5_enc_digest_field(qr.highest_score::text) || ':' ||
        public.m5_enc_digest_field(COALESCE(qr.passed, false)::text) || ':' ||
        public.m5_enc_digest_field(COALESCE(qr.attempts_count, 0)::text),
        '|' ORDER BY qr.student_id ASC, qr.lesson_id ASC
    ), '')
    INTO v_quizzes_part
    FROM public.quiz_results qr
    JOIN public.lessons l ON l.id = qr.lesson_id
    WHERE l.course_id = p_course_id
      AND (qr.class_id = p_class_id OR qr.class_id IS NULL)
      AND (
          EXISTS (
              SELECT 1 FROM public.m5_class_cohort_members cm
              WHERE cm.class_id = p_class_id AND cm.course_id = p_course_id AND cm.student_id = qr.student_id
          )
          OR EXISTS (
              SELECT 1 FROM public.students s
              WHERE s.id = qr.student_id AND s.current_class_id = p_class_id
          )
          OR EXISTS (
              SELECT 1 FROM public.students s
              WHERE s.id = qr.student_id
                AND s.original_class_id = p_class_id
                AND NOT EXISTS (
                    SELECT 1 FROM public.m5_course_close_operations op
                    WHERE op.class_id = p_class_id
                      AND op.course_id IS DISTINCT FROM p_course_id
                      AND op.status = 'completed'
                      AND s.current_class_id IS DISTINCT FROM p_class_id
                )
                AND NOT EXISTS (
                    SELECT 1 FROM public.m5_class_cohort_members cm_other
                    WHERE cm_other.class_id = p_class_id
                      AND cm_other.student_id = s.id
                      AND cm_other.course_id IS DISTINCT FROM p_course_id
                )
          )
      );

    -- Submissions (studentId ASC, lessonId ASC) - R4-03
    SELECT COALESCE(string_agg(
        public.m5_enc_digest_field(ps.student_id::text) || ':' ||
        public.m5_enc_digest_field(ps.lesson_id::text) || ':' ||
        public.m5_enc_digest_field(ps.type) || ':' ||
        public.m5_enc_digest_field(ps.status) || ':' ||
        public.m5_enc_digest_field(COALESCE(ps.teacher_feedback, '')) || ':' ||
        public.m5_enc_digest_field(COALESCE(ps.content, '')) || ':' ||
        public.m5_enc_digest_field(COALESCE(ps.file_size_bytes, 0)::text),
        '|' ORDER BY ps.student_id ASC, ps.lesson_id ASC
    ), '')
    INTO v_subs_part
    FROM public.practice_submissions ps
    JOIN public.lessons l ON l.id = ps.lesson_id
    WHERE l.course_id = p_course_id
      AND ps.class_id = p_class_id
      AND (
          EXISTS (
              SELECT 1 FROM public.m5_class_cohort_members cm
              WHERE cm.class_id = p_class_id AND cm.course_id = p_course_id AND cm.student_id = ps.student_id
          )
          OR EXISTS (
              SELECT 1 FROM public.students s
              WHERE s.id = ps.student_id AND s.current_class_id = p_class_id
          )
          OR EXISTS (
              SELECT 1 FROM public.students s
              WHERE s.id = ps.student_id
                AND s.original_class_id = p_class_id
                AND NOT EXISTS (
                    SELECT 1 FROM public.m5_course_close_operations op
                    WHERE op.class_id = p_class_id
                      AND op.course_id IS DISTINCT FROM p_course_id
                      AND op.status = 'completed'
                      AND s.current_class_id IS DISTINCT FROM p_class_id
                )
                AND NOT EXISTS (
                    SELECT 1 FROM public.m5_class_cohort_members cm_other
                    WHERE cm_other.class_id = p_class_id
                      AND cm_other.student_id = s.id
                      AND cm_other.course_id IS DISTINCT FROM p_course_id
                )
          )
      );

    v_raw := v_class_part || '##' || v_lessons_part || '##' || v_participants_part || '##' || v_quizzes_part || '##' || v_subs_part;

    RETURN encode(extensions.digest(convert_to(v_raw, 'UTF8'), 'sha256'), 'hex');
END;
$$;
REVOKE ALL ON FUNCTION public.m5_compute_db_snapshot_digest(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m5_compute_db_snapshot_digest(UUID, UUID) TO service_role;

-- ============================================================================
-- 6. RPC TẠO / RESET BỘ DỮ LIỆU FIXTURE 14 BUỔI MỐC 5 (ROB-K14-M5-01)
-- ============================================================================

DROP FUNCTION IF EXISTS public.m5_seed_course_close_fixture(BOOLEAN);
DROP FUNCTION IF EXISTS public.m5_seed_course_close_fixture(BOOLEAN, UUID, TEXT);
CREATE OR REPLACE FUNCTION public.m5_seed_course_close_fixture(
    p_reset_only BOOLEAN DEFAULT false,
    p_actor_id UUID DEFAULT NULL,
    p_test_project_ref TEXT DEFAULT NULL,
    p_execution_run_id UUID DEFAULT NULL
)
RETURNS TABLE (
    fixture_class_id UUID,
    fixture_course_id UUID,
    fixture_next_course_id UUID,
    students_count INT,
    quizzes_count INT,
    submissions_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, storage, extensions
AS $$
DECLARE
    v_cls_id UUID := '00000000-0000-0000-0000-000000050001'::uuid;
    v_crs_id UUID := '00000000-0000-0000-0000-000000050014'::uuid;
    v_next_crs_id UUID := '00000000-0000-0000-0000-000000050015'::uuid;
    v_stu1_id UUID := '00000000-0000-0000-0000-000000050101'::uuid;
    v_stu2_id UUID := '00000000-0000-0000-0000-000000050102'::uuid;
    v_stu3_id UUID := '00000000-0000-0000-0000-000000050103'::uuid;
    v_stu4_id UUID := '00000000-0000-0000-0000-000000050104'::uuid;
    v_stu5_id UUID := '00000000-0000-0000-0000-000000050105'::uuid;
    v_les_id UUID;
    v_idx INT;
    v_stus_seeded INT := 0;
    v_quizzes_seeded INT := 0;
    v_subs_seeded INT := 0;
    v_env_setting TEXT;
    v_fixture_paths TEXT[] := '{}'::text[];
    v_remaining_fixture_files INT := 0;
BEGIN
    -- R3-01: Khóa gọi trực tiếp, yêu cầu service_role
    IF COALESCE(auth.role(), '') IS DISTINCT FROM 'service_role' AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
        RAISE EXCEPTION 'DIRECT_RPC_FORBIDDEN: Must be invoked via m2-backend server workflow' USING ERRCODE = '42501';
    END IF;

    -- R3-01 / M5-03: Xác minh Admin actor trong profiles
    IF p_actor_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = p_actor_id AND p.role = 'admin' AND p.status = 'active'
    ) THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Verified admin actor required' USING ERRCODE = '42501';
    END IF;

    -- P1-06 / R3-04 / R4-05 / R5-04: Chặn thao tác seed dữ liệu mẫu ngoài môi trường TEST được duyệt (Fail-Closed)
    v_env_setting := COALESCE(NULLIF(btrim(current_setting('app.environment', true)), ''), 'unknown');
    IF p_test_project_ref IS NULL OR p_test_project_ref IS DISTINCT FROM 'eythjapspkoyqdxlxtcd' THEN
        RAISE EXCEPTION 'TEST_ONLY_OPERATION_FORBIDDEN: Thao tác chỉ cho phép trên dự án thử nghiệm eythjapspkoyqdxlxtcd.' USING ERRCODE = '42501';
    END IF;

    IF v_env_setting IN ('production', 'prod')
       OR COALESCE(NULLIF(btrim(current_setting('app.environment', true)), ''), 'unknown') = 'production'
       OR EXISTS (
         SELECT 1 FROM public.m5_storage_quota_config c
         WHERE c.id = 'default'
           AND (c.environment_mode = 'production' OR c.approved_test_project_ref IS DISTINCT FROM 'eythjapspkoyqdxlxtcd')
       )
       OR NOT EXISTS (
         SELECT 1 FROM public.m5_storage_quota_config c
         WHERE c.id = 'default'
           AND (c.environment_mode = 'test' OR c.environment_mode = 'unverified')
           AND c.approved_test_project_ref = 'eythjapspkoyqdxlxtcd'
       )
    THEN
        RAISE EXCEPTION 'SEED_FIXTURE_DISABLED_IN_PROD: Thao tác nạp dữ liệu mẫu bị chặn hoàn toàn trên môi trường Production.' USING ERRCODE = 'P0001';
    END IF;

    -- R19b: Lấy khóa tư vấn theo thứ tự chuẩn trước mọi UPDATE/SELECT/DELETE/INSERT để các trigger
    -- trg_m5_guard_*_during_close (khi xóa/tạo lại students, profiles, lessons, classes, m5_class_cohort_members)
    -- luôn thấy m4_teaching_sync đã được giữ đầu tiên.
    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));
    PERFORM pg_advisory_xact_lock(hashtext('m5_storage_quota'));
    PERFORM pg_advisory_xact_lock(hashtext('m5_close:' || v_cls_id::text));

    -- R21-01 / R22-01: Trước mọi thay đổi dữ liệu, bắt buộc phải có bản ghi khóa còn hiệu lực và khớp đúng execution_run_id.
    -- Nếu bản ghi khóa đã bị lượt mới tiếp quản, đã hết hạn lease, hoặc đã bị lượt mới xóa sau khi hoàn tất thì từ chối STALE_WORKER_EXECUTION.
    IF p_execution_run_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.m5_course_close_operations o
            WHERE o.class_id = v_cls_id
              AND o.status IN ('deleting_storage', 'deleting_db', 'incomplete')
              AND o.execution_run_id = p_execution_run_id
              AND (o.lease_expires_at IS NULL OR o.lease_expires_at >= clock_timestamp())
        ) OR EXISTS (
            SELECT 1 FROM public.m5_course_close_operations o
            WHERE o.class_id = v_cls_id
              AND o.status IN ('deleting_storage', 'deleting_db', 'incomplete')
              AND o.execution_run_id IS DISTINCT FROM p_execution_run_id
        ) THEN
            RAISE EXCEPTION 'STALE_WORKER_EXECUTION: Phiên đặt lại bộ mẫu đã hết hiệu lực do một lượt thực thi mới hơn đã tiếp quản hoặc đã hoàn tất.' USING ERRCODE = 'P0001';
        END IF;
    ELSIF EXISTS (
        SELECT 1 FROM public.m5_course_close_operations o
        WHERE o.class_id = v_cls_id
          AND o.status IN ('deleting_storage', 'deleting_db', 'incomplete')
    ) THEN
        RAISE EXCEPTION 'STALE_WORKER_EXECUTION: Phiên đặt lại bộ mẫu yêu cầu mã lượt chạy hợp lệ khi đang có khóa tác vụ.' USING ERRCODE = 'P0001';
    END IF;

    -- Đảm bảo m5_storage_quota_config ở chế độ test khi p_test_project_ref hợp lệ (R5-04, R6-01: cập nhật sang test; R8-01: KHÔNG tự bật baseline_verified)
    UPDATE public.m5_storage_quota_config
    SET environment_mode = 'test',
        approved_test_project_ref = 'eythjapspkoyqdxlxtcd',
        updated_at = now()
    WHERE id = 'default' AND (environment_mode = 'unverified' OR environment_mode = 'test');

    -- R17-01 / R3-06: Chặn nếu có học sinh hoặc lớp ngoài bộ mẫu Mốc 5 đang gắn với lớp/khóa mẫu Mốc 5
    IF EXISTS (
        SELECT 1 FROM public.students s
        WHERE s.id NOT IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id)
          AND (s.current_class_id = v_cls_id OR s.original_class_id = v_cls_id)
    ) OR EXISTS (
        SELECT 1 FROM public.m5_class_cohort_members cm
        WHERE (cm.class_id = v_cls_id OR cm.course_id IN (v_crs_id, v_next_crs_id))
          AND cm.student_id NOT IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id)
    ) OR EXISTS (
        SELECT 1 FROM public.m3_upload_reservations r
        WHERE r.class_id = v_cls_id
          AND r.student_id NOT IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id)
    ) OR EXISTS (
        SELECT 1 FROM public.practice_submissions ps
        WHERE ps.class_id = v_cls_id
          AND ps.student_id NOT IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id)
    ) OR EXISTS (
        SELECT 1 FROM public.quiz_results qr
        WHERE qr.class_id = v_cls_id
          AND qr.student_id NOT IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id)
    ) OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id <> v_cls_id
          AND c.course_id IN (v_crs_id, v_next_crs_id)
    ) OR EXISTS (
        -- R19-02 (chiều 3): học sinh mẫu Mốc 5 đang gắn với lớp khác ngoài lớp mẫu
        SELECT 1 FROM public.students s
        WHERE s.id IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id)
          AND ((s.current_class_id IS NOT NULL AND s.current_class_id IS DISTINCT FROM v_cls_id)
               OR (s.original_class_id IS NOT NULL AND s.original_class_id IS DISTINCT FROM v_cls_id))
    ) OR EXISTS (
        SELECT 1 FROM public.m5_class_cohort_members cm
        WHERE cm.student_id IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id)
          AND cm.class_id IS NOT NULL AND cm.class_id IS DISTINCT FROM v_cls_id
    ) OR EXISTS (
        SELECT 1 FROM public.m3_upload_reservations r
        WHERE r.student_id IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id)
          AND r.class_id IS NOT NULL AND r.class_id IS DISTINCT FROM v_cls_id
    ) OR EXISTS (
        SELECT 1 FROM public.practice_submissions ps
        WHERE ps.student_id IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id)
          AND ps.class_id IS NOT NULL AND ps.class_id IS DISTINCT FROM v_cls_id
    ) OR EXISTS (
        SELECT 1 FROM public.quiz_results qr
        WHERE qr.student_id IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id)
          AND qr.class_id IS NOT NULL AND qr.class_id IS DISTINCT FROM v_cls_id
    ) THEN
        RAISE EXCEPTION 'NON_FIXTURE_DATA_ATTACHED: Lớp hoặc khóa mẫu Mốc 5 đang có học sinh hoặc lớp học ngoài bộ mẫu Mốc 5 tham chiếu. Vui lòng chuyển học sinh/lớp đó ra ngoài trước khi đặt lại bộ mẫu.' USING ERRCODE = 'P0001';
    END IF;

    -- R10-03: Không xóa liên kết DB của fixture nếu tệp thực tế trên Storage chưa được xóa qua Storage API
    -- (Edge Function m5-seed-fixture phải gọi Storage remove trước; ở đây chỉ kiểm tra và chặn để tránh tệp mồ côi)
    SELECT COALESCE(array_agg(DISTINCT fp.path), '{}'::text[]) INTO v_fixture_paths
    FROM (
        SELECT ps.content AS path
        FROM public.practice_submissions ps
        WHERE (ps.class_id = v_cls_id OR ps.student_id IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id))
          AND ps.type = 'file' AND ps.content IS NOT NULL AND btrim(ps.content) <> ''
        UNION
        SELECT r.object_path AS path
        FROM public.m3_upload_reservations r
        WHERE (r.class_id = v_cls_id OR r.student_id IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id))
          AND r.object_path IS NOT NULL AND btrim(r.object_path) <> ''
        UNION
        SELECT p.path
        FROM public.m5_course_close_operations o,
             LATERAL jsonb_array_elements_text(
                 COALESCE(o.target_storage_paths, '[]'::jsonb) || COALESCE(o.remaining_storage_paths, '[]'::jsonb)
             ) AS p(path)
        WHERE (o.class_id = v_cls_id OR o.course_id IN (v_crs_id, v_next_crs_id))
          AND p.path IS NOT NULL AND btrim(p.path) <> ''
    ) fp;

    IF COALESCE(array_length(v_fixture_paths, 1), 0) > 0 THEN
        SELECT count(*) INTO v_remaining_fixture_files
        FROM storage.objects o
        WHERE o.bucket_id = 'm3-practice-files'
          AND o.name = ANY(v_fixture_paths);

        IF v_remaining_fixture_files > 0 THEN
            RAISE EXCEPTION 'STORAGE_FILES_NOT_FULLY_DELETED: Còn % tệp thực tế của bộ dữ liệu mẫu Mốc 5 trên Storage chưa được xóa. Đã giữ nguyên liên kết bài nộp trong cơ sở dữ liệu.', v_remaining_fixture_files USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- R17-02: Bộ mẫu được phép dọn/tạo lại dữ liệu nội bộ, bỏ qua trigger bảo vệ đóng khóa dở dang (chỉ trong giao dịch này)
    -- R18-01: Quyền bỏ qua chỉ có hiệu lực trong phạm vi đúng lớp mẫu Mốc 5, không bỏ qua chốt của lớp khác đang đóng dở
    PERFORM set_config('app.m5_internal_mutation', 'true', true);
    PERFORM set_config('app.m5_internal_mutation_class_id', v_cls_id::text, true);

    -- Dọn sạch fixture Mốc 5 cũ nếu đã tồn tại (R3-06 / R17-01: chỉ xóa đúng 5 học sinh mẫu Mốc 5, tuyệt đối không xóa theo lớp)
    DELETE FROM public.m5_course_close_operations WHERE class_id = v_cls_id OR course_id IN (v_crs_id, v_next_crs_id);
    DELETE FROM public.m5_class_cohort_members
    WHERE (class_id = v_cls_id OR (course_id IN (v_crs_id, v_next_crs_id) AND is_m5_fixture = true))
      AND student_id IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id);
    DELETE FROM public.m3_upload_reservations WHERE student_id IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id);
    DELETE FROM public.practice_submissions WHERE student_id IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id);
    DELETE FROM public.quiz_results WHERE student_id IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id);

    -- R16-04 / R17-01: Xóa các học sinh fixture Mốc 5 TRƯỚC KHI xóa public.classes (tránh lỗi FK ON DELETE RESTRICT trên current_class_id / original_class_id)
    DELETE FROM public.students WHERE id IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id);
    DELETE FROM public.profiles WHERE id IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id);

    DELETE FROM public.quiz_questions WHERE lesson_id IN (SELECT id FROM public.lessons WHERE course_id = v_crs_id);
    DELETE FROM public.lessons WHERE course_id = v_crs_id;
    DELETE FROM public.classes WHERE id = v_cls_id;
    DELETE FROM public.courses WHERE id IN (v_crs_id, v_next_crs_id);

    IF p_reset_only THEN
        PERFORM set_config('app.m5_internal_mutation', 'false', true);
        PERFORM set_config('app.m5_internal_mutation_class_id', '', true);
        RETURN QUERY SELECT v_cls_id, v_crs_id, v_next_crs_id, 0, 0, 0;
        RETURN;
    END IF;

    -- Tạo khóa học 14 buổi CRS-M5-14
    INSERT INTO public.courses (id, title, description, total_sessions, is_fixture)
    VALUES (v_crs_id, 'Khóa Robotics K14 M5 (14 Buổi Chuẩn)', 'Khóa học 14 buổi đã giảng dạy hoàn tất để thử nghiệm đóng khóa Mốc 5.', 14, true);

    -- Tạo khóa học kế tiếp CRS-M5-NEXT
    INSERT INTO public.courses (id, title, description, total_sessions, is_fixture)
    VALUES (v_next_crs_id, 'Khóa Robotics Nâng Cao K15 (Khóa Kế Tiếp)', 'Khóa kế tiếp gán cho lớp sau khi kết thúc đợt học cũ.', 14, true);

    -- Tạo 14 buổi học cố định Buổi 1–14
    FOR v_idx IN 1..14 LOOP
        v_les_id := ('00000000-0000-0000-0000-' || lpad(to_hex(50000 + v_idx), 12, '0'))::uuid;
        INSERT INTO public.lessons (
            id, course_id, session_number, title, description, status, has_quiz, has_practice, practice_mode
        )
        VALUES (
            v_les_id,
            v_crs_id,
            v_idx,
            'Buổi ' || v_idx || ': Kiến thức trọng tâm Mốc 5',
            'Bài học Buổi ' || v_idx || ' thuộc khóa CRS-M5-14.',
            'published',
            (v_idx != 4 AND v_idx != 8),
            (v_idx != 3 AND v_idx != 7),
            'file_allowed'
        );

        IF (v_idx != 4 AND v_idx != 8) THEN
            INSERT INTO public.quiz_questions (
                lesson_id, prompt, options, correct_option_index, order_index
            )
            VALUES (
                v_les_id,
                'Câu hỏi trắc nghiệm Buổi ' || v_idx,
                jsonb_build_array('A', 'B', 'C', 'D'),
                0,
                0
            );
        END IF;
    END LOOP;

    -- Tạo lớp học ROB-K14-M5-01
    INSERT INTO public.classes (id, code, name, course_id, status, is_fixture, is_14_sessions_confirmed)
    VALUES (v_cls_id, 'ROB-K14-M5-01', 'Lớp Robotics Mốc 5 (Đủ 14 Buổi - Sẵn sàng đóng khóa)', v_crs_id, 'active', true, true);

    -- Tạo 5 học sinh mẫu đại diện các nhóm
    -- 1. HS Hoàn tất 14/14
    INSERT INTO public.profiles (id, full_name, role, status, is_fixture)
    VALUES (v_stu1_id, 'Trần Văn Hoàn Tất', 'student', 'active', true);
    INSERT INTO public.students (id, student_code, participant_id, full_name, current_class_id, original_class_id, pin_issued_at, status, notes, is_fixture)
    VALUES (v_stu1_id, 'HS_M5_001', 'PART_M5_001', 'Trần Văn Hoàn Tất', v_cls_id, v_cls_id, now(), 'active', 'Hoàn tất 14/14', true);

    -- 2. HS Đang học / Chưa hoàn tất, có bài nộp chờ chấm
    INSERT INTO public.profiles (id, full_name, role, status, is_fixture)
    VALUES (v_stu2_id, 'Nguyễn Thị Đang Học', 'student', 'active', true);
    INSERT INTO public.students (id, student_code, participant_id, full_name, current_class_id, original_class_id, pin_issued_at, status, notes, is_fixture)
    VALUES (v_stu2_id, 'HS_M5_002', 'PART_M5_002', 'Nguyễn Thị Đang Học', v_cls_id, v_cls_id, now(), 'active', 'Chưa hoàn tất, có bài chờ chấm', true);

    -- 3. HS Chưa nộp bài nào
    INSERT INTO public.profiles (id, full_name, role, status, is_fixture)
    VALUES (v_stu3_id, 'Lê Văn Chưa Nộp', 'student', 'active', true);
    INSERT INTO public.students (id, student_code, participant_id, full_name, current_class_id, original_class_id, pin_issued_at, status, notes, is_fixture)
    VALUES (v_stu3_id, 'HS_M5_003', 'PART_M5_003', 'Lê Văn Chưa Nộp', v_cls_id, v_cls_id, now(), 'active', 'Chưa nộp bài nào', true);

    -- 4. HS Đã chuyển lớp
    INSERT INTO public.profiles (id, full_name, role, status, is_fixture)
    VALUES (v_stu4_id, 'Hoàng Chuyển Lớp', 'student', 'active', true);
    INSERT INTO public.students (id, student_code, participant_id, full_name, current_class_id, original_class_id, pin_issued_at, status, notes, is_fixture)
    VALUES (v_stu4_id, 'HS_M5_004', 'PART_M5_004', 'Hoàng Chuyển Lớp', v_cls_id, v_cls_id, now(), 'transferred', 'Đã chuyển lớp', true);

    -- 5. HS Đã lưu trữ
    INSERT INTO public.profiles (id, full_name, role, status, is_fixture)
    VALUES (v_stu5_id, 'Phạm Lưu Trữ', 'student', 'archived', true);
    INSERT INTO public.students (id, student_code, participant_id, full_name, current_class_id, original_class_id, pin_issued_at, status, notes, is_fixture)
    VALUES (v_stu5_id, 'HS_M5_005', 'PART_M5_005', 'Phạm Lưu Trữ', v_cls_id, v_cls_id, now(), 'archived', 'Đã lưu trữ', true);

    v_stus_seeded := 5;

    -- Lưu danh sách học sinh ổn định vào m5_class_cohort_members
    INSERT INTO public.m5_class_cohort_members (class_id, course_id, student_id, participant_id, membership_status, notes_snapshot, is_m5_fixture)
    VALUES
        (v_cls_id, v_crs_id, v_stu1_id, 'PART_M5_001', 'active', 'Hoàn tất 14/14', true),
        (v_cls_id, v_crs_id, v_stu2_id, 'PART_M5_002', 'active', 'Chưa hoàn tất, có bài chờ chấm', true),
        (v_cls_id, v_crs_id, v_stu3_id, 'PART_M5_003', 'active', 'Chưa nộp bài nào', true),
        (v_cls_id, v_crs_id, v_stu4_id, 'PART_M5_004', 'transferred', 'Đã chuyển lớp', true),
        (v_cls_id, v_crs_id, v_stu5_id, 'PART_M5_005', 'archived', 'Đã lưu trữ', true)
    ON CONFLICT (class_id, course_id, student_id) DO UPDATE SET
        course_id = EXCLUDED.course_id,
        participant_id = EXCLUDED.participant_id,
        membership_status = EXCLUDED.membership_status,
        notes_snapshot = EXCLUDED.notes_snapshot,
        is_m5_fixture = EXCLUDED.is_m5_fixture;

    -- Tạo kết quả Quiz & Thực hành cho HS 1 (đủ 14/14 buổi)
    FOR v_idx IN 1..14 LOOP
        v_les_id := ('00000000-0000-0000-0000-' || lpad(to_hex(50000 + v_idx), 12, '0'))::uuid;
        IF (v_idx != 4 AND v_idx != 8) THEN
            INSERT INTO public.quiz_results (student_id, lesson_id, class_id, highest_score, attempts_count, passed)
            VALUES (v_stu1_id, v_les_id, v_cls_id, 100, 1, true);
            v_quizzes_seeded := v_quizzes_seeded + 1;
        END IF;
        IF (v_idx != 3 AND v_idx != 7) THEN
            INSERT INTO public.practice_submissions (
                student_id, lesson_id, class_id, type, content, file_size_bytes, status, teacher_feedback, can_resubmit
            )
            VALUES (
                v_stu1_id, v_les_id, v_cls_id, 'file',
                v_stu1_id::text || '/' || v_les_id::text || '/bai_nop_b' || v_idx || '.zip',
                524288, 'approved', 'Đạt yêu cầu.', false
            );
            v_subs_seeded := v_subs_seeded + 1;
        END IF;
    END LOOP;

    -- Tạo bài nộp đang chờ chấm cho HS 2 (Buổi 6)
    v_les_id := ('00000000-0000-0000-0000-' || lpad(to_hex(50006), 12, '0'))::uuid;
    INSERT INTO public.practice_submissions (
        student_id, lesson_id, class_id, type, content, file_size_bytes, status, notes, can_resubmit
    )
    VALUES (
        v_stu2_id, v_les_id, v_cls_id, 'file',
        v_stu2_id::text || '/' || v_les_id::text || '/project_cho_cham.sb3',
        786432, 'submitted', 'Bài thực hành Buổi 6 chờ chấm.', true
    );
    v_subs_seeded := v_subs_seeded + 1;

    PERFORM set_config('app.m5_internal_mutation', 'false', true);
    PERFORM set_config('app.m5_internal_mutation_class_id', '', true);

    RETURN QUERY
    SELECT v_cls_id, v_crs_id, v_next_crs_id, v_stus_seeded, v_quizzes_seeded, v_subs_seeded;
END;
$$;
REVOKE ALL ON FUNCTION public.m5_seed_course_close_fixture(BOOLEAN, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m5_seed_course_close_fixture(BOOLEAN, UUID, TEXT, UUID) TO service_role;

-- ============================================================================
-- 7. RPC LƯU BIÊN NHẬN XÁC MINH CSV VÀ BẮT ĐẦU ĐÓNG KHÓA
-- ============================================================================

DROP FUNCTION IF EXISTS public.m5_save_csv_verification(UUID, UUID, TEXT, TEXT, BOOLEAN);
CREATE OR REPLACE FUNCTION public.m5_save_csv_verification(
    p_class_id UUID,
    p_course_id UUID,
    p_csv_sha256 TEXT,
    p_snapshot_digest TEXT,
    p_confirmed_14_sessions BOOLEAN DEFAULT false,
    p_actor_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_op_id UUID;
    v_is_confirmed BOOLEAN := false;
BEGIN
    -- R3-01: Khóa gọi trực tiếp, yêu cầu service_role
    IF COALESCE(auth.role(), '') IS DISTINCT FROM 'service_role' AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
        RAISE EXCEPTION 'DIRECT_RPC_FORBIDDEN: Must be invoked via m2-backend server workflow' USING ERRCODE = '42501';
    END IF;

    -- R3-01 / M5-03: Xác minh Admin actor trong profiles
    IF p_actor_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = p_actor_id AND p.role = 'admin' AND p.status = 'active'
    ) THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Verified admin actor required' USING ERRCODE = '42501';
    END IF;

    -- R7-02: Lấy khóa tuần tự chuẩn trước tiên: M4 teaching sync -> M5 storage quota -> M5 close class -> Class row FOR UPDATE
    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));
    PERFORM pg_advisory_xact_lock(hashtext('m5_storage_quota'));
    PERFORM pg_advisory_xact_lock(hashtext('m5_close:' || p_class_id::text));

    -- Kiểm tra lớp học và khóa học khớp
    SELECT is_14_sessions_confirmed INTO v_is_confirmed
    FROM public.classes c
    WHERE c.id = p_class_id AND c.course_id = p_course_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CLASS_COURSE_MISMATCH: Lớp học không tồn tại hoặc khóa học không khớp.' USING ERRCODE = 'P0001';
    END IF;

    -- P1-05 / R7-02: Cập nhật is_14_sessions_confirmed trên database nếu Admin xác nhận (chỉ sau khi đã giữ khóa tuần tự)
    IF p_confirmed_14_sessions IS NOT NULL THEN
        UPDATE public.classes
        SET is_14_sessions_confirmed = p_confirmed_14_sessions
        WHERE id = p_class_id AND course_id = p_course_id;
        v_is_confirmed := p_confirmed_14_sessions;
    END IF;

    -- R7-01: Kiểm tra nếu lớp đang có tác vụ đang chạy hoặc dở dang
    IF EXISTS (
        SELECT 1 FROM public.m5_course_close_operations o
        WHERE o.class_id = p_class_id
          AND o.status IN ('deleting_storage', 'deleting_db', 'incomplete')
    ) THEN
        RAISE EXCEPTION 'ACTIVE_WRITE_OR_DELETE_IN_PROGRESS: Lớp học đang có tác vụ đóng khóa đang chạy hoặc chưa hoàn tất (incomplete). Vui lòng hoàn tất tác vụ hiện tại trước.' USING ERRCODE = 'P0001';
    END IF;

    -- R7-01: Xóa các bản ghi 'previewed' hoặc 'csv_verified' cũ của cùng p_class_id trước khi chèn bản ghi 'csv_verified' mới nhất
    DELETE FROM public.m5_course_close_operations
    WHERE class_id = p_class_id
      AND status IN ('previewed', 'csv_verified');

    -- Tạo bản ghi trong m5_course_close_operations
    INSERT INTO public.m5_course_close_operations (
        class_id, course_id, status, csv_sha256, snapshot_digest, is_14_sessions_confirmed, created_by, updated_at
    )
    VALUES (
        p_class_id, p_course_id, 'csv_verified', p_csv_sha256, p_snapshot_digest, COALESCE(v_is_confirmed, false), p_actor_id, now()
    )
    RETURNING id INTO v_op_id;

    RETURN v_op_id;
END;
$$;
REVOKE ALL ON FUNCTION public.m5_save_csv_verification(UUID, UUID, TEXT, TEXT, BOOLEAN, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m5_save_csv_verification(UUID, UUID, TEXT, TEXT, BOOLEAN, UUID) TO service_role;

-- Tương thích ngược 4 tham số (M5-03)
CREATE OR REPLACE FUNCTION public.m5_save_csv_verification(
    p_class_id UUID,
    p_course_id UUID,
    p_csv_sha256 TEXT,
    p_snapshot_digest TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
BEGIN
    RETURN public.m5_save_csv_verification(p_class_id, p_course_id, p_csv_sha256, p_snapshot_digest, false, NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.m5_save_csv_verification(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m5_save_csv_verification(UUID, UUID, TEXT, TEXT) TO service_role;

-- ============================================================================
-- 7B. RPC KHỞI ĐỘNG ĐÓNG KHÓA HỌC (BEGIN COURSE CLOSE - M5-02)
-- ============================================================================

DROP FUNCTION IF EXISTS public.m5_begin_course_close(UUID, UUID, UUID, BOOLEAN, UUID, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.m5_begin_course_close(UUID, UUID, UUID, BOOLEAN, UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.m5_begin_course_close(UUID, UUID, UUID, BOOLEAN, UUID);
DROP FUNCTION IF EXISTS public.m5_begin_course_close(UUID, UUID, UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.m5_begin_course_close(UUID, UUID, UUID);
CREATE OR REPLACE FUNCTION public.m5_begin_course_close(
    p_class_id UUID,
    p_course_id UUID,
    p_next_course_id UUID DEFAULT NULL,
    p_confirmed_14_sessions BOOLEAN DEFAULT false,
    p_actor_id UUID DEFAULT NULL,
    p_is_resume BOOLEAN DEFAULT false,
    p_confirmed_csv_sha256 TEXT DEFAULT NULL
)
RETURNS TABLE (
    operation_id UUID,
    status TEXT,
    target_storage_paths JSONB,
    remaining_storage_paths JSONB,
    deleted_storage_paths JSONB,
    execution_run_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, storage, extensions
AS $$
#variable_conflict use_column
DECLARE
    v_class RECORD;
    v_op RECORD;
    v_lessons_count INT := 0;
    v_current_digest TEXT;
    v_paths JSONB := '[]'::jsonb;
    v_run_id UUID := gen_random_uuid();
BEGIN
    -- R3-01: Khóa gọi trực tiếp, yêu cầu service_role
    IF COALESCE(auth.role(), '') IS DISTINCT FROM 'service_role' AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
        RAISE EXCEPTION 'DIRECT_RPC_FORBIDDEN: Must be invoked via m2-backend server workflow' USING ERRCODE = '42501';
    END IF;

    -- R3-01 / M5-03: Xác minh Admin actor trong profiles
    IF p_actor_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = p_actor_id AND p.role = 'admin' AND p.status = 'active'
    ) THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Verified admin actor required' USING ERRCODE = '42501';
    END IF;

    -- R13-06: Đóng khóa mới (không phải Resume) bắt buộc request hiện hành phải gửi xác nhận 14 buổi = true
    IF COALESCE(p_is_resume, false) = false AND COALESCE(p_confirmed_14_sessions, false) = false THEN
        RAISE EXCEPTION 'SCHEDULE_14_NOT_CONFIRMED: Chưa có xác nhận hoàn thành đủ 14 buổi học của lớp.' USING ERRCODE = 'P0001';
    END IF;

    -- Thứ tự khóa tuần tự: M4 teaching sync -> M5 storage quota -> M5 close class -> Class row
    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));
    PERFORM pg_advisory_xact_lock(hashtext('m5_storage_quota'));
    PERFORM pg_advisory_xact_lock(hashtext('m5_close:' || p_class_id::text));

    SELECT * INTO v_class FROM public.classes WHERE id = p_class_id FOR UPDATE;
    IF NOT FOUND OR v_class.course_id IS DISTINCT FROM p_course_id THEN
        RAISE EXCEPTION 'CLASS_COURSE_MISMATCH: Lớp học không tồn tại hoặc khóa học không khớp.' USING ERRCODE = 'P0001';
    END IF;

    -- P1-05 / R7-02: Chỉ cập nhật xác nhận 14 buổi SAU KHI đã giữ đầy đủ khóa tuần tự
    IF p_confirmed_14_sessions = true AND NOT COALESCE(v_class.is_14_sessions_confirmed, false) THEN
        UPDATE public.classes SET is_14_sessions_confirmed = true WHERE id = p_class_id AND course_id = p_course_id;
        v_class.is_14_sessions_confirmed := true;
    END IF;

    -- Chặn nếu Admin chưa tích xác nhận hoàn thành 14 buổi
    IF NOT COALESCE(v_class.is_14_sessions_confirmed, false) THEN
        RAISE EXCEPTION 'SCHEDULE_14_NOT_CONFIRMED: Chưa có xác nhận hoàn thành đủ 14 buổi học của lớp.' USING ERRCODE = 'P0001';
    END IF;

    -- Kiểm tra khóa học có đúng 14 buổi học
    SELECT count(*)::INT INTO v_lessons_count
    FROM public.lessons l
    WHERE l.course_id = p_course_id AND l.session_number >= 1 AND l.session_number <= 14;

    IF v_lessons_count <> 14 THEN
        RAISE EXCEPTION 'COURSE_SLOTS_INVALID: Khóa học không có đủ 14 slot bài học chuẩn.' USING ERRCODE = 'P0001';
    END IF;

    -- Kiểm tra không có lượt tải tệp giữ chỗ đang hoạt động trên lớp (R3-09)
    IF EXISTS (
        SELECT 1 FROM public.m3_upload_reservations r
        WHERE r.class_id = p_class_id
          AND r.status IN ('reserved', 'claimed')
          AND r.consumed_at IS NULL
          AND r.released_at IS NULL
          AND r.expires_at > clock_timestamp()
    ) THEN
        RAISE EXCEPTION 'ACTIVE_WRITE_OR_DELETE_IN_PROGRESS: Đang có lượt tải tệp giữ chỗ hoạt động trên lớp.' USING ERRCODE = 'P0001';
    END IF;

    -- R7-01: Kiểm tra nếu trên p_class_id đang có bất kỳ tác vụ nào ở trạng thái IN ('deleting_storage', 'deleting_db', 'incomplete') thuộc một course_id khác
    IF EXISTS (
        SELECT 1 FROM public.m5_course_close_operations o
        WHERE o.class_id = p_class_id
          AND o.course_id IS DISTINCT FROM p_course_id
          AND o.status IN ('deleting_storage', 'deleting_db', 'incomplete')
    ) THEN
        RAISE EXCEPTION 'ACTIVE_WRITE_OR_DELETE_IN_PROGRESS: Lớp học đang có tác vụ đóng khóa của khóa khác đang chạy hoặc dở dang.' USING ERRCODE = 'P0001';
    END IF;

    -- Tìm bản ghi tác vụ gần nhất
    SELECT * INTO v_op
    FROM public.m5_course_close_operations
    WHERE class_id = p_class_id AND course_id = p_course_id
      AND status IN ('csv_verified', 'incomplete', 'deleting_storage', 'deleting_db')
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND OR v_op.status NOT IN ('csv_verified', 'incomplete', 'deleting_storage', 'deleting_db') THEN
        RAISE EXCEPTION 'CSV_NOT_VERIFIED: Tác vụ chưa được xác minh CSV hoặc không hợp lệ để đóng khóa.' USING ERRCODE = 'P0001';
    END IF;

    IF v_op.csv_sha256 IS NULL OR btrim(v_op.csv_sha256) = '' THEN
        RAISE EXCEPTION 'CSV_NOT_VERIFIED: Mã băm SHA-256 của CSV chưa được lưu.' USING ERRCODE = 'P0001';
    END IF;

    -- R10-02: Bắt đầu đóng khóa mới (không phải Resume) bắt buộc phải có mã SHA-256 không rỗng
    IF COALESCE(p_is_resume, false) = false AND (p_confirmed_csv_sha256 IS NULL OR btrim(p_confirmed_csv_sha256) = '') THEN
        RAISE EXCEPTION 'CSV_OPEN_NOT_CONFIRMED: Phải cung cấp mã kiểm tra SHA-256 của tệp CSV đã mở và xác nhận trước khi đóng khóa.' USING ERRCODE = 'P0001';
    END IF;

    -- R8-03: Đối chiếu mã kiểm tra CSV nếu Admin truyền vào
    IF p_confirmed_csv_sha256 IS NOT NULL AND btrim(p_confirmed_csv_sha256) <> '' THEN
        p_confirmed_csv_sha256 := btrim(p_confirmed_csv_sha256);
        IF v_op.csv_sha256 IS DISTINCT FROM p_confirmed_csv_sha256 THEN
            RAISE EXCEPTION 'CSV_SHA256_MISMATCH: Bản CSV được xác nhận không khớp với bản CSV mới nhất đã đối chiếu của đợt học.' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- R7-01, R8-02: Ngăn Tab 2 bấm Đóng khóa thông thường (p_is_resume = false) chạy đè lên tác vụ đang chạy/incomplete của Tab 1,
    -- và ngăn 2 tiến trình Resume cùng chạy song song khi tác vụ đang được xử lý trong vòng 60s
    IF v_op.status IN ('incomplete', 'deleting_storage', 'deleting_db') THEN
        IF COALESCE(p_is_resume, false) = false THEN
            RAISE EXCEPTION 'ACTIVE_WRITE_OR_DELETE_IN_PROGRESS: Lớp học đang có tác vụ đóng khóa đang chạy hoặc chưa hoàn tất (incomplete). Vui lòng sử dụng chức năng Tiếp tục (Resume).' USING ERRCODE = 'P0001';
        END IF;

        IF v_op.status IN ('deleting_storage', 'deleting_db')
           AND (
               v_op.updated_at >= clock_timestamp() - interval '60 seconds'
               OR (v_op.lease_expires_at IS NOT NULL AND v_op.lease_expires_at >= clock_timestamp())
           )
        THEN
            RAISE EXCEPTION 'ACTIVE_WRITE_OR_DELETE_IN_PROGRESS: Tác vụ đóng khóa đang được một tiến trình khác xử lý trực tiếp. Vui lòng chờ tiến trình hiện tại dừng hẳn.' USING ERRCODE = 'P0001';
        END IF;

        UPDATE public.m5_course_close_operations
        SET status = 'deleting_storage',
            next_course_id = COALESCE(p_next_course_id, next_course_id),
            is_14_sessions_confirmed = true,
            execution_run_id = v_run_id,
            lease_expires_at = clock_timestamp() + interval '60 seconds',
            updated_at = now()
        WHERE id = v_op.id;

        RETURN QUERY
        SELECT v_op.id, 'deleting_storage'::text, v_op.target_storage_paths, v_op.remaining_storage_paths, v_op.deleted_storage_paths, v_run_id;
        RETURN;
    END IF;

    IF COALESCE(p_is_resume, false) = true AND v_op.status NOT IN ('incomplete', 'deleting_storage', 'deleting_db') THEN
        RAISE EXCEPTION 'INVALID_OPERATION_STATE: Tác vụ không ở trạng thái tạm dừng hoặc dở dang để tiếp tục (Resume).' USING ERRCODE = 'P0001';
    END IF;

    -- Đối chiếu Snapshot Digest với dữ liệu thực tế hiện tại
    v_current_digest := public.m5_compute_db_snapshot_digest(p_class_id, p_course_id);
    IF v_current_digest IS DISTINCT FROM v_op.snapshot_digest THEN
        RAISE EXCEPTION 'CSV_SNAPSHOT_MISMATCH: Dữ liệu đợt học đã thay đổi sau khi xuất CSV.' USING ERRCODE = 'P0001';
    END IF;

    -- R18-01: Chặn bắt đầu xóa tệp nếu đợt học có chung học sinh với tác vụ đóng khóa đang chạy/dở dang của lớp khác
    -- (tránh việc hoàn tất lớp này làm lệch snapshot_digest của lớp kia và kẹt CSV_SNAPSHOT_MISMATCH)
    IF EXISTS (
        SELECT 1
        FROM public.students s
        WHERE (
            s.current_class_id = p_class_id
            OR s.original_class_id = p_class_id
            OR EXISTS (
                SELECT 1 FROM public.m5_class_cohort_members cm
                WHERE cm.student_id = s.id AND cm.class_id = p_class_id AND cm.course_id = p_course_id
            )
            OR EXISTS (
                SELECT 1 FROM public.quiz_results qr
                JOIN public.lessons l ON l.id = qr.lesson_id
                WHERE qr.student_id = s.id AND (qr.class_id = p_class_id OR qr.class_id IS NULL) AND l.course_id = p_course_id
            )
            OR EXISTS (
                SELECT 1 FROM public.practice_submissions ps
                JOIN public.lessons l ON l.id = ps.lesson_id
                WHERE ps.student_id = s.id AND ps.class_id = p_class_id AND l.course_id = p_course_id
            )
        )
        AND public.m5_is_student_in_closing_cohort(s.id, s.current_class_id, s.original_class_id, p_class_id)
    ) THEN
        RAISE EXCEPTION 'SHARED_COHORT_CLOSE_IN_PROGRESS: Có học sinh thuộc đợt học này đang nằm trong tác vụ đóng khóa dở dang của một lớp khác. Vui lòng hoàn tất tác vụ đóng khóa của lớp đó trước.' USING ERRCODE = 'P0001';
    END IF;

    -- Thu thập toàn bộ đường dẫn tệp cần xóa của đợt học
    WITH paths_union AS (
        -- 1. Từ practice_submissions dạng tệp
        SELECT ps.content AS path
        FROM public.practice_submissions ps
        JOIN public.lessons l ON l.id = ps.lesson_id
        WHERE ps.class_id = p_class_id
          AND l.course_id = p_course_id
          AND ps.type = 'file'
          AND ps.content IS NOT NULL AND btrim(ps.content) <> ''
        UNION
        -- 2. Từ m3_upload_reservations (R5-02: lọc chặt theo bài học của course_id)
        SELECT r.object_path AS path
        FROM public.m3_upload_reservations r
        JOIN public.lessons l ON l.id = r.lesson_id
        WHERE r.class_id = p_class_id
          AND l.course_id = p_course_id
          AND r.object_path IS NOT NULL AND btrim(r.object_path) <> ''
        UNION
        -- 3. Từ storage.objects trong bucket m3-practice-files khớp bài nộp hoặc đặt trước của đợt học (R5-02)
        SELECT o.name AS path
        FROM storage.objects o
        WHERE o.bucket_id = 'm3-practice-files'
          AND (
              o.name IN (
                  SELECT ps2.content
                  FROM public.practice_submissions ps2
                  JOIN public.lessons l2 ON l2.id = ps2.lesson_id
                  WHERE ps2.class_id = p_class_id
                    AND l2.course_id = p_course_id
                    AND ps2.type = 'file'
                    AND ps2.content IS NOT NULL AND btrim(ps2.content) <> ''
              )
              OR o.name IN (
                  SELECT r2.object_path
                  FROM public.m3_upload_reservations r2
                  JOIN public.lessons l3 ON l3.id = r2.lesson_id
                  WHERE r2.class_id = p_class_id
                    AND l3.course_id = p_course_id
                    AND r2.object_path IS NOT NULL AND btrim(r2.object_path) <> ''
              )
          )
    )
    SELECT COALESCE(jsonb_agg(path), '[]'::jsonb) INTO v_paths
    FROM paths_union;

    UPDATE public.m5_course_close_operations
    SET status = 'deleting_storage',
        target_storage_paths = v_paths,
        deleted_storage_paths = '[]'::jsonb,
        remaining_storage_paths = v_paths,
        next_course_id = p_next_course_id,
        is_14_sessions_confirmed = true,
        execution_run_id = v_run_id,
        lease_expires_at = clock_timestamp() + interval '60 seconds',
        updated_at = now()
    WHERE id = v_op.id;

    RETURN QUERY
    SELECT v_op.id, 'deleting_storage'::text, v_paths, v_paths, '[]'::jsonb, v_run_id;
END;
$$;
REVOKE ALL ON FUNCTION public.m5_begin_course_close(UUID, UUID, UUID, BOOLEAN, UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m5_begin_course_close(UUID, UUID, UUID, BOOLEAN, UUID, BOOLEAN, TEXT) TO service_role;

-- Overload tương thích 5 tham số
CREATE OR REPLACE FUNCTION public.m5_begin_course_close(
    p_class_id UUID,
    p_course_id UUID,
    p_next_course_id UUID DEFAULT NULL,
    p_confirmed_14_sessions BOOLEAN DEFAULT false,
    p_actor_id UUID DEFAULT NULL
)
RETURNS TABLE (
    operation_id UUID,
    status TEXT,
    target_storage_paths JSONB,
    remaining_storage_paths JSONB,
    deleted_storage_paths JSONB,
    execution_run_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, storage, extensions
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM public.m5_begin_course_close(p_class_id, p_course_id, p_next_course_id, p_confirmed_14_sessions, p_actor_id, false, NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.m5_begin_course_close(UUID, UUID, UUID, BOOLEAN, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m5_begin_course_close(UUID, UUID, UUID, BOOLEAN, UUID) TO service_role;

-- Tương thích ngược phiên bản cũ 3 tham số (M5-02 / M5-03)
CREATE OR REPLACE FUNCTION public.m5_begin_course_close(
    p_class_id UUID,
    p_course_id UUID,
    p_next_course_id UUID DEFAULT NULL
)
RETURNS TABLE (
    operation_id UUID,
    status TEXT,
    target_storage_paths JSONB,
    remaining_storage_paths JSONB,
    deleted_storage_paths JSONB,
    execution_run_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, storage, extensions
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM public.m5_begin_course_close(p_class_id, p_course_id, p_next_course_id, false, NULL, false, NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.m5_begin_course_close(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m5_begin_course_close(UUID, UUID, UUID) TO service_role;

-- Cập nhật tiến độ xóa tệp Storage từng lô (M5-02, R8-02)
DROP FUNCTION IF EXISTS public.m5_update_course_close_storage_progress(UUID, JSONB, JSONB, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.m5_update_course_close_storage_progress(UUID, JSONB, JSONB, TEXT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.m5_update_course_close_storage_progress(UUID, JSONB, JSONB, TEXT, TEXT, TEXT, UUID, UUID);
CREATE OR REPLACE FUNCTION public.m5_update_course_close_storage_progress(
    p_operation_id UUID,
    p_deleted_paths JSONB,
    p_remaining_paths JSONB,
    p_status TEXT DEFAULT 'deleting_storage',
    p_error_code TEXT DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL,
    p_actor_id UUID DEFAULT NULL,
    p_execution_run_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_class_id UUID;
    v_op RECORD;
BEGIN
    -- R3-01: Khóa gọi trực tiếp, yêu cầu service_role
    IF COALESCE(auth.role(), '') IS DISTINCT FROM 'service_role' AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
        RAISE EXCEPTION 'DIRECT_RPC_FORBIDDEN: Must be invoked via m2-backend server workflow' USING ERRCODE = '42501';
    END IF;

    -- R3-01 / M5-03: Xác minh Admin actor trong profiles
    IF p_actor_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = p_actor_id AND p.role = 'admin' AND p.status = 'active'
    ) THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Verified admin actor required' USING ERRCODE = '42501';
    END IF;

    -- R8-02: Đọc class_id của operation để lấy khóa advisory tuần tự chuẩn
    SELECT class_id INTO v_class_id
    FROM public.m5_course_close_operations
    WHERE id = p_operation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Không tìm thấy tác vụ đóng khóa.' USING ERRCODE = 'P0001';
    END IF;

    -- Khóa advisory tuần tự chuẩn m4_teaching_sync -> m5_storage_quota -> m5_close:<class_id>
    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));
    PERFORM pg_advisory_xact_lock(hashtext('m5_storage_quota'));
    PERFORM pg_advisory_xact_lock(hashtext('m5_close:' || v_class_id::text));

    -- Khóa dòng bản ghi operation
    SELECT * INTO v_op
    FROM public.m5_course_close_operations
    WHERE id = p_operation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Không tìm thấy tác vụ đóng khóa.' USING ERRCODE = 'P0001';
    END IF;

    -- R13-06: Từ chối tiến trình cũ khi một tiến trình Resume mới hơn đã tiếp quản
    IF p_execution_run_id IS NOT NULL AND v_op.execution_run_id IS DISTINCT FROM p_execution_run_id THEN
        RAISE EXCEPTION 'STALE_WORKER_EXECUTION: Phiên thực thi đóng khóa đã hết hiệu lực do một tiến trình Tiếp tục (Resume) mới hơn đã tiếp quản.' USING ERRCODE = 'P0001';
    END IF;

    -- Chặn tuyệt đối ghi đè trạng thái completed (hoặc trạng thái không phải đang xóa)
    IF v_op.status = 'completed' OR v_op.status NOT IN ('deleting_storage', 'deleting_db', 'incomplete') THEN
        RAISE EXCEPTION 'INVALID_OPERATION_STATE: Tác vụ đóng khóa đã hoàn tất hoặc không còn ở trạng thái cho phép cập nhật tiến độ xóa tệp (status=%).', v_op.status USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.m5_course_close_operations AS o
    SET deleted_storage_paths = COALESCE(p_deleted_paths, o.deleted_storage_paths),
        remaining_storage_paths = COALESCE(p_remaining_paths, o.remaining_storage_paths),
        status = COALESCE(p_status, o.status),
        -- R22-02: Giữ dấu hiệu khóa đặt lại mẫu (mới tạo / tiếp quản) khi vẫn đang xóa và không có lỗi mới
        last_error_code = CASE
            WHEN p_error_code IS NOT NULL THEN p_error_code
            WHEN COALESCE(p_status, o.status) IN ('deleting_storage', 'deleting_db')
                 AND o.last_error_code IN ('SEED_FIXTURE_LOCK', 'SEED_FIXTURE_LOCK_TAKEOVER')
            THEN o.last_error_code
            ELSE NULL
        END,
        last_error_message = CASE
            WHEN p_error_message IS NOT NULL THEN p_error_message
            WHEN COALESCE(p_status, o.status) IN ('deleting_storage', 'deleting_db')
                 AND o.last_error_message = 'SEED_FIXTURE_LOCK_PREV_INCOMPLETE'
            THEN o.last_error_message
            ELSE NULL
        END,
        lease_expires_at = CASE
            WHEN COALESCE(p_status, o.status) IN ('deleting_storage', 'deleting_db') THEN clock_timestamp() + interval '60 seconds'
            ELSE NULL
        END,
        updated_at = now()
    WHERE o.id = p_operation_id
      AND o.status <> 'completed'
      AND o.status IN ('deleting_storage', 'deleting_db', 'incomplete');

    RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.m5_update_course_close_storage_progress(UUID, JSONB, JSONB, TEXT, TEXT, TEXT, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m5_update_course_close_storage_progress(UUID, JSONB, JSONB, TEXT, TEXT, TEXT, UUID, UUID) TO service_role;

-- R13-06: Gia hạn dấu giữ quyền (heartbeat lease) trong lúc chờ xóa Storage để tiến trình Resume khác không chạy song song
DROP FUNCTION IF EXISTS public.m5_heartbeat_course_close_lease(UUID, UUID, UUID);
CREATE OR REPLACE FUNCTION public.m5_heartbeat_course_close_lease(
    p_operation_id UUID,
    p_execution_run_id UUID,
    p_actor_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_class_id UUID;
    v_op RECORD;
BEGIN
    IF COALESCE(auth.role(), '') IS DISTINCT FROM 'service_role' AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
        RAISE EXCEPTION 'DIRECT_RPC_FORBIDDEN: Must be invoked via m2-backend server workflow' USING ERRCODE = '42501';
    END IF;

    IF p_actor_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = p_actor_id AND p.role = 'admin' AND p.status = 'active'
    ) THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Verified admin actor required' USING ERRCODE = '42501';
    END IF;

    SELECT class_id INTO v_class_id
    FROM public.m5_course_close_operations
    WHERE id = p_operation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Không tìm thấy tác vụ đóng khóa.' USING ERRCODE = 'P0001';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));
    PERFORM pg_advisory_xact_lock(hashtext('m5_storage_quota'));
    PERFORM pg_advisory_xact_lock(hashtext('m5_close:' || v_class_id::text));

    SELECT * INTO v_op
    FROM public.m5_course_close_operations
    WHERE id = p_operation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Không tìm thấy tác vụ đóng khóa.' USING ERRCODE = 'P0001';
    END IF;

    IF p_execution_run_id IS NULL OR v_op.execution_run_id IS DISTINCT FROM p_execution_run_id THEN
        RAISE EXCEPTION 'STALE_WORKER_EXECUTION: Phiên thực thi đóng khóa đã hết hiệu lực do một tiến trình mới hơn đã tiếp quản.' USING ERRCODE = 'P0001';
    END IF;

    IF v_op.status IN ('deleting_storage', 'deleting_db') THEN
        UPDATE public.m5_course_close_operations
        SET lease_expires_at = clock_timestamp() + interval '60 seconds',
            updated_at = clock_timestamp()
        WHERE id = p_operation_id;
    END IF;

    RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.m5_heartbeat_course_close_lease(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m5_heartbeat_course_close_lease(UUID, UUID, UUID) TO service_role;

-- ============================================================================
-- 8. RPC HOÀN TẤT XÓA DỮ LIỆU CƠ SỞ DỮ LIỆU (FINALIZE DB DELETION - M5-01)
-- ============================================================================

DROP FUNCTION IF EXISTS public.m5_finalize_course_close_db(UUID, UUID, UUID, UUID, UUID);
CREATE OR REPLACE FUNCTION public.m5_finalize_course_close_db(
    p_operation_id UUID,
    p_class_id UUID,
    p_course_id UUID,
    p_next_course_id UUID DEFAULT NULL,
    p_actor_id UUID DEFAULT NULL,
    p_execution_run_id UUID DEFAULT NULL
)
RETURNS TABLE (
    deleted_quizzes_count INT,
    deleted_submissions_count INT,
    deleted_reservations_count INT,
    status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, storage, extensions
AS $$
#variable_conflict use_column
DECLARE
    v_class RECORD;
    v_op RECORD;
    v_q_count INT := 0;
    v_s_count INT := 0;
    v_r_count INT := 0;
    v_target_next_course UUID;
BEGIN
    -- R3-01: Khóa gọi trực tiếp, yêu cầu service_role
    IF COALESCE(auth.role(), '') IS DISTINCT FROM 'service_role' AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
        RAISE EXCEPTION 'DIRECT_RPC_FORBIDDEN: Must be invoked via m2-backend server workflow' USING ERRCODE = '42501';
    END IF;

    -- R3-01 / M5-03: Xác minh Admin actor trong profiles
    IF p_actor_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = p_actor_id AND p.role = 'admin' AND p.status = 'active'
    ) THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Verified admin actor required' USING ERRCODE = '42501';
    END IF;

    -- 1. Khóa advisory theo đúng thứ tự toàn cục phối hợp với M3/M4 và chống race condition
    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));
    PERFORM pg_advisory_xact_lock(hashtext('m5_storage_quota'));
    PERFORM pg_advisory_xact_lock(hashtext('m5_close:' || p_class_id::text));

    -- Khóa dòng lớp học
    SELECT * INTO v_class FROM public.classes WHERE id = p_class_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'CLASS_NOT_FOUND: Lớp học không tồn tại.' USING ERRCODE = 'P0001';
    END IF;

    -- 2. Kiểm tra nghiêm ngặt bản ghi operation
    SELECT * INTO v_op
    FROM public.m5_course_close_operations
    WHERE id = p_operation_id
    FOR UPDATE;

    IF NOT FOUND OR v_op.class_id IS DISTINCT FROM p_class_id OR v_op.course_id IS DISTINCT FROM p_course_id THEN
        RAISE EXCEPTION 'OPERATION_NOT_FOUND: Tác vụ đóng khóa không tồn tại hoặc không khớp lớp/khóa học.' USING ERRCODE = 'P0001';
    END IF;

    -- R13-06: Từ chối tiến trình cũ khi một tiến trình Resume mới hơn đã tiếp quản
    IF p_execution_run_id IS NOT NULL AND v_op.execution_run_id IS DISTINCT FROM p_execution_run_id THEN
        RAISE EXCEPTION 'STALE_WORKER_EXECUTION: Phiên thực thi đóng khóa đã hết hiệu lực do một tiến trình Tiếp tục (Resume) mới hơn đã tiếp quản.' USING ERRCODE = 'P0001';
    END IF;

    IF v_op.status NOT IN ('deleting_storage', 'deleting_db', 'incomplete') THEN
        RAISE EXCEPTION 'INVALID_OPERATION_STATUS: Trạng thái tác vụ không hợp lệ để hoàn tất xóa DB.' USING ERRCODE = 'P0001';
    END IF;

    -- Kiểm tra xác nhận 14 buổi
    IF NOT COALESCE(v_op.is_14_sessions_confirmed, false) OR NOT COALESCE(v_class.is_14_sessions_confirmed, false) THEN
        RAISE EXCEPTION 'SCHEDULE_14_NOT_CONFIRMED: Chưa có xác nhận hoàn thành 14 buổi học.' USING ERRCODE = 'P0001';
    END IF;

    -- Kiểm tra biên nhận CSV
    IF v_op.csv_sha256 IS NULL OR btrim(v_op.csv_sha256) = '' OR v_op.snapshot_digest IS NULL OR btrim(v_op.snapshot_digest) = '' THEN
        RAISE EXCEPTION 'CSV_NOT_VERIFIED: Thiếu biên nhận xác minh CSV hoặc snapshot digest.' USING ERRCODE = 'P0001';
    END IF;

    -- Kiểm tra danh sách tệp còn lại trong tiến trình phải rỗng
    IF jsonb_array_length(COALESCE(v_op.remaining_storage_paths, '[]'::jsonb)) > 0 THEN
        RAISE EXCEPTION 'STORAGE_FILES_NOT_FULLY_DELETED: Vẫn còn tệp trong danh sách chờ xóa của Storage.' USING ERRCODE = 'P0001';
    END IF;

    -- Kiểm tra không còn lượt tải tệp giữ chỗ đang hoạt động trên lớp (R3-09)
    IF EXISTS (
        SELECT 1 FROM public.m3_upload_reservations r
        WHERE r.class_id = p_class_id
          AND r.status IN ('reserved', 'claimed')
          AND r.consumed_at IS NULL
          AND r.released_at IS NULL
          AND r.expires_at > clock_timestamp()
    ) THEN
        RAISE EXCEPTION 'ACTIVE_WRITE_OR_DELETE_IN_PROGRESS: Đang có lượt tải tệp giữ chỗ hoạt động trên lớp.' USING ERRCODE = 'P0001';
    END IF;

    -- Kiểm tra thực tế trong storage.objects: không còn bất kỳ object nào trong bucket m3-practice-files (R5-02)
    IF EXISTS (
        SELECT 1 FROM storage.objects o
        WHERE o.bucket_id = 'm3-practice-files'
          AND (
              o.name IN (SELECT jsonb_array_elements_text(v_op.target_storage_paths))
              OR o.name IN (
                  SELECT ps.content
                  FROM public.practice_submissions ps
                  JOIN public.lessons l ON l.id = ps.lesson_id
                  WHERE ps.class_id = p_class_id
                    AND l.course_id = p_course_id
                    AND ps.type = 'file'
                    AND ps.content IS NOT NULL AND btrim(ps.content) <> ''
              )
              OR o.name IN (
                  SELECT r.object_path
                  FROM public.m3_upload_reservations r
                  JOIN public.lessons l2 ON l2.id = r.lesson_id
                  WHERE r.class_id = p_class_id
                    AND l2.course_id = p_course_id
                    AND r.object_path IS NOT NULL AND btrim(r.object_path) <> ''
              )
          )
    ) THEN
        RAISE EXCEPTION 'STORAGE_FILES_NOT_FULLY_DELETED: Tệp trên hệ thống lưu trữ chưa được xóa sạch hoàn toàn.' USING ERRCODE = 'P0001';
    END IF;

    -- Tính/kiểm tra lại Snapshot Digest
    IF public.m5_compute_db_snapshot_digest(p_class_id, p_course_id) IS DISTINCT FROM v_op.snapshot_digest THEN
        RAISE EXCEPTION 'CSV_SNAPSHOT_MISMATCH: Dữ liệu đợt học đã thay đổi sau khi xác minh CSV.' USING ERRCODE = 'P0001';
    END IF;

    -- R17-02: Từ đây trở đi là thay đổi nội bộ của chính tác vụ đóng khóa, bỏ qua trigger bảo vệ (chỉ trong giao dịch này)
    -- R18-01: Quyền bỏ qua chỉ giới hạn trong đúng lớp p_class_id, không bỏ qua chốt của lớp khác đang đóng dở
    PERFORM set_config('app.m5_internal_mutation', 'true', true);
    PERFORM set_config('app.m5_internal_mutation_class_id', p_class_id::text, true);

    -- 3. Xóa các kết quả quiz thuộc (class_id, course_id)
    WITH del_q AS (
        DELETE FROM public.quiz_results qr
        USING public.lessons l
        WHERE qr.lesson_id = l.id
          AND l.course_id = p_course_id
          AND (qr.class_id = p_class_id OR qr.class_id IS NULL)
          AND (
              EXISTS (
                  SELECT 1 FROM public.m5_class_cohort_members cm
                  WHERE cm.class_id = p_class_id AND cm.course_id = p_course_id AND cm.student_id = qr.student_id
              )
              OR EXISTS (
                  SELECT 1 FROM public.students s
                  WHERE s.id = qr.student_id AND s.current_class_id = p_class_id
              )
              OR EXISTS (
                  SELECT 1 FROM public.students s
                  WHERE s.id = qr.student_id AND s.original_class_id = p_class_id
              )
          )
        RETURNING qr.student_id
    )
    SELECT count(*)::INT INTO v_q_count FROM del_q;

    -- Xóa các bài nộp thực hành thuộc (class_id, course_id)
    WITH del_s AS (
        DELETE FROM public.practice_submissions ps
        USING public.lessons l
        WHERE ps.lesson_id = l.id
          AND l.course_id = p_course_id
          AND ps.class_id = p_class_id
        RETURNING ps.id
    )
    SELECT count(*)::INT INTO v_s_count FROM del_s;

    -- Xóa các lượt đặt trước tải tệp của lớp thuộc course_id (R5-02)
    WITH del_r AS (
        DELETE FROM public.m3_upload_reservations r
        USING public.lessons l
        WHERE r.lesson_id = l.id
          AND r.class_id = p_class_id
          AND l.course_id = p_course_id
        RETURNING r.id
    )
    SELECT count(*)::INT INTO v_r_count FROM del_r;

    -- R4-03: Cập nhật original_class_id cho học sinh đã rời lớp để không bị kéo nhầm vào khóa kế tiếp
    UPDATE public.students
    SET original_class_id = current_class_id
    WHERE original_class_id = p_class_id
      AND current_class_id IS NOT NULL
      AND current_class_id IS DISTINCT FROM p_class_id
      -- R18-01: Không chạm vào học sinh đang thuộc tác vụ đóng khóa chưa hoàn tất của lớp khác (giữ nguyên snapshot_digest của lớp đó)
      AND NOT public.m5_is_student_in_closing_cohort(id, current_class_id, original_class_id, p_class_id)
      AND NOT EXISTS (
          SELECT 1 FROM public.m5_course_close_operations op_other
          WHERE op_other.class_id = public.students.current_class_id
            AND op_other.status IN ('previewed', 'csv_verified', 'deleting_storage', 'deleting_db', 'incomplete')
      );

    -- Cập nhật thông tin lớp học và chuyển khóa
    v_target_next_course := COALESCE(p_next_course_id, v_op.next_course_id);

    IF v_target_next_course IS NOT NULL THEN
        UPDATE public.classes
        SET course_id = v_target_next_course,
            is_14_sessions_confirmed = false,
            status = 'active'
        WHERE id = p_class_id;

        -- R4-03: Khởi tạo danh sách thành viên đợt mới trong m5_class_cohort_members cho đúng các học sinh đang thuộc lớp hiện tại
        INSERT INTO public.m5_class_cohort_members (
            class_id, course_id, student_id, participant_id, membership_status, notes_snapshot, is_m5_fixture
        )
        SELECT
            p_class_id,
            v_target_next_course,
            s.id,
            COALESCE(NULLIF(btrim(s.participant_id), ''), 'PART_' || substr(s.id::text, 1, 8)),
            CASE WHEN s.status IN ('archived', 'transferred') THEN s.status ELSE 'active' END,
            s.notes,
            false
        FROM public.students s
        WHERE s.current_class_id = p_class_id
        ON CONFLICT (class_id, course_id, student_id) DO UPDATE SET
            participant_id = EXCLUDED.participant_id,
            membership_status = EXCLUDED.membership_status,
            notes_snapshot = EXCLUDED.notes_snapshot;
    ELSE
        UPDATE public.classes
        SET is_14_sessions_confirmed = false,
            status = 'completed'
        WHERE id = p_class_id;
    END IF;

    -- Cập nhật trạng thái tác vụ hoàn tất
    UPDATE public.m5_course_close_operations AS o
    SET status = 'completed',
        lease_expires_at = NULL,
        updated_at = now()
    WHERE o.id = p_operation_id;

    -- R7-01 / R15-01: Dọn sạch mọi bản ghi chưa hoàn tất khác (nếu có) của cùng class_id
    DELETE FROM public.m5_course_close_operations AS o
    WHERE o.class_id = v_op.class_id
      AND o.id <> p_operation_id
      AND o.status <> 'completed';

    PERFORM set_config('app.m5_internal_mutation', 'false', true);
    PERFORM set_config('app.m5_internal_mutation_class_id', '', true);

    RETURN QUERY
    SELECT v_q_count, v_s_count, v_r_count, 'completed'::text;
END;
$$;
REVOKE ALL ON FUNCTION public.m5_finalize_course_close_db(UUID, UUID, UUID, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m5_finalize_course_close_db(UUID, UUID, UUID, UUID, UUID, UUID) TO service_role;

-- Overload tương thích 4 tham số (M5-01 / M5-03)
CREATE OR REPLACE FUNCTION public.m5_finalize_course_close_db(
    p_operation_id UUID,
    p_class_id UUID,
    p_course_id UUID,
    p_next_course_id UUID DEFAULT NULL
)
RETURNS TABLE (
    deleted_quizzes_count INT,
    deleted_submissions_count INT,
    deleted_reservations_count INT,
    status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, storage, extensions
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM public.m5_finalize_course_close_db(p_operation_id, p_class_id, p_course_id, p_next_course_id, NULL, NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.m5_finalize_course_close_db(UUID, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m5_finalize_course_close_db(UUID, UUID, UUID, UUID) TO service_role;

-- ============================================================================
-- 9. CẬP NHẬT PUBLIC.M3_RESERVE_PRACTICE_UPLOAD KIỂM SOÁT STORAGE QUOTA & CLASS CLOSE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.m3_reserve_practice_upload(
    p_student_id UUID,
    p_lesson_id UUID,
    p_file_extension TEXT,
    p_file_size_bytes INTEGER DEFAULT 2097152
)
RETURNS TABLE (
    reservation_id UUID,
    object_path TEXT,
    expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, storage, extensions
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
    v_expires TIMESTAMPTZ := (now() + interval '10 minutes');
    v_file_bytes INTEGER := COALESCE(p_file_size_bytes, 2097152);
    v_quota RECORD;
    v_class_id UUID;
    v_student_status TEXT;
BEGIN
    IF v_file_bytes <= 0 OR v_file_bytes > 2097152 THEN
        RAISE EXCEPTION 'INVALID_FILE_SIZE: Dung lượng tệp không được vượt quá 2 MB.';
    END IF;

    IF public.current_role() IS DISTINCT FROM 'service_role' THEN
        IF public.current_role() IS DISTINCT FROM 'student'
           OR public.current_profile_id() IS DISTINCT FROM p_student_id THEN
            RAISE EXCEPTION 'FORBIDDEN: Chỉ có chính học sinh mới được tạo lượt đặt trước tải bài nộp.';
        END IF;
    END IF;

    -- R3-03: Khóa theo thứ tự toàn cục chuẩn: M4 Sync -> M5 Storage Quota -> Student
    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));
    PERFORM pg_advisory_xact_lock(hashtext('m5_storage_quota'));
    PERFORM pg_advisory_xact_lock(hashtext('student:' || p_student_id::text));

    SELECT s.current_class_id, s.status INTO v_class_id, v_student_status
    FROM public.students s
    WHERE s.id = p_student_id
    FOR KEY SHARE;

    IF NOT FOUND OR v_class_id IS NULL OR v_student_status = 'archived' THEN
        RAISE EXCEPTION 'FORBIDDEN: Học sinh không tồn tại hoặc chưa được phân vào lớp học hợp lệ.';
    END IF;

    -- P1-01 / R3-03: Khóa m5_close:<class_id>, khóa dòng classes FOR KEY SHARE và kiểm tra tác vụ đóng khóa
    PERFORM pg_advisory_xact_lock(hashtext('m5_close:' || v_class_id::text));
    PERFORM 1 FROM public.classes c WHERE c.id = v_class_id FOR KEY SHARE;

    SELECT * INTO v_student
    FROM public.students s
    WHERE s.id = p_student_id;

    IF v_student.current_class_id IS DISTINCT FROM v_class_id THEN
        RAISE EXCEPTION 'STUDENT_CLASS_CHANGED: Lớp học của học sinh đã thay đổi. Vui lòng thử lại.' USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.m5_course_close_operations ops
        WHERE ops.class_id = v_class_id
          AND ops.status IN ('deleting_storage', 'deleting_db', 'incomplete')
    ) THEN
        RAISE EXCEPTION 'CLASS_CLOSE_IN_PROGRESS: Lớp học đang trong quá trình đóng khóa hoặc tác vụ chưa hoàn tất. Tạm khóa tải tệp.' USING ERRCODE = 'P0001';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('reservation:' || p_student_id::text || ':' || p_lesson_id::text));

    -- Kiểm tra cổng dung lượng Storage tổ chức (R6-01)
    SELECT * INTO v_quota FROM public.m5_get_storage_quota_status(v_file_bytes::bigint);
    IF NOT COALESCE(v_quota.allowed, false) OR COALESCE(v_quota.is_exceeded, true) THEN
        IF v_quota.code = 'STORAGE_BASELINE_UNVERIFIED' THEN
            RAISE EXCEPTION 'STORAGE_BASELINE_UNVERIFIED: %', v_quota.message USING ERRCODE = 'P0001';
        END IF;
        RAISE EXCEPTION 'STORAGE_QUOTA_EXCEEDED: Dung lượng lưu trữ dự kiến vượt quá hạn mức tối đa cho phép. Không thể tải tệp mới. Học sinh vẫn có thể nộp bằng liên kết (link).';
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
      AND r.status IN ('reserved', 'claimed')
      AND r.consumed_at IS NULL
      AND r.released_at IS NULL
      AND r.expires_at > clock_timestamp();

    IF v_pending_count >= 2 THEN
        RAISE EXCEPTION 'PENDING_UPLOAD_CAP_EXCEEDED: Bạn có quá nhiều yêu cầu tải tệp đang chờ xử lý. Vui lòng hoàn tất hoặc thử lại sau.';
    END IF;

    v_token := encode(extensions.gen_random_bytes(16), 'hex');
    v_path := p_student_id::text || '/' || p_lesson_id::text || '/' || extract(epoch from now())::bigint || '_' || v_token || '.' || v_clean_ext;

    INSERT INTO public.m3_upload_reservations (
        id, student_id, lesson_id, class_id, object_path, status, reserved_bytes, reserved_at, expires_at
    )
    VALUES (
        v_res_id, p_student_id, p_lesson_id, v_student.current_class_id, v_path, 'reserved', v_file_bytes, now(), v_expires
    );

    RETURN QUERY
    SELECT v_res_id, v_path, v_expires;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_reserve_practice_upload(UUID, UUID, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.m3_reserve_practice_upload(UUID, UUID, TEXT, INTEGER) TO authenticated, service_role;

-- Tương thích ngược phiên bản cũ 3 tham số
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
SET search_path = pg_catalog, public, private, storage, extensions
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM public.m3_reserve_practice_upload(p_student_id, p_lesson_id, p_file_extension, 2097152);
END;
$$;
REVOKE ALL ON FUNCTION public.m3_reserve_practice_upload(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.m3_reserve_practice_upload(UUID, UUID, TEXT) TO authenticated, service_role;

-- ============================================================================
-- 10. BẢO VỆ CHẶN TẢI TỆP VƯỢT RESERVED_BYTES VÀ HẠN MỨC STORAGE (M5-07)
-- ============================================================================

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

    -- Khóa theo thứ tự toàn cục
    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));
    PERFORM pg_advisory_xact_lock(hashtext('m5_storage_quota'));
    PERFORM pg_advisory_xact_lock(hashtext('reservation:' || v_student_id::text || ':' || v_lesson_id::text));

    -- Kiểm tra đuôi mở rộng
    v_clean_ext := pg_catalog.lower(storage.extension(name));
    IF v_clean_ext NOT IN ('zip', 'pdf', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'py', 'js', 'html', 'css', 'json', 'md', 'sb3') THEN
        RETURN FALSE;
    END IF;

    -- Kiểm tra học sinh, lớp, bài học còn hiệu lực
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

    -- Lấy reservation hợp lệ (R3-09)
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

    -- Lớp không nằm trong tiến trình đóng khóa
    IF EXISTS (
        SELECT 1 FROM public.m5_course_close_operations o
        WHERE o.class_id = v_res.class_id
          AND o.status IN ('deleting_storage', 'deleting_db', 'incomplete')
    ) THEN
        RETURN FALSE;
    END IF;

    -- Kiểm tra kích thước tệp p_object_size (R5-04: buộc phải có và không vượt reserved_bytes)
    IF p_object_size IS NULL OR p_object_size <= 0 OR p_object_size > 2097152 OR p_object_size > v_res.reserved_bytes THEN
        RETURN FALSE;
    END IF;

    -- Kiểm tra cổng hạn mức Storage tổ chức (R6-01: fail-closed nếu chưa verify baseline)
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

    -- R3-09: chỉ tính các reservation còn hiệu lực chưa tiêu thụ và chưa giải phóng
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

-- Overload tương thích phiên bản 2 tham số (R5-04: buộc trả về FALSE để ngăn vượt kích thước)
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
BEGIN
    RETURN FALSE;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_check_storage_insert_permission(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.m3_check_storage_insert_permission(TEXT, TEXT) TO authenticated, service_role;

-- Cập nhật RLS Policy trên storage.objects truyền kích thước tệp từ metadata (M5-07, R5-04)
DROP POLICY IF EXISTS "m3_storage_student_insert" ON storage.objects;
DROP POLICY IF EXISTS "m3_storage_insert_policy" ON storage.objects;
CREATE POLICY "m3_storage_insert_policy" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'm3-practice-files'
        AND public.m3_check_storage_insert_permission(
            bucket_id,
            name,
            CASE WHEN (metadata->>'size') ~ '^[0-9]+$' THEN (metadata->>'size')::bigint ELSE NULL END
        )
    );

-- Cập nhật m3_submit_practice đối chiếu kích thước thực tế với reserved_bytes (M5-07)
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
SET search_path = pg_catalog, public, private, storage
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
    v_res_bytes INT;
    v_class_id UUID;
    v_student_status TEXT;
    v_profile_status TEXT;
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

    -- P1-01 / R3-03: Khóa m5_close:<class_id>, khóa dòng classes FOR KEY SHARE và kiểm tra tác vụ đóng khóa
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

        SELECT r.id, r.reserved_bytes INTO v_res_id, v_res_bytes
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

        -- Đối chiếu kích thước thực tế và p_file_size_bytes với reserved_bytes (M5-07)
        IF v_actual_size IS NOT NULL AND v_actual_size > v_res_bytes THEN
            RAISE EXCEPTION 'FILE_SIZE_EXCEEDS_RESERVATION: Kích thước tệp thực tế (%) vượt quá dung lượng đã đặt trước (%).', v_actual_size, v_res_bytes
            USING ERRCODE = 'P0001';
        END IF;

        IF p_file_size_bytes IS NOT NULL AND p_file_size_bytes > v_res_bytes THEN
            RAISE EXCEPTION 'FILE_SIZE_EXCEEDS_RESERVATION: Dung lượng khai báo (%) vượt quá dung lượng đã đặt trước (%).', p_file_size_bytes, v_res_bytes
            USING ERRCODE = 'P0001';
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
    FROM public.practice_submissions sub
    WHERE sub.student_id = p_student_profile_id
      AND sub.lesson_id = p_lesson_id
      AND sub.class_id = v_student.current_class_id
    FOR UPDATE;

    IF FOUND THEN
        IF v_existing.status = 'approved' AND v_existing.can_resubmit = false THEN
            RAISE EXCEPTION 'CANNOT_RESUBMIT_APPROVED: Bài nộp đã được duyệt Đạt và chưa được giáo viên mở lại quyền nộp bài.';
        END IF;

        IF v_existing.type = 'file' AND v_existing.content <> v_clean_content THEN
            v_old_file_path := v_existing.content;
        END IF;

        UPDATE public.practice_submissions
        SET type = v_clean_type,
            content = v_clean_content,
            file_size_bytes = CASE WHEN v_clean_type = 'file' THEN COALESCE(p_file_size_bytes, v_actual_size::integer, v_res_bytes) ELSE NULL END,
            notes = COALESCE(p_notes, ''),
            status = 'submitted',
            submitted_at = now(),
            teacher_feedback = NULL,
            graded_at = NULL,
            graded_by = NULL,
            updated_at = now(),
            can_resubmit = true
        WHERE public.practice_submissions.id = v_existing.id;

        -- R3-09: Chuyển reservation sang consumed ngay sau khi bài nộp gắn tệp thành công
        IF v_clean_type = 'file' AND v_res_id IS NOT NULL THEN
            UPDATE public.m3_upload_reservations
            SET status = 'consumed',
                consumed_at = now()
            WHERE public.m3_upload_reservations.id = v_res_id;
        END IF;

        RETURN QUERY
        SELECT
            v_existing.id,
            p_student_profile_id,
            p_lesson_id,
            v_clean_type,
            v_clean_content,
            CASE WHEN v_clean_type = 'file' THEN COALESCE(p_file_size_bytes, v_actual_size::integer, v_res_bytes) ELSE NULL END,
            COALESCE(p_notes, ''),
            'submitted'::text,
            true,
            now(),
            v_old_file_path;
        RETURN;
    END IF;

    -- Bài nộp mới
    INSERT INTO public.practice_submissions (
        student_id, lesson_id, class_id, type, content, file_size_bytes, notes, status, can_resubmit, submitted_at
    )
    VALUES (
        p_student_profile_id,
        p_lesson_id,
        v_student.current_class_id,
        v_clean_type,
        v_clean_content,
        CASE WHEN v_clean_type = 'file' THEN COALESCE(p_file_size_bytes, v_actual_size::integer, v_res_bytes) ELSE NULL END,
        COALESCE(p_notes, ''),
        'submitted',
        true,
        now()
    )
    RETURNING
        public.practice_submissions.id,
        public.practice_submissions.student_id,
        public.practice_submissions.lesson_id,
        public.practice_submissions.type,
        public.practice_submissions.content,
        public.practice_submissions.file_size_bytes,
        public.practice_submissions.notes,
        public.practice_submissions.status,
        public.practice_submissions.can_resubmit,
        public.practice_submissions.submitted_at,
        NULL::text
    INTO
        id, student_id, lesson_id, type, content, file_size_bytes, notes, status, can_resubmit, submitted_at, old_file_path;

    -- R3-09: Chuyển reservation sang consumed ngay sau khi bài nộp gắn tệp thành công
    IF v_clean_type = 'file' AND v_res_id IS NOT NULL THEN
        UPDATE public.m3_upload_reservations
        SET status = 'consumed',
            consumed_at = now()
        WHERE public.m3_upload_reservations.id = v_res_id;
    END IF;

    RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_submit_practice(UUID, UUID, TEXT, TEXT, INT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m3_submit_practice(UUID, UUID, TEXT, TEXT, INT, TEXT) TO service_role;

-- ============================================================================
-- 11. ĐỒNG BỘ KHÓA ĐÓNG LỚP M5_CLOSE CHO MỌI THAO TÁC HỌC TẬP (P1-01)
-- ============================================================================

-- A. Submit Quiz Attempt với khóa m4_teaching_sync -> m5_close:<class_id> -> KEY SHARE classes
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
    v_class_id UUID;
    v_student_status TEXT;
    v_profile_status TEXT;
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
    SELECT v_calc_score, v_calc_passed, v_new_highest, v_new_attempts;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_submit_quiz_attempt(UUID, UUID, INT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m3_submit_quiz_attempt(UUID, UUID, INT[]) TO service_role;

-- B. Grade Submission với khóa m4_teaching_sync -> m5_close:<class_id> -> KEY SHARE classes
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
    v_class_id UUID;
    v_student_id UUID;
BEGIN
    SELECT * INTO v_actor
    FROM public.profiles p
    WHERE p.id = p_actor_profile_id AND p.status = 'active';

    IF NOT FOUND OR v_actor.role NOT IN ('admin', 'teacher') THEN
        RAISE EXCEPTION 'FORBIDDEN: Chỉ có Giáo viên phụ trách hoặc Quản trị viên mới được chấm bài.';
    END IF;

    -- R3-05 Bước 1: Đọc class_id, student_id KHÔNG có FOR UPDATE
    SELECT ps.class_id, ps.student_id INTO v_class_id, v_student_id
    FROM public.practice_submissions ps
    WHERE ps.id = p_submission_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Không tìm thấy bài nộp.';
    END IF;

    IF v_class_id IS NULL THEN
        SELECT s.current_class_id INTO v_class_id
        FROM public.students s
        WHERE s.id = v_student_id;
    END IF;

    -- R3-05 Bước 2: Lấy khóa theo đúng thứ tự chuẩn toàn cục: m4_teaching_sync -> m5_close:<class_id> -> KEY SHARE classes
    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));
    PERFORM pg_advisory_xact_lock(hashtext('m5_close:' || v_class_id::text));
    PERFORM 1 FROM public.classes c WHERE c.id = v_class_id FOR KEY SHARE;

    -- R3-05 Bước 3: Kiểm tra lớp không đang đóng khóa
    IF EXISTS (
        SELECT 1 FROM public.m5_course_close_operations o
        WHERE o.class_id = v_class_id
          AND o.status IN ('deleting_storage', 'deleting_db', 'incomplete')
    ) THEN
        RAISE EXCEPTION 'CLASS_CLOSE_IN_PROGRESS: Lớp học đang trong quá trình đóng khóa hoặc tác vụ chưa hoàn tất.' USING ERRCODE = 'P0001';
    END IF;

    -- R3-05 Bước 4: Bây giờ mới khóa dòng bài nộp
    SELECT * INTO v_sub
    FROM public.practice_submissions ps
    WHERE ps.id = p_submission_id AND ps.class_id = v_class_id
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
              AND ct.class_id = v_class_id
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

-- C. Reopen Submission với khóa m4_teaching_sync -> m5_close:<class_id> -> KEY SHARE classes
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
    v_class_id UUID;
    v_student_id UUID;
BEGIN
    SELECT * INTO v_actor
    FROM public.profiles p
    WHERE p.id = p_actor_profile_id AND p.status = 'active';

    IF NOT FOUND OR v_actor.role NOT IN ('admin', 'teacher') THEN
        RAISE EXCEPTION 'FORBIDDEN: Chỉ có Giáo viên phụ trách hoặc Quản trị viên mới được mở lại quyền nộp bài.';
    END IF;

    -- R3-05 Bước 1: Đọc class_id, student_id KHÔNG có FOR UPDATE
    SELECT ps.class_id, ps.student_id INTO v_class_id, v_student_id
    FROM public.practice_submissions ps
    WHERE ps.id = p_submission_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Không tìm thấy bài nộp.';
    END IF;

    IF v_class_id IS NULL THEN
        SELECT s.current_class_id INTO v_class_id
        FROM public.students s
        WHERE s.id = v_student_id;
    END IF;

    -- R3-05 Bước 2: Lấy khóa theo đúng thứ tự chuẩn toàn cục: m4_teaching_sync -> m5_close:<class_id> -> KEY SHARE classes
    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));
    PERFORM pg_advisory_xact_lock(hashtext('m5_close:' || v_class_id::text));
    PERFORM 1 FROM public.classes c WHERE c.id = v_class_id FOR KEY SHARE;

    -- R3-05 Bước 3: Kiểm tra lớp không đang đóng khóa
    IF EXISTS (
        SELECT 1 FROM public.m5_course_close_operations o
        WHERE o.class_id = v_class_id
          AND o.status IN ('deleting_storage', 'deleting_db', 'incomplete')
    ) THEN
        RAISE EXCEPTION 'CLASS_CLOSE_IN_PROGRESS: Lớp học đang trong quá trình đóng khóa hoặc tác vụ chưa hoàn tất.' USING ERRCODE = 'P0001';
    END IF;

    -- R3-05 Bước 4: Bây giờ mới khóa dòng bài nộp
    SELECT * INTO v_sub
    FROM public.practice_submissions ps
    WHERE ps.id = p_submission_id AND ps.class_id = v_class_id
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
              AND ct.class_id = v_class_id
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

-- D. Transfer Student với khóa m4_teaching_sync -> student:<id> -> m5_close UUID ASC (R3-03)
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
    v_old_class_id UUID;
    v_student RECORD;
    v_lock_1 UUID;
    v_lock_2 UUID;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = p_admin_profile_id AND role = 'admin' AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN: Chỉ có Quản trị viên mới được chuyển lớp học sinh.';
    END IF;

    IF p_target_class_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_TARGET_CLASS: Lớp học đích không được để trống.';
    END IF;

    -- R3-03: Lấy khóa tuần tự toàn cục: m4_teaching_sync -> student:<id>
    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));
    PERFORM pg_advisory_xact_lock(hashtext('student:' || p_student_id::text));

    SELECT * INTO v_student
    FROM public.students s
    WHERE s.id = p_student_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Không tìm thấy học sinh cần chuyển lớp.';
    END IF;

    v_old_class_id := v_student.current_class_id;

    -- R3-03: Lấy khóa m5_close:<class_id> theo thứ tự UUID tăng dần để ngăn deadlock giữa 2 lớp
    IF v_old_class_id IS NOT NULL AND v_old_class_id <> p_target_class_id THEN
        IF v_old_class_id < p_target_class_id THEN
            v_lock_1 := v_old_class_id;
            v_lock_2 := p_target_class_id;
        ELSE
            v_lock_1 := p_target_class_id;
            v_lock_2 := v_old_class_id;
        END IF;

        PERFORM pg_advisory_xact_lock(hashtext('m5_close:' || v_lock_1::text));
        PERFORM 1 FROM public.classes c WHERE c.id = v_lock_1 FOR KEY SHARE;

        PERFORM pg_advisory_xact_lock(hashtext('m5_close:' || v_lock_2::text));
        PERFORM 1 FROM public.classes c WHERE c.id = v_lock_2 FOR KEY SHARE;
    ELSE
        PERFORM pg_advisory_xact_lock(hashtext('m5_close:' || p_target_class_id::text));
        PERFORM 1 FROM public.classes c WHERE c.id = p_target_class_id FOR KEY SHARE;
    END IF;

    -- Kiểm tra lớp đích tồn tại và active
    SELECT * INTO v_target_class
    FROM public.classes c
    WHERE c.id = p_target_class_id AND c.status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Lớp học đích không tồn tại hoặc không ở trạng thái hoạt động.';
    END IF;

    -- Kiểm tra cả lớp cũ và lớp mới không trong tiến trình đóng khóa
    IF v_old_class_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.m5_course_close_operations ops
        WHERE ops.class_id = v_old_class_id
          AND ops.status IN ('deleting_storage', 'deleting_db', 'incomplete')
    ) THEN
        RAISE EXCEPTION 'CLASS_CLOSE_IN_PROGRESS: Lớp học nguồn đang trong quá trình đóng khóa hoặc tác vụ chưa hoàn tất.' USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.m5_course_close_operations ops
        WHERE ops.class_id = p_target_class_id
          AND ops.status IN ('deleting_storage', 'deleting_db', 'incomplete')
    ) THEN
        RAISE EXCEPTION 'CLASS_CLOSE_IN_PROGRESS: Lớp học đích đang trong quá trình đóng khóa hoặc tác vụ chưa hoàn tất.' USING ERRCODE = 'P0001';
    END IF;

    -- R17-02: Chặn chuyển lớp khi học sinh đang thuộc bất kỳ đợt học đóng khóa dở dang nào (kể cả đã chuyển sang lớp khác trước khi lớp cũ đóng khóa)
    IF public.m5_is_student_in_closing_cohort(p_student_id, v_old_class_id, p_target_class_id) THEN
        RAISE EXCEPTION 'CLASS_CLOSE_IN_PROGRESS: Học sinh thuộc đợt học đang trong quá trình đóng khóa hoặc tác vụ chưa hoàn tất. Không thể chuyển lớp lúc này.' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.students
    SET current_class_id = p_target_class_id,
        status = 'active',
        updated_at = now()
    WHERE id = p_student_id;

    RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_transfer_student(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m3_transfer_student(UUID, UUID, UUID) TO service_role;

-- R18-02: Định nghĩa lại m3_update_lesson: giữ khóa tuần tự m4_teaching_sync -> m5_close:<class_id> (UUID tăng dần)
-- TRƯỚC khi đọc m5_course_close_operations và cập nhật public.lessons, để không lọt qua chốt đóng khóa dở dang.
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
    v_course_id UUID;
    v_cls_id UUID;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = p_admin_profile_id AND role = 'admin' AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN: Chỉ có Quản trị viên mới được chỉnh sửa bài học.';
    END IF;

    -- R18-02: Khóa tuần tự toàn cục trước, sau đó khóa từng lớp liên quan theo UUID tăng dần
    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));

    SELECT l.course_id INTO v_course_id
    FROM public.lessons l
    WHERE l.id = p_lesson_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Không tìm thấy bài học.';
    END IF;

    FOR v_cls_id IN (
        SELECT x.class_id FROM (
            SELECT c.id AS class_id FROM public.classes c WHERE c.course_id = v_course_id
            UNION
            SELECT o.class_id FROM public.m5_course_close_operations o WHERE o.course_id = v_course_id
        ) x
        ORDER BY x.class_id ASC
    ) LOOP
        PERFORM pg_advisory_xact_lock(hashtext('m5_close:' || v_cls_id::text));
    END LOOP;

    IF EXISTS (
        SELECT 1 FROM public.m5_course_close_operations op
        WHERE op.course_id = v_course_id
          AND op.status IN ('deleting_storage', 'deleting_db', 'incomplete')
    ) THEN
        RAISE EXCEPTION 'CLASS_CLOSE_IN_PROGRESS: Khóa học này đang có lớp trong quá trình đóng khóa dở dang. Không thể chỉnh sửa bài học lúc này.' USING ERRCODE = 'P0001';
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

-- ============================================================================
-- 12. BẢO VỆ DỮ LIỆU ĐỢT HỌC ĐANG ĐÓNG KHÓA DỞ DANG (R17-02)
-- Mọi thay đổi làm đổi m5_compute_db_snapshot_digest khi tác vụ ở trạng thái
-- ('deleting_storage', 'deleting_db', 'incomplete') đều bị chặn để tác vụ không kẹt vĩnh viễn
-- (CSV_SNAPSHOT_MISMATCH sau khi tệp Storage đã bị xóa).
-- ============================================================================

-- R18-01: Thêm tham số p_ignore_class_id để bỏ qua tác vụ đóng khóa của chính lớp đang thao tác nội bộ
DROP FUNCTION IF EXISTS public.m5_is_student_in_closing_cohort(UUID, UUID, UUID);
CREATE OR REPLACE FUNCTION public.m5_is_student_in_closing_cohort(
    p_student_id UUID,
    p_class_id_1 UUID DEFAULT NULL,
    p_class_id_2 UUID DEFAULT NULL,
    p_ignore_class_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.m5_course_close_operations op
        WHERE op.status IN ('deleting_storage', 'deleting_db', 'incomplete')
          AND (p_ignore_class_id IS NULL OR op.class_id IS DISTINCT FROM p_ignore_class_id)
          AND (
              op.class_id IN (p_class_id_1, p_class_id_2)
              OR EXISTS (
                  SELECT 1 FROM public.students s
                  WHERE s.id = p_student_id
                    AND (s.current_class_id = op.class_id OR s.original_class_id = op.class_id)
              )
              OR EXISTS (
                  SELECT 1 FROM public.m5_class_cohort_members cm
                  WHERE cm.student_id = p_student_id
                    AND cm.class_id = op.class_id
                    AND cm.course_id = op.course_id
              )
              OR EXISTS (
                  SELECT 1 FROM public.quiz_results qr
                  JOIN public.lessons l ON l.id = qr.lesson_id
                  WHERE qr.student_id = p_student_id
                    AND (qr.class_id = op.class_id OR qr.class_id IS NULL)
                    AND l.course_id = op.course_id
              )
              OR EXISTS (
                  SELECT 1 FROM public.practice_submissions ps
                  JOIN public.lessons l ON l.id = ps.lesson_id
                  WHERE ps.student_id = p_student_id
                    AND ps.class_id = op.class_id
                    AND l.course_id = op.course_id
              )
          )
    );
$$;
REVOKE ALL ON FUNCTION public.m5_is_student_in_closing_cohort(UUID, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m5_is_student_in_closing_cohort(UUID, UUID, UUID, UUID) TO service_role;

-- R18-01 / R18-02: Các trigger bảo vệ dưới đây
--   (1) chỉ bỏ qua chốt trong phạm vi đúng lớp đang thao tác nội bộ (app.m5_internal_mutation_class_id),
--       tuyệt đối không bỏ qua tác vụ đóng khóa dở dang của lớp khác;
--   (2) giữ khóa tuần tự pg_advisory_xact_lock(hashtext('m4_teaching_sync')) (và m5_close:<class_id> theo UUID tăng dần
--       đối với bài học) TRƯỚC khi đọc m5_course_close_operations để tuần tự hóa với m5_begin_course_close
--       trong READ COMMITTED.

-- a) public.students
CREATE OR REPLACE FUNCTION public.m5_fn_guard_student_during_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_bypass_class_id UUID := CASE
        WHEN COALESCE(current_setting('app.m5_internal_mutation', true), '') = 'true'
         AND NULLIF(btrim(current_setting('app.m5_internal_mutation_class_id', true)), '') IS NOT NULL
        THEN btrim(current_setting('app.m5_internal_mutation_class_id', true))::uuid
        ELSE NULL
    END;
BEGIN
    IF TG_OP = 'UPDATE'
       AND (OLD.participant_id, OLD.student_code, OLD.full_name, OLD.status, COALESCE(OLD.notes, ''), OLD.current_class_id, OLD.original_class_id)
           IS NOT DISTINCT FROM
           (NEW.participant_id, NEW.student_code, NEW.full_name, NEW.status, COALESCE(NEW.notes, ''), NEW.current_class_id, NEW.original_class_id)
    THEN
        RETURN NEW;
    END IF;

    -- R18-02: Tuần tự hóa tuyệt đối với m5_begin_course_close trước khi đọc m5_course_close_operations
    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));

    IF TG_OP = 'INSERT' THEN
        IF public.m5_is_student_in_closing_cohort(NEW.id, NEW.current_class_id, NEW.original_class_id, v_bypass_class_id) THEN
            RAISE EXCEPTION 'CLASS_CLOSE_IN_PROGRESS: Lớp hoặc đợt học đang trong quá trình đóng khóa dở dang. Không thể thêm học sinh lúc này.' USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        IF public.m5_is_student_in_closing_cohort(OLD.id, OLD.current_class_id, OLD.original_class_id, v_bypass_class_id) THEN
            RAISE EXCEPTION 'CLASS_CLOSE_IN_PROGRESS: Học sinh thuộc đợt học đang đóng khóa dở dang. Không thể xóa học sinh lúc này.' USING ERRCODE = 'P0001';
        END IF;
        RETURN OLD;
    ELSE
        IF public.m5_is_student_in_closing_cohort(NEW.id, OLD.current_class_id, NEW.current_class_id, v_bypass_class_id)
           OR public.m5_is_student_in_closing_cohort(NEW.id, OLD.original_class_id, NEW.original_class_id, v_bypass_class_id)
        THEN
            RAISE EXCEPTION 'CLASS_CLOSE_IN_PROGRESS: Học sinh thuộc đợt học đang đóng khóa dở dang (kể cả đã chuyển lớp). Không thể sửa thông tin hoặc ghi chú học sinh cho đến khi đóng khóa hoàn tất.' USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_m5_guard_student_during_close ON public.students;
CREATE TRIGGER trg_m5_guard_student_during_close
    BEFORE INSERT OR UPDATE OR DELETE ON public.students
    FOR EACH ROW
    EXECUTE FUNCTION public.m5_fn_guard_student_during_close();

-- b) public.profiles
CREATE OR REPLACE FUNCTION public.m5_fn_guard_profile_during_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_bypass_class_id UUID := CASE
        WHEN COALESCE(current_setting('app.m5_internal_mutation', true), '') = 'true'
         AND NULLIF(btrim(current_setting('app.m5_internal_mutation_class_id', true)), '') IS NOT NULL
        THEN btrim(current_setting('app.m5_internal_mutation_class_id', true))::uuid
        ELSE NULL
    END;
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));
        IF public.m5_is_student_in_closing_cohort(OLD.id, NULL, NULL, v_bypass_class_id) THEN
            RAISE EXCEPTION 'CLASS_CLOSE_IN_PROGRESS: Học sinh thuộc đợt học đang đóng khóa dở dang. Không thể sửa họ tên hoặc trạng thái hồ sơ lúc này.' USING ERRCODE = 'P0001';
        END IF;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        IF (OLD.full_name, OLD.status) IS DISTINCT FROM (NEW.full_name, NEW.status) THEN
            PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));
            IF public.m5_is_student_in_closing_cohort(NEW.id, NULL, NULL, v_bypass_class_id) THEN
                RAISE EXCEPTION 'CLASS_CLOSE_IN_PROGRESS: Học sinh thuộc đợt học đang đóng khóa dở dang. Không thể sửa họ tên hoặc trạng thái hồ sơ lúc này.' USING ERRCODE = 'P0001';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_m5_guard_profile_during_close ON public.profiles;
CREATE TRIGGER trg_m5_guard_profile_during_close
    BEFORE UPDATE OR DELETE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.m5_fn_guard_profile_during_close();

-- c) public.lessons
CREATE OR REPLACE FUNCTION public.m5_fn_guard_lesson_during_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_blocked BOOLEAN := false;
    v_cls_id UUID;
BEGIN
    IF COALESCE(current_setting('app.m5_internal_mutation', true), '') = 'true' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;

    IF TG_OP IN ('INSERT', 'DELETE') THEN
        v_blocked := true;
    ELSIF (OLD.course_id, OLD.session_number, OLD.title, OLD.status, OLD.has_quiz, OLD.has_practice)
          IS DISTINCT FROM
          (NEW.course_id, NEW.session_number, NEW.title, NEW.status, NEW.has_quiz, NEW.has_practice)
    THEN
        v_blocked := true;
    END IF;

    IF v_blocked THEN
        -- R18-02: Giữ khóa tuần tự m4_teaching_sync rồi m5_close:<class_id> (UUID tăng dần) TRƯỚC khi đọc m5_course_close_operations
        PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));
        FOR v_cls_id IN (
            SELECT c.id FROM public.classes c
            WHERE c.course_id IN (
                CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.course_id END,
                CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.course_id END
            )
            ORDER BY c.id ASC
        ) LOOP
            PERFORM pg_advisory_xact_lock(hashtext('m5_close:' || v_cls_id::text));
        END LOOP;

        IF EXISTS (
            SELECT 1 FROM public.m5_course_close_operations op
            WHERE op.course_id IN (
                      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.course_id END,
                      CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.course_id END
                  )
              AND op.status IN ('deleting_storage', 'deleting_db', 'incomplete')
        ) THEN
            RAISE EXCEPTION 'CLASS_CLOSE_IN_PROGRESS: Khóa học này đang có lớp trong quá trình đóng khóa dở dang. Không thể thay đổi bài học dùng chung cho đến khi đóng khóa hoàn tất.' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_m5_guard_lesson_during_close ON public.lessons;
CREATE TRIGGER trg_m5_guard_lesson_during_close
    BEFORE INSERT OR UPDATE OR DELETE ON public.lessons
    FOR EACH ROW
    EXECUTE FUNCTION public.m5_fn_guard_lesson_during_close();

-- d) public.classes
CREATE OR REPLACE FUNCTION public.m5_fn_guard_class_during_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_bypass_class_id UUID := CASE
        WHEN COALESCE(current_setting('app.m5_internal_mutation', true), '') = 'true'
         AND NULLIF(btrim(current_setting('app.m5_internal_mutation_class_id', true)), '') IS NOT NULL
        THEN btrim(current_setting('app.m5_internal_mutation_class_id', true))::uuid
        ELSE NULL
    END;
BEGIN
    IF TG_OP = 'DELETE'
       OR (TG_OP = 'UPDATE' AND (OLD.code, OLD.course_id) IS DISTINCT FROM (NEW.code, NEW.course_id))
    THEN
        PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));
        IF EXISTS (
            SELECT 1 FROM public.m5_course_close_operations op
            WHERE op.class_id = CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END
              AND (v_bypass_class_id IS NULL OR op.class_id IS DISTINCT FROM v_bypass_class_id)
              AND op.status IN ('deleting_storage', 'deleting_db', 'incomplete')
        ) THEN
            RAISE EXCEPTION 'CLASS_CLOSE_IN_PROGRESS: Lớp học đang trong quá trình đóng khóa dở dang. Không thể thay đổi mã lớp hoặc khóa học lúc này.' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_m5_guard_class_during_close ON public.classes;
CREATE TRIGGER trg_m5_guard_class_during_close
    BEFORE UPDATE OR DELETE ON public.classes
    FOR EACH ROW
    EXECUTE FUNCTION public.m5_fn_guard_class_during_close();

-- e) public.m5_class_cohort_members
CREATE OR REPLACE FUNCTION public.m5_fn_guard_cohort_during_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_blocked BOOLEAN := false;
    v_bypass_class_id UUID := CASE
        WHEN COALESCE(current_setting('app.m5_internal_mutation', true), '') = 'true'
         AND NULLIF(btrim(current_setting('app.m5_internal_mutation_class_id', true)), '') IS NOT NULL
        THEN btrim(current_setting('app.m5_internal_mutation_class_id', true))::uuid
        ELSE NULL
    END;
BEGIN
    IF TG_OP IN ('INSERT', 'DELETE') THEN
        v_blocked := true;
    ELSIF (OLD.participant_id, OLD.membership_status, COALESCE(OLD.notes_snapshot, ''), OLD.course_id)
          IS DISTINCT FROM
          (NEW.participant_id, NEW.membership_status, COALESCE(NEW.notes_snapshot, ''), NEW.course_id)
    THEN
        v_blocked := true;
    END IF;

    IF v_blocked THEN
        PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));
        IF EXISTS (
            SELECT 1 FROM public.m5_course_close_operations op
            WHERE op.class_id IN (
                      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.class_id END,
                      CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.class_id END
                  )
              AND (v_bypass_class_id IS NULL OR op.class_id IS DISTINCT FROM v_bypass_class_id)
              AND op.course_id IN (
                      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.course_id END,
                      CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.course_id END
                  )
              AND op.status IN ('deleting_storage', 'deleting_db', 'incomplete')
        ) THEN
            RAISE EXCEPTION 'CLASS_CLOSE_IN_PROGRESS: Đợt học đang trong quá trình đóng khóa dở dang. Không thể thay đổi danh sách thành viên đợt học lúc này.' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_m5_guard_cohort_during_close ON public.m5_class_cohort_members;
CREATE TRIGGER trg_m5_guard_cohort_during_close
    BEFORE INSERT OR UPDATE OR DELETE ON public.m5_class_cohort_members
    FOR EACH ROW
    EXECUTE FUNCTION public.m5_fn_guard_cohort_during_close();

-- m4_update_student: giữ khóa m5_close:<class_id> (UUID tăng dần) và chặn khi học sinh thuộc đợt học đóng khóa dở dang
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
    v_lock_class_id UUID;
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

    -- R17-02: Lấy khóa m5_close:<class_id> theo thứ tự UUID tăng dần cho mọi lớp liên quan đến học sinh
    FOR v_lock_class_id IN
        SELECT DISTINCT related.class_id
        FROM (
            SELECT s.current_class_id AS class_id FROM public.students s WHERE s.id = p_student_id
            UNION
            SELECT s.original_class_id FROM public.students s WHERE s.id = p_student_id
            UNION
            SELECT cm.class_id FROM public.m5_class_cohort_members cm WHERE cm.student_id = p_student_id
        ) related
        WHERE related.class_id IS NOT NULL
        ORDER BY related.class_id ASC
    LOOP
        PERFORM pg_advisory_xact_lock(hashtext('m5_close:' || v_lock_class_id::text));
    END LOOP;

    IF NOT EXISTS (
        SELECT 1 FROM public.students s WHERE s.id = p_student_id FOR UPDATE
    ) THEN
        RAISE EXCEPTION 'NOT_FOUND: Không tìm thấy học sinh.';
    END IF;

    IF public.m5_is_student_in_closing_cohort(p_student_id, NULL, NULL) THEN
        RAISE EXCEPTION 'CLASS_CLOSE_IN_PROGRESS: Học sinh thuộc đợt học đang trong quá trình đóng khóa hoặc tác vụ chưa hoàn tất. Không thể cập nhật thông tin học sinh lúc này.' USING ERRCODE = 'P0001';
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

-- m3_reset_student_progress: chặn đặt lại kết quả khi học sinh thuộc đợt học đóng khóa dở dang
CREATE OR REPLACE FUNCTION public.m3_reset_student_progress(
    p_admin_profile_id UUID,
    p_student_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
    v_lock_class_id UUID;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = p_admin_profile_id AND role = 'admin' AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN: Chỉ có Quản trị viên mới được đặt lại kết quả học tập.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));
    PERFORM pg_advisory_xact_lock(hashtext('student:' || p_student_id::text));

    -- R17-02: Lấy khóa m5_close:<class_id> theo thứ tự UUID tăng dần cho mọi lớp liên quan đến học sinh
    FOR v_lock_class_id IN
        SELECT DISTINCT related.class_id
        FROM (
            SELECT s.current_class_id AS class_id FROM public.students s WHERE s.id = p_student_id
            UNION
            SELECT s.original_class_id FROM public.students s WHERE s.id = p_student_id
            UNION
            SELECT cm.class_id FROM public.m5_class_cohort_members cm WHERE cm.student_id = p_student_id
        ) related
        WHERE related.class_id IS NOT NULL
        ORDER BY related.class_id ASC
    LOOP
        PERFORM pg_advisory_xact_lock(hashtext('m5_close:' || v_lock_class_id::text));
    END LOOP;

    IF public.m5_is_student_in_closing_cohort(p_student_id, NULL, NULL) THEN
        RAISE EXCEPTION 'CLASS_CLOSE_IN_PROGRESS: Học sinh thuộc đợt học đang trong quá trình đóng khóa hoặc tác vụ chưa hoàn tất. Không thể đặt lại kết quả học tập lúc này.' USING ERRCODE = 'P0001';
    END IF;

    DELETE FROM public.quiz_results WHERE student_id = p_student_id;
    DELETE FROM public.practice_submissions WHERE student_id = p_student_id;

    RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_reset_student_progress(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m3_reset_student_progress(UUID, UUID) TO service_role;

-- ============================================================================
-- 13. THỨ TỰ KHÓA CHUẨN CHO SỬA LỚP / LƯU TRỮ LỚP / LƯU TRỮ HỌC SINH (R19-01)
-- Trigger trg_m5_guard_class_during_close / trg_m5_guard_student_during_close lấy
-- pg_advisory_xact_lock(hashtext('m4_teaching_sync')) khi chạy UPDATE, trong khi
-- m5_save_csv_verification / m5_begin_course_close / m5_finalize_course_close_db giữ
-- m4_teaching_sync -> m5_close:<class_id> TRƯỚC khi SELECT ... FOR UPDATE lớp.
-- Nếu RPC sửa lớp lấy class:<id> + FOR UPDATE trước thì hai giao dịch chờ khóa lẫn nhau (AB-BA).
-- Mọi RPC dưới đây luôn lấy khóa theo một thứ tự duy nhất:
--   m4_teaching_sync -> m5_close:<class_id> -> class:<class_id> -> student:<student_id>
-- TRƯỚC mọi SELECT ... FOR UPDATE hoặc UPDATE trên public.classes / public.students.
-- ============================================================================

-- 13.1 m3_save_class
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

    -- R19-01: Khóa chung đứng đầu thứ tự khóa, trước mọi class:<id> / m5_close:<id> / FOR UPDATE / UPDATE
    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));

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
        -- R19-01: m4_teaching_sync (đã giữ) -> m5_close:<class_id> -> class:<class_id> -> FOR UPDATE
        PERFORM pg_advisory_xact_lock(hashtext('m5_close:' || v_class_id::text));
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

        -- R19-01: Lớp đang đóng khóa dở dang -> không được đổi mã lớp hoặc khóa học
        IF (v_class.code, v_class.course_id) IS DISTINCT FROM (v_final_code, v_final_course_id)
           AND EXISTS (
               SELECT 1 FROM public.m5_course_close_operations op
               WHERE op.class_id = v_class_id
                 AND op.status IN ('deleting_storage', 'deleting_db', 'incomplete')
           )
        THEN
            RAISE EXCEPTION 'CLASS_CLOSE_IN_PROGRESS: Lớp học đang trong quá trình đóng khóa dở dang. Không thể thay đổi mã lớp hoặc khóa học lúc này.' USING ERRCODE = 'P0001';
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

-- 13.2 m3_set_class_course
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
DECLARE
    v_current_course_id UUID;
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

    -- R19-01: m4_teaching_sync -> m5_close:<class_id> -> class:<class_id> trước mọi UPDATE lớp
    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));
    PERFORM pg_advisory_xact_lock(hashtext('m5_close:' || p_class_id::text));
    PERFORM pg_advisory_xact_lock(hashtext('class:' || p_class_id::text));

    SELECT cl.course_id INTO v_current_course_id
    FROM public.classes cl
    WHERE cl.id = p_class_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Lớp học không tồn tại.';
    END IF;

    IF v_current_course_id IS DISTINCT FROM p_course_id
       AND EXISTS (
           SELECT 1 FROM public.m5_course_close_operations op
           WHERE op.class_id = p_class_id
             AND op.status IN ('deleting_storage', 'deleting_db', 'incomplete')
       )
    THEN
        RAISE EXCEPTION 'CLASS_CLOSE_IN_PROGRESS: Lớp học đang trong quá trình đóng khóa dở dang. Không thể thay đổi mã lớp hoặc khóa học lúc này.' USING ERRCODE = 'P0001';
    END IF;

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

-- 13.3 m2_save_class
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
        SELECT 1 FROM public.profiles p
        WHERE p.id = p_admin_profile_id AND p.role = 'admin' AND p.status = 'active'
    ) THEN
        RAISE EXCEPTION 'Admin profile is not active admin';
    END IF;

    -- R19-01: Khóa chung đứng đầu thứ tự khóa
    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));

    -- 2. Validate code and name
    IF p_code IS NULL OR trim(p_code) = '' OR p_name IS NULL OR trim(p_name) = '' THEN
        RAISE EXCEPTION 'Class code and name cannot be empty';
    END IF;

    -- 3. Validate target teacher if provided
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
        -- R19-01: m4_teaching_sync (đã giữ) -> m5_close:<class_id> -> class:<class_id> -> FOR UPDATE
        PERFORM pg_advisory_xact_lock(hashtext('m5_close:' || v_class_id::text));
        PERFORM pg_advisory_xact_lock(hashtext('class:' || v_class_id::text));

        SELECT c.* INTO v_class
        FROM public.classes c
        WHERE c.id = v_class_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Class not found: %', v_class_id;
        END IF;

        -- Lớp đang đóng khóa dở dang -> không được đổi mã lớp
        IF v_class.code IS DISTINCT FROM trim(p_code)
           AND EXISTS (
               SELECT 1 FROM public.m5_course_close_operations op
               WHERE op.class_id = v_class_id
                 AND op.status IN ('deleting_storage', 'deleting_db', 'incomplete')
           )
        THEN
            RAISE EXCEPTION 'CLASS_CLOSE_IN_PROGRESS: Lớp học đang trong quá trình đóng khóa dở dang. Không thể thay đổi mã lớp hoặc khóa học lúc này.' USING ERRCODE = 'P0001';
        END IF;

        -- Check code uniqueness if changed
        IF lower(v_class.code) <> lower(trim(p_code)) THEN
            PERFORM pg_advisory_xact_lock(hashtext('class_code:' || lower(trim(p_code))));
            IF EXISTS (SELECT 1 FROM public.classes c WHERE lower(c.code) = lower(trim(p_code)) AND c.id <> v_class_id) THEN
                RAISE EXCEPTION 'Class code already exists: %', trim(p_code);
            END IF;
        END IF;

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

-- 13.4 m2_archive_class
CREATE OR REPLACE FUNCTION public.m2_archive_class(p_class_id UUID)
RETURNS TABLE (auth_user_id UUID, new_session_version INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
    v_rowcount INT;
BEGIN
    -- R19-01: m4_teaching_sync -> m5_close:<class_id> -> class:<class_id>
    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));
    PERFORM pg_advisory_xact_lock(hashtext('m5_close:' || p_class_id::text));
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

-- 13.5 m2_restore_class
CREATE OR REPLACE FUNCTION public.m2_restore_class(p_class_id UUID)
RETURNS TABLE (auth_user_id UUID, new_session_version INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
    v_rowcount INT;
BEGIN
    -- R19-01: m4_teaching_sync -> m5_close:<class_id> -> class:<class_id>
    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));
    PERFORM pg_advisory_xact_lock(hashtext('m5_close:' || p_class_id::text));
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

-- 13.6 m2_archive_student
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
    -- R19-01: m4_teaching_sync -> m5_close:<class_id> -> class:<class_id> -> student:<student_id>
    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));

    SELECT s.current_class_id INTO v_class_id
    FROM public.students s
    JOIN public.profiles p ON p.id = s.id
    WHERE s.id = p_student_id AND p.role = 'student';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Student not found or target is not a student';
    END IF;

    IF v_class_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('m5_close:' || v_class_id::text));
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

-- 13.7 m2_restore_student
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
    -- R19-01: m4_teaching_sync -> m5_close:<class_id> -> class:<class_id> -> student:<student_id>
    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));

    SELECT s.current_class_id INTO v_class_id
    FROM public.students s
    JOIN public.profiles p ON p.id = s.id
    WHERE s.id = p_student_id AND p.role = 'student';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Student not found or target is not a student';
    END IF;

    IF v_class_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('m5_close:' || v_class_id::text));
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

-- ============================================================================
-- 14. CHỐT TRẠNG THÁI ĐẶT LẠI BỘ MẪU TRƯỚC KHI XÓA TỆP STORAGE (R20-01)
-- Edge Function m5-seed-fixture phải gọi m5_prepare_seed_course_close_fixture TRƯỚC khi gom/xóa tệp Storage.
-- Hàm này giữ khóa tuần tự chuẩn, kiểm tra 3 chiều NON_FIXTURE_DATA_ATTACHED, rồi chốt bản ghi
-- m5_course_close_operations (status = 'deleting_storage') trên lớp mẫu để mọi thao tác đồng thời
-- (chuyển lớp, giữ chỗ tải tệp, nộp bài, làm quiz, sửa học sinh/lớp) bị chặn trong suốt lúc xóa tệp.
-- ============================================================================

-- R21-01: Mỗi lượt đặt lại bộ mẫu nhận operation_id + execution_run_id riêng để chống lượt cũ gỡ khóa của lượt mới.
DROP FUNCTION IF EXISTS public.m5_prepare_seed_course_close_fixture(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.m5_prepare_seed_course_close_fixture(
    p_actor_id UUID DEFAULT NULL,
    p_test_project_ref TEXT DEFAULT NULL
)
RETURNS TABLE (
    operation_id UUID,
    execution_run_id UUID,
    target_storage_paths JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, storage, extensions
AS $$
#variable_conflict use_column
DECLARE
    v_cls_id UUID := '00000000-0000-0000-0000-000000050001'::uuid;
    v_crs_id UUID := '00000000-0000-0000-0000-000000050014'::uuid;
    v_next_crs_id UUID := '00000000-0000-0000-0000-000000050015'::uuid;
    v_stu1_id UUID := '00000000-0000-0000-0000-000000050101'::uuid;
    v_stu2_id UUID := '00000000-0000-0000-0000-000000050102'::uuid;
    v_stu3_id UUID := '00000000-0000-0000-0000-000000050103'::uuid;
    v_stu4_id UUID := '00000000-0000-0000-0000-000000050104'::uuid;
    v_stu5_id UUID := '00000000-0000-0000-0000-000000050105'::uuid;
    v_env_setting TEXT;
    v_paths JSONB := '[]'::jsonb;
    v_op_id UUID;
    v_run_id UUID := gen_random_uuid();
    v_prev_deleted_paths JSONB := '[]'::jsonb;
    v_remaining_paths JSONB := '[]'::jsonb;
BEGIN
    -- R3-01: Khóa gọi trực tiếp, yêu cầu service_role
    IF COALESCE(auth.role(), '') IS DISTINCT FROM 'service_role' AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
        RAISE EXCEPTION 'DIRECT_RPC_FORBIDDEN: Must be invoked via m2-backend server workflow' USING ERRCODE = '42501';
    END IF;

    -- R3-01 / M5-03: Xác minh Admin actor trong profiles
    IF p_actor_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = p_actor_id AND p.role = 'admin' AND p.status = 'active'
    ) THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Verified admin actor required' USING ERRCODE = '42501';
    END IF;

    -- Chặn thao tác ngoài môi trường TEST được duyệt (Fail-Closed), giống đầu m5_seed_course_close_fixture
    v_env_setting := COALESCE(NULLIF(btrim(current_setting('app.environment', true)), ''), 'unknown');
    IF p_test_project_ref IS NULL OR p_test_project_ref IS DISTINCT FROM 'eythjapspkoyqdxlxtcd' THEN
        RAISE EXCEPTION 'TEST_ONLY_OPERATION_FORBIDDEN: Thao tác chỉ cho phép trên dự án thử nghiệm eythjapspkoyqdxlxtcd.' USING ERRCODE = '42501';
    END IF;

    IF v_env_setting IN ('production', 'prod')
       OR EXISTS (
         SELECT 1 FROM public.m5_storage_quota_config c
         WHERE c.id = 'default'
           AND (c.environment_mode = 'production' OR c.approved_test_project_ref IS DISTINCT FROM 'eythjapspkoyqdxlxtcd')
       )
       OR NOT EXISTS (
         SELECT 1 FROM public.m5_storage_quota_config c
         WHERE c.id = 'default'
           AND (c.environment_mode = 'test' OR c.environment_mode = 'unverified')
           AND c.approved_test_project_ref = 'eythjapspkoyqdxlxtcd'
       )
    THEN
        RAISE EXCEPTION 'SEED_FIXTURE_DISABLED_IN_PROD: Thao tác nạp dữ liệu mẫu bị chặn hoàn toàn trên môi trường Production.' USING ERRCODE = 'P0001';
    END IF;

    -- R20-01: Khóa tuần tự chuẩn trước mọi SELECT/INSERT/UPDATE
    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));
    PERFORM pg_advisory_xact_lock(hashtext('m5_storage_quota'));
    PERFORM pg_advisory_xact_lock(hashtext('m5_close:' || v_cls_id::text));

    -- R20-01: Kiểm tra 3 chiều NON_FIXTURE_DATA_ATTACHED (giống hệt m5_seed_course_close_fixture)
    IF EXISTS (
        SELECT 1 FROM public.students s
        WHERE s.id NOT IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id)
          AND (s.current_class_id = v_cls_id OR s.original_class_id = v_cls_id)
    ) OR EXISTS (
        SELECT 1 FROM public.m5_class_cohort_members cm
        WHERE (cm.class_id = v_cls_id OR cm.course_id IN (v_crs_id, v_next_crs_id))
          AND cm.student_id NOT IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id)
    ) OR EXISTS (
        SELECT 1 FROM public.m3_upload_reservations r
        WHERE r.class_id = v_cls_id
          AND r.student_id NOT IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id)
    ) OR EXISTS (
        SELECT 1 FROM public.practice_submissions ps
        WHERE ps.class_id = v_cls_id
          AND ps.student_id NOT IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id)
    ) OR EXISTS (
        SELECT 1 FROM public.quiz_results qr
        WHERE qr.class_id = v_cls_id
          AND qr.student_id NOT IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id)
    ) OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id <> v_cls_id
          AND c.course_id IN (v_crs_id, v_next_crs_id)
    ) OR EXISTS (
        -- Chiều 3: học sinh mẫu Mốc 5 đang gắn với lớp khác ngoài lớp mẫu
        SELECT 1 FROM public.students s
        WHERE s.id IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id)
          AND ((s.current_class_id IS NOT NULL AND s.current_class_id IS DISTINCT FROM v_cls_id)
               OR (s.original_class_id IS NOT NULL AND s.original_class_id IS DISTINCT FROM v_cls_id))
    ) OR EXISTS (
        SELECT 1 FROM public.m5_class_cohort_members cm
        WHERE cm.student_id IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id)
          AND cm.class_id IS NOT NULL AND cm.class_id IS DISTINCT FROM v_cls_id
    ) OR EXISTS (
        SELECT 1 FROM public.m3_upload_reservations r
        WHERE r.student_id IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id)
          AND r.class_id IS NOT NULL AND r.class_id IS DISTINCT FROM v_cls_id
    ) OR EXISTS (
        SELECT 1 FROM public.practice_submissions ps
        WHERE ps.student_id IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id)
          AND ps.class_id IS NOT NULL AND ps.class_id IS DISTINCT FROM v_cls_id
    ) OR EXISTS (
        SELECT 1 FROM public.quiz_results qr
        WHERE qr.student_id IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id)
          AND qr.class_id IS NOT NULL AND qr.class_id IS DISTINCT FROM v_cls_id
    ) THEN
        RAISE EXCEPTION 'NON_FIXTURE_DATA_ATTACHED: Lớp hoặc khóa mẫu Mốc 5 đang có học sinh hoặc lớp học ngoài bộ mẫu Mốc 5 tham chiếu. Vui lòng chuyển học sinh/lớp đó ra ngoài trước khi đặt lại bộ mẫu.' USING ERRCODE = 'P0001';
    END IF;

    -- R20-01: Học sinh mẫu đang thuộc tác vụ đóng khóa dở dang của lớp khác thì không được đặt lại bộ mẫu
    IF EXISTS (
        SELECT 1 FROM public.students s
        WHERE s.id IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id)
          AND public.m5_is_student_in_closing_cohort(s.id, NULL, NULL, v_cls_id)
    ) THEN
        RAISE EXCEPTION 'CLASS_CLOSE_IN_PROGRESS: Học sinh mẫu Mốc 5 đang thuộc đợt học khác đóng khóa dở dang. Không thể đặt lại bộ mẫu lúc này.' USING ERRCODE = 'P0001';
    END IF;

    -- R20b-01: Chặn hai tiến trình (m5-seed-fixture / m5-execute-course-close) chạy đè nhau trên cùng lớp mẫu
    -- khi đã có tác vụ đang xóa Storage/DB còn hạn lease.
    IF EXISTS (
        SELECT 1 FROM public.m5_course_close_operations o
        WHERE o.class_id = v_cls_id
          AND o.status IN ('deleting_storage', 'deleting_db')
          AND o.lease_expires_at IS NOT NULL
          AND o.lease_expires_at > clock_timestamp()
    ) THEN
        RAISE EXCEPTION 'CLASS_CLOSE_IN_PROGRESS: Lớp mẫu Mốc 5 đang có tác vụ đóng khóa hoặc đặt lại bộ mẫu đang chạy.' USING ERRCODE = 'P0001';
    END IF;

    -- R20-01: Chốt trạng thái đang đặt lại bộ mẫu trong DB TRƯỚC khi trả danh sách tệp cho Edge Function xóa Storage.
    -- Bật quyền bỏ qua trigger bảo vệ chỉ trong phạm vi đúng lớp mẫu Mốc 5 (R18-01).
    PERFORM set_config('app.m5_internal_mutation', 'true', true);
    PERFORM set_config('app.m5_internal_mutation_class_id', v_cls_id::text, true);

    INSERT INTO public.courses (id, title, description, total_sessions, is_fixture)
    VALUES (v_crs_id, 'Khóa Robotics K14 M5 (14 Buổi Chuẩn)', 'Khóa học 14 buổi đã giảng dạy hoàn tất để thử nghiệm đóng khóa Mốc 5.', 14, true)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.classes (id, code, name, course_id, status, is_fixture, is_14_sessions_confirmed)
    VALUES (v_cls_id, 'ROB-K14-M5-01', 'Lớp Robotics Mốc 5 (Đủ 14 Buổi - Sẵn sàng đóng khóa)', v_crs_id, 'active', true, true)
    ON CONFLICT DO NOTHING;

    -- Mọi học sinh mẫu đang tồn tại đều phải có dòng cohort gắn với (lớp mẫu, khóa mẫu)
    INSERT INTO public.m5_class_cohort_members (
        class_id, course_id, student_id, participant_id, membership_status, notes_snapshot, is_m5_fixture
    )
    SELECT
        v_cls_id,
        v_crs_id,
        s.id,
        COALESCE(NULLIF(btrim(s.participant_id), ''), 'PART_' || substr(s.id::text, 1, 8)),
        CASE WHEN s.status IN ('archived', 'transferred') THEN s.status::text ELSE 'active'::text END,
        s.notes,
        true
    FROM public.students s
    WHERE s.id IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id)
    ON CONFLICT (class_id, course_id, student_id) DO NOTHING;

    -- R20b-01: Xóa các tác vụ xem trước/đã xác minh CSV cũ của lớp mẫu trước khi lấy khóa dòng tác vụ dở dang
    DELETE FROM public.m5_course_close_operations
    WHERE class_id = v_cls_id
      AND status IN ('previewed', 'csv_verified');

    -- R20-01: Chỉ gom tệp thuộc lớp mẫu (class_id IS NULL hoặc = lớp mẫu); tuyệt đối không lấy tệp của lớp khác
    -- R21-01: Gom danh sách tệp TRƯỚC khi cập nhật/chèn bản ghi khóa để lưu luôn target/remaining_storage_paths
    -- vào bản ghi khóa của đúng lượt chạy (execution_run_id).
    SELECT COALESCE(jsonb_agg(DISTINCT fp.path), '[]'::jsonb) INTO v_paths
    FROM (
        SELECT ps.content AS path
        FROM public.practice_submissions ps
        WHERE ps.student_id IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id)
          AND (ps.class_id = v_cls_id OR ps.class_id IS NULL)
          AND ps.type = 'file' AND ps.content IS NOT NULL AND btrim(ps.content) <> ''
        UNION
        SELECT r.object_path AS path
        FROM public.m3_upload_reservations r
        WHERE r.student_id IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id)
          AND (r.class_id = v_cls_id OR r.class_id IS NULL)
          AND r.object_path IS NOT NULL AND btrim(r.object_path) <> ''
        UNION
        SELECT p.path
        FROM public.m5_course_close_operations o,
             LATERAL jsonb_array_elements_text(
                 COALESCE(o.target_storage_paths, '[]'::jsonb)
                 || COALESCE(o.remaining_storage_paths, '[]'::jsonb)
                 || COALESCE(o.deleted_storage_paths, '[]'::jsonb)
             ) AS p(path)
        WHERE (o.class_id = v_cls_id OR o.course_id IN (v_crs_id, v_next_crs_id))
          AND p.path IS NOT NULL AND btrim(p.path) <> ''
    ) fp;

    SELECT o.id, COALESCE(o.deleted_storage_paths, '[]'::jsonb)
    INTO v_op_id, v_prev_deleted_paths
    FROM public.m5_course_close_operations o
    WHERE o.class_id = v_cls_id
      AND o.status IN ('incomplete', 'deleting_storage', 'deleting_db')
    ORDER BY o.created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_op_id IS NOT NULL THEN
        -- R22-02: Giữ nguyên phạm vi và tiến độ đã xóa; chỉ còn lại các tệp chưa nằm trong deleted_storage_paths
        SELECT COALESCE(jsonb_agg(DISTINCT p.path), '[]'::jsonb) INTO v_remaining_paths
        FROM jsonb_array_elements_text(v_paths) AS p(path)
        WHERE NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(v_prev_deleted_paths, '[]'::jsonb)) AS d(path)
            WHERE d.path = p.path
        );

        UPDATE public.m5_course_close_operations
        SET status = 'deleting_storage',
            execution_run_id = v_run_id,
            target_storage_paths = v_paths,
            deleted_storage_paths = COALESCE(v_prev_deleted_paths, '[]'::jsonb),
            remaining_storage_paths = v_remaining_paths,
            last_error_code = 'SEED_FIXTURE_LOCK_TAKEOVER',
            last_error_message = 'SEED_FIXTURE_LOCK_PREV_INCOMPLETE',
            lease_expires_at = clock_timestamp() + interval '60 seconds',
            updated_at = now()
        WHERE id = v_op_id;
    ELSE
        INSERT INTO public.m5_course_close_operations (
            class_id, course_id, status, is_14_sessions_confirmed,
            target_storage_paths, deleted_storage_paths, remaining_storage_paths,
            execution_run_id, last_error_code, created_by, lease_expires_at, updated_at
        )
        VALUES (
            v_cls_id, v_crs_id, 'deleting_storage', true,
            v_paths, '[]'::jsonb, v_paths,
            v_run_id, 'SEED_FIXTURE_LOCK', p_actor_id, clock_timestamp() + interval '60 seconds', now()
        )
        RETURNING id INTO v_op_id;
    END IF;

    PERFORM set_config('app.m5_internal_mutation', 'false', true);
    PERFORM set_config('app.m5_internal_mutation_class_id', '', true);

    RETURN QUERY SELECT v_op_id, v_run_id, v_paths;
END;
$$;
REVOKE ALL ON FUNCTION public.m5_prepare_seed_course_close_fixture(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m5_prepare_seed_course_close_fixture(UUID, TEXT) TO service_role;

-- Gỡ khóa tạm / giữ trạng thái bảo vệ khi bước xóa Storage lỗi hoặc phát hiện xung đột
-- R21-01: Chỉ thao tác trên bản ghi khóa đúng execution_run_id của lượt gọi; lượt cũ không được gỡ khóa của lượt mới.
-- R21-02: Nếu đã bắt đầu xóa tệp Storage thì KHÔNG xóa bản ghi khóa mà chuyển sang 'incomplete' kèm tiến độ xóa.
DROP FUNCTION IF EXISTS public.m5_release_seed_course_close_fixture_lock(UUID);
DROP FUNCTION IF EXISTS public.m5_release_seed_course_close_fixture_lock(UUID, UUID, BOOLEAN, JSONB, JSONB, TEXT);
CREATE OR REPLACE FUNCTION public.m5_release_seed_course_close_fixture_lock(
    p_actor_id UUID DEFAULT NULL,
    p_execution_run_id UUID DEFAULT NULL,
    p_storage_started BOOLEAN DEFAULT false,
    p_deleted_paths JSONB DEFAULT '[]'::jsonb,
    p_remaining_paths JSONB DEFAULT '[]'::jsonb,
    p_error_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_cls_id UUID := '00000000-0000-0000-0000-000000050001'::uuid;
    v_rowcount INT := 0;
    v_step_rows INT := 0;
BEGIN
    IF COALESCE(auth.role(), '') IS DISTINCT FROM 'service_role' AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
        RAISE EXCEPTION 'DIRECT_RPC_FORBIDDEN: Must be invoked via m2-backend server workflow' USING ERRCODE = '42501';
    END IF;

    IF p_actor_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = p_actor_id AND p.role = 'admin' AND p.status = 'active'
    ) THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Verified admin actor required' USING ERRCODE = '42501';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));
    PERFORM pg_advisory_xact_lock(hashtext('m5_storage_quota'));
    PERFORM pg_advisory_xact_lock(hashtext('m5_close:' || v_cls_id::text));

    -- R21-01 / R22-01: Lượt mới hơn đã tiếp quản hoặc đã hoàn tất và xóa bản ghi khóa -> lượt cũ không sửa và không xóa bất kỳ dòng nào
    IF p_execution_run_id IS NOT NULL AND (
        NOT EXISTS (
            SELECT 1 FROM public.m5_course_close_operations o
            WHERE o.class_id = v_cls_id
              AND o.status <> 'completed'
              AND o.execution_run_id = p_execution_run_id
        ) OR EXISTS (
            SELECT 1 FROM public.m5_course_close_operations o
            WHERE o.class_id = v_cls_id
              AND o.status <> 'completed'
              AND o.execution_run_id IS DISTINCT FROM p_execution_run_id
        )
    ) THEN
        RETURN FALSE;
    END IF;

    -- R20b-01: Bật tạm quyền bỏ qua trigger bảo vệ chỉ trong phạm vi đúng lớp mẫu
    PERFORM set_config('app.m5_internal_mutation', 'true', true);
    PERFORM set_config('app.m5_internal_mutation_class_id', v_cls_id::text, true);

    IF COALESCE(p_storage_started, false) = true THEN
        -- R21-02: Đã bắt đầu xóa tệp Storage -> giữ bản ghi bảo vệ, chuyển sang incomplete kèm tiến độ xóa
        UPDATE public.m5_course_close_operations
        SET status = 'incomplete',
            deleted_storage_paths = COALESCE(p_deleted_paths, deleted_storage_paths),
            remaining_storage_paths = COALESCE(p_remaining_paths, remaining_storage_paths),
            lease_expires_at = NULL,
            last_error_code = 'STORAGE_CLEANUP_FAILED',
            last_error_message = COALESCE(NULLIF(btrim(p_error_message), ''), 'Tác vụ đặt lại bộ mẫu bị gián đoạn sau khi đã bắt đầu xóa tệp Storage.'),
            updated_at = now()
        WHERE class_id = v_cls_id
          AND (p_execution_run_id IS NULL OR execution_run_id = p_execution_run_id)
          AND status <> 'completed';
        GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    ELSE
        -- Chưa xóa tệp Storage nào: khôi phục dòng tiếp quản về incomplete (R22-02), giữ nguyên phạm vi và tiến độ
        UPDATE public.m5_course_close_operations
        SET status = 'incomplete',
            lease_expires_at = NULL,
            last_error_code = 'STORAGE_CLEANUP_FAILED',
            last_error_message = 'Tác vụ đặt lại bộ mẫu bị gián đoạn trước khi hoàn tất.',
            updated_at = now()
        WHERE class_id = v_cls_id
          AND (p_execution_run_id IS NULL OR execution_run_id = p_execution_run_id)
          AND (last_error_message = 'SEED_FIXTURE_LOCK_PREV_INCOMPLETE' OR last_error_code = 'SEED_FIXTURE_LOCK_TAKEOVER');
        GET DIAGNOSTICS v_step_rows = ROW_COUNT;
        v_rowcount := v_rowcount + v_step_rows;

        -- Chỉ xóa dòng khóa tạm mới tạo khi không có dòng tiếp quản nào được khôi phục (chỉ khi khớp execution_run_id)
        IF v_step_rows = 0 THEN
            DELETE FROM public.m5_course_close_operations
            WHERE class_id = v_cls_id
              AND (p_execution_run_id IS NULL OR execution_run_id = p_execution_run_id)
              AND last_error_code = 'SEED_FIXTURE_LOCK'
              AND COALESCE(last_error_message, '') <> 'SEED_FIXTURE_LOCK_PREV_INCOMPLETE';
            GET DIAGNOSTICS v_step_rows = ROW_COUNT;
            v_rowcount := v_rowcount + v_step_rows;
        END IF;
    END IF;

    PERFORM set_config('app.m5_internal_mutation', 'false', true);
    PERFORM set_config('app.m5_internal_mutation_class_id', '', true);

    RETURN v_rowcount > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.m5_release_seed_course_close_fixture_lock(UUID, UUID, BOOLEAN, JSONB, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m5_release_seed_course_close_fixture_lock(UUID, UUID, BOOLEAN, JSONB, JSONB, TEXT) TO service_role;