-- ============================================================================
-- Migration: 20261014173008_m2_fixture_pin_state_fix.sql
-- MindX Learn M2 — Fixture Student PIN State Truth Alignment
--
-- Context:
-- In migration 20261014111216, synthetic seed fixtures for students
-- (HS_ROB_001, HS_ROB_003, HS_ROB_004) were seeded with hardcoded
-- pin_issued_at timestamps without corresponding private.actor_auth records.
--
-- Safety Guarantees:
-- 1. Resets ONLY public.students.pin_issued_at to NULL.
-- 2. Scoped exclusively to the 4 canonical fixture UUIDs:
--    '33333333-3333-4333-8333-333333333301'
--    '33333333-3333-4333-8333-333333333302'
--    '33333333-3333-4333-8333-333333333303'
--    '33333333-3333-4333-8333-333333333304'
-- 3. Strict schema guards:
--    - s.is_fixture = true
--    - s.student_code IN ('HS_ROB_001', 'HS_ROB_002', 'HS_ROB_003', 'HS_ROB_004')
--    - s.participant_id IN ('PART_ROB01_001', 'PART_ROB01_002', 'PART_ROB01_003', 'PART_ROB01_004')
--    - s.current_class_id IN ('11111111-1111-4111-8111-111111111101', '11111111-1111-4111-8111-111111111102')
--    - s.original_class_id = '11111111-1111-4111-8111-111111111101'
-- 4. CRITICAL GUARD:
--    AND NOT EXISTS (
--        SELECT 1
--        FROM private.actor_auth a
--        WHERE a.profile_id = s.id
--    )
--    Preserves any student where PIN was actually issued and actor_auth mapping exists
--    (e.g., HS_ROB_002 if issued in live testing).
-- 5. No deletion of accounts, passwords, PII, profiles, or actor_auth.
-- 6. No modification of non-fixture or real participant data.
-- 7. Fully idempotent and executed inside an atomic transaction.
-- ============================================================================

BEGIN;

UPDATE public.students s
SET pin_issued_at = NULL,
    updated_at = now()
WHERE s.id IN (
    '33333333-3333-4333-8333-333333333301'::uuid,
    '33333333-3333-4333-8333-333333333302'::uuid,
    '33333333-3333-4333-8333-333333333303'::uuid,
    '33333333-3333-4333-8333-333333333304'::uuid
)
  AND s.is_fixture = true
  AND s.student_code IN ('HS_ROB_001', 'HS_ROB_002', 'HS_ROB_003', 'HS_ROB_004')
  AND s.participant_id IN ('PART_ROB01_001', 'PART_ROB01_002', 'PART_ROB01_003', 'PART_ROB01_004')
  AND s.current_class_id IN (
    '11111111-1111-4111-8111-111111111101'::uuid,
    '11111111-1111-4111-8111-111111111102'::uuid
  )
  AND s.original_class_id = '11111111-1111-4111-8111-111111111101'::uuid
  AND s.pin_issued_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM private.actor_auth a
    WHERE a.profile_id = s.id
  );

COMMIT;
