import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import net from 'node:net';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { sanitizeBootstrapDto } from '../src/lib/server/crypto.mjs';
import * as domain from '../supabase/functions/m2-backend/domain.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATION_PATH = path.resolve(__dirname, '../supabase/migrations/20261114090000_m6_pti_course_session2_quiz.sql');
const ATOMIC_RPC_MIGRATION_PATH = path.resolve(__dirname, '../supabase/migrations/20261114093000_m6_submit_quiz_atomic_review.sql');
const PRACTICE_MIGRATION_PATH = path.resolve(__dirname, '../supabase/migrations/20261114103000_m6_pti_session2_practice.sql');
const INDEX_PATH = path.resolve(__dirname, '../supabase/functions/m2-backend/index.ts');
const ADMIN_EDIT_PATH = path.resolve(__dirname, '../src/app/admin/lessons/[lessonId]/edit/page.tsx');
const STUDENT_LESSON_PATH = path.resolve(__dirname, '../src/app/student/lessons/[lessonId]/page.tsx');

const savedDeno = globalThis.Deno;
const savedMockEdgeAdminClient = globalThis.__mockEdgeAdminClient;

afterEach(() => {
  if (savedDeno === undefined) delete globalThis.Deno;
  else globalThis.Deno = savedDeno;

  if (savedMockEdgeAdminClient === undefined) delete globalThis.__mockEdgeAdminClient;
  else globalThis.__mockEdgeAdminClient = savedMockEdgeAdminClient;
});

async function loadEdgeHandler(mockAdminClient) {
  const indexSource = await fsp.readFile(INDEX_PATH, 'utf-8');
  const transpiled = ts.transpileModule(indexSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });

  let jsCode = transpiled.outputText;
  globalThis.__mockEdgeAdminClient = mockAdminClient;
  jsCode = jsCode.replace(
    /import\s*\{\s*createClient[^\}]*\}\s*from\s*['"]https:\/\/[^'"]+['"];/,
    `const createClient = () => globalThis.__mockEdgeAdminClient;`
  );

  const domainUrl = new URL('../supabase/functions/m2-backend/domain.ts', import.meta.url).href;
  jsCode = jsCode.replace(/from\s*['"]\.\/domain\.ts['"];/, `from '${domainUrl}';`);

  const envMap = {
    SUPABASE_URL: 'https://eythjapspkoyqdxlxtcd.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    SUPABASE_ANON_KEY: 'test-anon-key',
  };

  globalThis.Deno = {
    env: { get: (key) => envMap[key] || '' },
    serve: () => {},
  };

  jsCode += `\n// test-nonce: ${Date.now()}_${Math.random()}\n`;
  const dataUri = 'data:text/javascript;base64,' + Buffer.from(jsCode, 'utf-8').toString('base64');
  const mod = await import(dataUri);
  return mod.handleRequest;
}

function createMockJwt(claims = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: '99999999-9999-4999-8999-000000000001',
      session_id: '88888888-8888-4888-8888-000000000001',
      app_metadata: { role: 'student', m2_session_version: 1 },
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...claims,
    })
  ).toString('base64url');
  return `${header}.${payload}.mock_sig`;
}

describe('PTI Course & Session 2 Quiz (Python OOP & PyQt6)', () => {
  test('1. Migration creates PTI 14-session course, draft Session 2, and 20 valid questions with code blocks & explanations', async () => {
    const sql = await fsp.readFile(MIGRATION_PATH, 'utf8');

    assert.ok(sql.includes("ALTER TABLE public.quiz_questions\n  ADD COLUMN IF NOT EXISTS explanation TEXT NOT NULL DEFAULT '';"));
    assert.ok(sql.includes("pg_advisory_xact_lock(hashtext('m4_teaching_sync'))"), 'Updated m3_update_lesson must retain R18-02 m4_teaching_sync lock');
    assert.ok(sql.includes("pg_advisory_xact_lock(hashtext('m5_close:' || v_cls_id::text))"), 'Updated m3_update_lesson must retain R18-02 class close lock');
    assert.ok(sql.includes('CLASS_CLOSE_IN_PROGRESS'), 'Updated m3_update_lesson must check CLASS_CLOSE_IN_PROGRESS');

    assert.ok(sql.includes("'44444444-4444-4444-8444-444444444423'"));
    assert.ok(sql.includes('FOR v_s IN 1..14 LOOP'), 'PTI course must initialize exactly 14 session slots');
    assert.ok(sql.includes("'55555555-5555-4555-8555-555555555602'"));
    assert.ok(sql.includes("status = 'draft'"), 'Session 2 of PTI must stay in draft state as requested by Owner');

    // Verify all 20 question UUIDs exist in order_index 0..19
    for (let i = 1; i <= 20; i++) {
      const qUuid = `66666666-6666-4666-8666-6666666667${String(i).padStart(2, '0')}`;
      assert.ok(sql.includes(qUuid), `Missing question ${i} UUID ${qUuid}`);
      assert.ok(sql.includes(`$P${i}$`), `Missing prompt block $P${i}$`);
      assert.ok(sql.includes(`$E${i}$`), `Missing explanation block $E${i}$`);
    }

    // Verify Python code blocks for Q2, Q3, Q4, Q11 keep fenced python block & indentation
    const pythonFences = sql.match(/```python\r?\n[\s\S]*?def __init__/g) || [];
    assert.equal(pythonFences.length, 4, 'Questions 2, 3, 4, and 11 must contain indented ```python code blocks');
    assert.ok(sql.includes('    def __init__(self, a="Hello World"):'));
    assert.ok(sql.includes('    def __init__(self, name="An", age=15):'));

    // Verify Question 17 is unambiguous & admin placeholder does not leak answer cue
    assert.equal(sql.includes('màn hình hiển thị kết quả'), false);
    const adminEditSrc = await fsp.readFile(ADMIN_EDIT_PATH, 'utf8');
    assert.equal(adminEditSrc.includes('Lựa chọn A (Đáp án đúng)'), false);
  });

  test('1b. Atomic quiz submit migration preserves M5 lock order, checks questionIds snapshot & completeness, and returns answer_review JSONB', async () => {
    const sql = await fsp.readFile(ATOMIC_RPC_MIGRATION_PATH, 'utf8');

    assert.ok(sql.includes('DROP FUNCTION IF EXISTS public.m3_submit_quiz_attempt(UUID, UUID, INT[]);'));
    assert.ok(sql.includes('DROP FUNCTION IF EXISTS public.m3_submit_quiz_attempt(UUID, UUID, INT[], TEXT[]);'));
    assert.ok(sql.includes('p_expected_question_ids TEXT[] DEFAULT NULL'));
    assert.ok(sql.includes('QUIZ_CHANGED_MID_ATTEMPT'));
    assert.ok(sql.includes('answer_review JSONB'));
    assert.ok(sql.includes("pg_advisory_xact_lock(hashtext('m4_teaching_sync'))"));
    assert.ok(sql.includes("pg_advisory_xact_lock(hashtext('student:' || p_student_profile_id::text))"));
    assert.ok(sql.includes("pg_advisory_xact_lock(hashtext('m5_close:' || v_class_id::text))"));
    assert.ok(sql.includes('FROM public.classes c WHERE c.id = v_class_id FOR KEY SHARE'));
    assert.ok(sql.includes('CLASS_CLOSE_IN_PROGRESS'));
    assert.ok(sql.includes('INCOMPLETE_QUIZ_ANSWERS'));
    assert.ok(sql.includes('jsonb_array_length(v_rec.options)'));
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.m3_submit_quiz_attempt(UUID, UUID, INT[], TEXT[]) FROM PUBLIC, anon, authenticated;'));
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.m3_submit_quiz_attempt(UUID, UUID, INT[], TEXT[]) TO service_role;'));
    assert.ok(sql.includes("WHERE id = '66666666-6666-4666-8666-666666666717'"));
    assert.equal(sql.includes('màn hình hiển thị kết quả'), false);

    // Verify lock acquisition ordering
    const idxGlobal = sql.indexOf("hashtext('m4_teaching_sync')");
    const idxStudent = sql.indexOf("hashtext('student:' || p_student_profile_id::text)");
    const idxClose = sql.indexOf("hashtext('m5_close:' || v_class_id::text)");
    const idxKeyShare = sql.indexOf('FOR KEY SHARE', idxClose);
    assert.ok(idxGlobal > 0 && idxStudent > idxGlobal && idxClose > idxStudent && idxKeyShare > idxClose);
  });

  test('1c. Practice migration adds Click Counter lab (Qt Designer + PyQt6) to PTI Session 2 while keeping draft status & 20 quiz questions', async () => {
    const sql = await fsp.readFile(PRACTICE_MIGRATION_PATH, 'utf8');

    assert.ok(sql.includes("WHERE id = '55555555-5555-4555-8555-555555555602';"));
    assert.ok(sql.includes("status = 'draft'"), 'PTI Session 2 must remain in draft status');
    assert.ok(sql.includes('has_quiz = true'));
    assert.ok(sql.includes('has_practice = true'));
    assert.ok(sql.includes("practice_mode = 'file_allowed'"));

    assert.ok(sql.includes('# BÀI THỰC HÀNH 1: ỨNG DỤNG BỘ ĐẾM SỐ (CLICK COUNTER)'));
    assert.ok(sql.includes('| Thành phần (Widget) | Tên đối tượng (objectName) | Văn bản hiển thị (text) | Thuộc tính bổ sung |'));
    assert.ok(sql.includes('`txt_display`'));
    assert.ok(sql.includes('`btn_inc`'));
    assert.ok(sql.includes('`btn_dec`'));
    assert.ok(sql.includes('`btn_reset`'));
    assert.ok(sql.includes('`counter.ui`'));
    assert.ok(sql.includes('`main_bai1.py`'));
    assert.ok(sql.includes('uic.loadUi("counter.ui", self)'));
    assert.ok(sql.includes('self.btn_inc.clicked.connect(self.increase_count)'));
    assert.ok(sql.includes('PTI_SESSION_2_QUIZ_COUNT_MISMATCH'));
    assert.ok(sql.includes("VALUES ('20261114103000', 'm6_pti_session2_practice')"));
  });

  test('2. sanitizeBootstrapDto strips correctOptionIndex and explanation for students while preserving for staff', () => {
    const sampleLesson = {
      id: '55555555-5555-4555-8555-555555555602',
      sessionNumber: 2,
      status: 'published',
      questions: [
        {
          id: 'q1',
          prompt: '_____ là đại diện cho thực thể trong thế giới thực có thuộc tính và hành vi.',
          options: ['Lớp', 'Đối tượng', 'Phương thức', 'Toán tử'],
          correctOptionIndex: 1,
          correct_option_index: 1,
          explanation: 'Đối tượng (Object) là thực thể cụ thể được tạo ra từ Lớp (Class).',
        },
      ],
    };

    const studentBoot = sanitizeBootstrapDto({
      currentUser: { id: 'stu1', role: 'student', name: 'HS A' },
      lessons: [sampleLesson],
    });
    const studentQ = studentBoot.lessons[0].questions[0];
    assert.equal(studentQ.correctOptionIndex, undefined);
    assert.equal(studentQ.correct_option_index, undefined);
    assert.equal(studentQ.explanation, undefined);

    const teacherBoot = sanitizeBootstrapDto({
      currentUser: { id: 'tea1', role: 'teacher', name: 'GV B' },
      lessons: [sampleLesson],
    });
    const teacherQ = teacherBoot.lessons[0].questions[0];
    assert.equal(teacherQ.correctOptionIndex, 1);
    assert.equal(teacherQ.explanation, 'Đối tượng (Object) là thực thể cụ thể được tạo ra từ Lớp (Class).');
  });

  test('3. Edge submit-quiz delegates atomically to m3_submit_quiz_attempt, fails closed on RPC error/incomplete/out-of-bounds, and returns answerReview', async () => {
    const studentProfileId = '33333333-3333-4333-8333-000000000003';
    const lessonId = '55555555-5555-4555-8555-555555555602';
    const questionsRows = [
      {
        id: '66666666-6666-4666-8666-666666666701',
        lesson_id: lessonId,
        options: ['Lớp', 'Đối tượng', 'Phương thức', 'Toán tử'],
        correct_option_index: 1,
        explanation: 'Đối tượng (Object) là thực thể cụ thể.',
        order_index: 0,
      },
      {
        id: '66666666-6666-4666-8666-666666666702',
        lesson_id: lessonId,
        options: ['A', 'B', 'C', 'D'],
        correct_option_index: 2,
        explanation: 'Tham số mặc định là Hello World.',
        order_index: 1,
      },
    ];

    let quizQuestionsQueryCount = 0;
    let simulateRpcError = false;

    const mockClient = {
      rpc: async (fnName, params) => {
        if (fnName === 'm2_verify_bff_secret') return { data: true, error: null };
        if (fnName === 'm2_verify_actor_session') {
          return {
            data: [
              {
                valid: true,
                profile_id: studentProfileId,
                role: 'student',
                auth_email: 'stu@example.invalid',
                session_version: 1,
                status: 'active',
              },
            ],
            error: null,
          };
        }
        if (fnName === 'm3_submit_quiz_attempt') {
          if (simulateRpcError) {
            return { data: null, error: { message: 'DB connection lost' } };
          }
          const expectedIds = params?.p_expected_question_ids;
          if (
            Array.isArray(expectedIds) &&
            (expectedIds.length !== questionsRows.length ||
              questionsRows.some((q, idx) => expectedIds[idx] !== q.id))
          ) {
            return {
              data: null,
              error: { message: 'QUIZ_CHANGED_MID_ATTEMPT: Nội dung bài trắc nghiệm đã được cập nhật.' },
            };
          }
          const ans = Array.isArray(params?.p_answers) ? params.p_answers : [];
          if (
            ans.length !== questionsRows.length ||
            questionsRows.some((q, idx) => typeof ans[idx] !== 'number' || ans[idx] < 0 || ans[idx] >= q.options.length)
          ) {
            return {
              data: null,
              error: { message: 'INCOMPLETE_QUIZ_ANSWERS: Vui lòng chọn đáp án cho tất cả các câu hỏi trước khi nộp bài.' },
            };
          }
          const correctCount = questionsRows.filter((q, idx) => ans[idx] === q.correct_option_index).length;
          const score = Math.round((correctCount / questionsRows.length) * 100);
          return {
            data: [
              {
                score,
                passed: score >= 70,
                highest_score: score,
                attempts_count: 1,
                answer_review: questionsRows.map((q) => ({
                  questionId: q.id,
                  correctOptionIndex: q.correct_option_index,
                  explanation: q.explanation,
                })),
              },
            ],
            error: null,
          };
        }
        return { data: null, error: null };
      },
      auth: {
        getUser: async (token) => ({ data: { user: { id: domain.decodeJwtClaims(token)?.sub } }, error: null }),
      },
      from: (table) => {
        const builder = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          then: (resolve) => {
            if (table === 'quiz_questions') {
              quizQuestionsQueryCount++;
              return Promise.resolve(resolve({ data: questionsRows, error: null }));
            }
            return Promise.resolve(resolve({ data: [], error: null }));
          },
        };
        return builder;
      },
    };

    const handleRequest = await loadEdgeHandler(mockClient);
    const sendSubmit = async (answers, questionIds) => {
      const req = new Request('http://localhost/m2-backend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-mindx-bff-secret': 'secret' },
        body: JSON.stringify({
          action: 'submit-quiz',
          accessToken: createMockJwt(),
          sessionVersion: 1,
          trustedIp: '203.0.113.10',
          payload: { lessonId, answers, ...(questionIds !== undefined ? { questionIds } : {}) },
        }),
      });
      const res = await handleRequest(req);
      return { status: res.status, json: await res.json() };
    };

    // Unanswered (-1) must fail 400
    const incomplete1 = await sendSubmit([1, -1]);
    assert.equal(incomplete1.status, 400);
    assert.equal(incomplete1.json.code, 'INCOMPLETE_QUIZ_ANSWERS');

    // Short / mismatched count must fail 400 inside atomic RPC
    const incomplete2 = await sendSubmit([1]);
    assert.equal(incomplete2.status, 400);
    assert.equal(incomplete2.json.code, 'INCOMPLETE_QUIZ_ANSWERS');

    // Out-of-bounds option index must fail 400 inside atomic RPC
    const outOfBounds = await sendSubmit([1, 9]);
    assert.equal(outOfBounds.status, 400);
    assert.equal(outOfBounds.json.code, 'INCOMPLETE_QUIZ_ANSWERS');

    // Mismatched questionIds even with identical count (e.g. reordered/replaced quiz) must fail 409 QUIZ_CHANGED_MID_ATTEMPT
    const midEdit = await sendSubmit([1, 2], [questionsRows[1].id, questionsRows[0].id]);
    assert.equal(midEdit.status, 409);
    assert.equal(midEdit.json.code, 'QUIZ_CHANGED_MID_ATTEMPT');

    // RPC DB failure must fail closed with 400 QUIZ_SUBMIT_FAILED
    simulateRpcError = true;
    const rpcErrRes = await sendSubmit([1, 2], [questionsRows[0].id, questionsRows[1].id]);
    assert.equal(rpcErrRes.status, 400);
    assert.equal(rpcErrRes.json.code, 'QUIZ_SUBMIT_FAILED');
    simulateRpcError = false;

    // Complete answers with matching snapshot succeed and return atomic answerReview without separate quiz_questions query
    const complete = await sendSubmit([1, 2], [questionsRows[0].id, questionsRows[1].id]);
    assert.equal(complete.status, 200);
    assert.equal(complete.json.success, true);
    assert.equal(complete.json.score, 100);
    assert.equal(complete.json.answerReview.length, 2);
    assert.equal(complete.json.answerReview[0].correctOptionIndex, 1);
    assert.equal(complete.json.answerReview[0].explanation, 'Đối tượng (Object) là thực thể cụ thể.');
    assert.equal(complete.json.answerReview[1].correctOptionIndex, 2);
    assert.equal(complete.json.answerReview[1].explanation, 'Tham số mặc định là Hello World.');
    assert.equal(quizQuestionsQueryCount, 0, 'submit-quiz must rely atomically on m3_submit_quiz_attempt instead of separate quiz_questions read');
  });

  test('4. UI StudentQuizPage hides answers before submit, requires all answers, shows review after submit, and hides again on retry', async () => {
    const savedGlobals = new Map();
    const setGlobal = (key, val) => {
      if (!savedGlobals.has(key)) savedGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, { value: val, configurable: true, writable: true });
    };
    const restoreGlobals = () => {
      for (const [key, desc] of savedGlobals.entries()) {
        if (desc === undefined) delete globalThis[key];
        else Object.defineProperty(globalThis, key, desc);
      }
      savedGlobals.clear();
    };

    const LESSON_ID = '55555555-5555-4555-8555-555555555602';
    const STUDENT_ID = 'stu_pti_01';
    const CLASS_ID = 'cls_pti_01';
    const COURSE_ID = '44444444-4444-4444-8444-444444444423';

    const mockUser = {
      id: STUDENT_ID,
      name: 'Học sinh PTI',
      studentCode: 'PTI01',
      role: 'student',
      status: 'active',
    };

    const mockBootstrap = {
      currentUser: mockUser,
      users: [mockUser],
      students: [
        {
          id: STUDENT_ID,
          studentCode: 'PTI01',
          fullName: 'Học sinh PTI',
          currentClassId: CLASS_ID,
          originalClassId: CLASS_ID,
          status: 'active',
        },
      ],
      classes: [{ id: CLASS_ID, code: 'VT-PTI01', name: 'Lớp PTI', courseId: COURSE_ID, status: 'active' }],
      courses: [{ id: COURSE_ID, title: 'PTI', description: 'Python Intensive', status: 'active' }],
      lessons: [
        {
          id: LESSON_ID,
          courseId: COURSE_ID,
          sessionNumber: 2,
          title: 'Buổi 2: Python OOP & PyQt6',
          status: 'published',
          hasQuiz: true,
          hasPractice: true,
          questions: [
            {
              id: 'q_pti_1',
              prompt: '_____ là đại diện cho thực thể trong thế giới thực có thuộc tính và hành vi.',
              options: ['Lớp', 'Đối tượng', 'Phương thức', 'Toán tử'],
            },
            {
              id: 'q_pti_2',
              prompt: 'Đâu là kết quả in ra màn hình:\n\n```python\nclass Test:\n    def __init__(self, a="Hello World"):\n        self.a = a\n```',
              options: ['Lỗi', 'Không hiện gì', 'Hello World', 'Lỗi display'],
            },
          ],
        },
      ],
      quizResults: [],
      submissions: [],
    };

    const prevDemoEnv = process.env.NEXT_PUBLIC_MINDX_DEMO;
    process.env.NEXT_PUBLIC_MINDX_DEMO = '0';

    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'http://localhost:3000/student/lessons/' + LESSON_ID + '/quiz',
      pretendToBeVisual: true,
    });
    dom.window.scrollTo = () => {};

    setGlobal('window', dom.window);
    setGlobal('document', dom.window.document);
    setGlobal('HTMLElement', dom.window.HTMLElement);
    setGlobal('HTMLInputElement', dom.window.HTMLInputElement);
    setGlobal('HTMLButtonElement', dom.window.HTMLButtonElement);
    setGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
    setGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));
    setGlobal('cancelAnimationFrame', (id) => clearTimeout(id));
    setGlobal('IS_REACT_ACT_ENVIRONMENT', true);

    let submitCalledCount = 0;
    let lastSubmittedBody = null;
    let simulateQuizChangedOnNextSubmit = false;
    setGlobal('fetch', async (url, opts) => {
      const target = typeof url === 'string' ? url : url?.url || '';
      const pathname = target.startsWith('http') ? new URL(target).pathname : target;
      if (pathname === '/api/m2/session') {
        return new Response(JSON.stringify({ success: true, user: mockUser }), { status: 200 });
      }
      if (pathname === '/api/m2/bootstrap') {
        const bootPayload = simulateQuizChangedOnNextSubmit
          ? {
              ...mockBootstrap,
              lessons: [
                {
                  ...mockBootstrap.lessons[0],
                  questions: [
                    { ...mockBootstrap.lessons[0].questions[0], id: 'q_pti_1_v2', prompt: 'Câu hỏi mới v2 #1' },
                    { ...mockBootstrap.lessons[0].questions[1], id: 'q_pti_2_v2', prompt: 'Câu hỏi mới v2 #2' },
                  ],
                },
              ],
            }
          : mockBootstrap;
        return new Response(JSON.stringify({ success: true, data: bootPayload }), { status: 200 });
      }
      if (pathname === '/api/m2/submit-quiz' && opts?.method === 'POST') {
        submitCalledCount++;
        lastSubmittedBody = JSON.parse(opts.body);
        if (simulateQuizChangedOnNextSubmit) {
          return new Response(
            JSON.stringify({
              success: false,
              code: 'QUIZ_CHANGED_MID_ATTEMPT',
              message: 'Nội dung bài trắc nghiệm đã được giáo viên cập nhật trong lúc bạn đang làm bài. Hệ thống đã tải lại bộ câu hỏi mới nhất, vui lòng kiểm tra và nộp lại.',
            }),
            { status: 409 }
          );
        }
        return new Response(
          JSON.stringify({
            success: true,
            score: 50,
            passed: false,
            highestScore: 50,
            attemptsCount: 1,
            message: 'Bạn chưa đạt ngưỡng 70%.',
            answerReview: [
              { questionId: 'q_pti_1', correctOptionIndex: 1, explanation: 'Giải thích câu 1 OOP.' },
              { questionId: 'q_pti_2', correctOptionIndex: 2, explanation: 'Giải thích câu 2 Python.' },
            ],
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected fetch URL: ${target}`);
    });

    const moduleCache = new Map();
    const loadModule = (filePath) => {
      const abs = path.resolve(filePath);
      if (moduleCache.has(abs)) return moduleCache.get(abs).exports;
      const code = fs.readFileSync(abs, 'utf8');
      const { outputText } = ts.transpileModule(code, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.React,
          esModuleInterop: true,
        },
        fileName: abs,
      });
      const mod = { exports: {} };
      moduleCache.set(abs, mod);
      const customRequire = (spec) => {
        if (spec === 'react') return { ...React, default: React };
        if (spec === 'next/link') {
          const Link = ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children);
          return { default: Link, __esModule: true };
        }
        if (spec === 'next/navigation') {
          return {
            __esModule: true,
            useRouter: () => ({ push: () => {}, replace: () => {} }),
            usePathname: () => `/student/lessons/${LESSON_ID}/quiz`,
            useParams: () => ({ lessonId: LESSON_ID }),
          };
        }
        if (spec.startsWith('@/')) {
          const sub = spec.slice(2);
          for (const ext of ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts']) {
            const cand = path.resolve('src', sub + ext);
            if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return loadModule(cand);
          }
        }
        if (spec.startsWith('.')) {
          const dir = path.dirname(abs);
          for (const ext of ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts']) {
            const cand = path.resolve(dir, spec + ext);
            if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return loadModule(cand);
          }
        }
        throw new Error(`Unexpected import: ${spec}`);
      };
      new Function('require', 'module', 'exports', '__filename', '__dirname', outputText)(
        customRequire,
        mod,
        mod.exports,
        abs,
        path.dirname(abs)
      );
      return mod.exports;
    };

    let root = null;
    try {
      const ReactDOM = (await import('react-dom/client')).default;
      const { StoreProvider } = loadModule('src/lib/store.tsx');
      const StudentQuizPage = loadModule('src/app/student/lessons/[lessonId]/quiz/page.tsx').default;

      const rootEl = dom.window.document.getElementById('root');
      root = ReactDOM.createRoot(rootEl);

      await act(async () => {
        root.render(React.createElement(StoreProvider, null, React.createElement(StudentQuizPage, null)));
      });

      const start = Date.now();
      while (Date.now() - start < 3000) {
        if ((rootEl.textContent || '').includes('Buổi 2: Python OOP & PyQt6')) break;
        await act(async () => {
          await new Promise((r) => setTimeout(r, 20));
        });
      }

      // 1) Before submitting: code block rendered, answers & explanations hidden
      assert.ok((rootEl.textContent || '').includes('Buổi 2: Python OOP & PyQt6'));
      assert.ok(rootEl.querySelector('pre code')?.textContent.includes('def __init__(self, a="Hello World"):'));
      assert.equal((rootEl.textContent || '').includes('Đáp án đúng'), false);
      assert.equal((rootEl.textContent || '').includes('Giải thích câu 1 OOP.'), false);

      // 2) Submit while unanswered -> blocked by validation, fetch NOT called
      const submitBtn = Array.from(rootEl.querySelectorAll('button')).find((b) =>
        (b.textContent || '').includes('Nộp bài chấm điểm')
      );
      assert.ok(submitBtn);
      await act(async () => {
        submitBtn.click();
      });
      assert.equal(submitCalledCount, 0);
      assert.ok((rootEl.textContent || '').includes('Vui lòng chọn đáp án cho tất cả các câu hỏi'));

      // 3) Select answers (Q1 wrong option A=0, Q2 right option C=2) & submit
      const q1Radios = rootEl.querySelectorAll('input[type="radio"][name="question_q_pti_1"]');
      const q2Radios = rootEl.querySelectorAll('input[type="radio"][name="question_q_pti_2"]');
      await act(async () => {
        q1Radios[0].click();
        q2Radios[2].click();
      });
      await act(async () => {
        submitBtn.click();
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 400));
      });

      assert.equal(submitCalledCount, 1);
      assert.deepEqual(lastSubmittedBody.questionIds, ['q_pti_1', 'q_pti_2']);
      assert.deepEqual(lastSubmittedBody.answers, [0, 2]);
      const afterSubmitText = rootEl.textContent || '';
      assert.ok(afterSubmitText.includes('50%'));
      assert.ok(afterSubmitText.includes('Đáp án đúng'));
      assert.ok(afterSubmitText.includes('Lựa chọn của bạn'));
      assert.ok(afterSubmitText.includes('Giải thích câu 1 OOP.'));
      assert.ok(afterSubmitText.includes('Giải thích câu 2 Python.'));

      // Radios locked in review mode
      assert.equal(rootEl.querySelector('input[type="radio"][name="question_q_pti_1"]').disabled, true);

      // 4) Click "Làm lại lần nữa" -> clears answers, hides Đáp án đúng & explanations, unlocks radios
      const retryBtn = Array.from(rootEl.querySelectorAll('button')).find((b) =>
        (b.textContent || '').includes('Làm lại lần nữa')
      );
      assert.ok(retryBtn);
      await act(async () => {
        retryBtn.click();
      });

      const afterRetryText = rootEl.textContent || '';
      assert.equal(afterRetryText.includes('Đáp án đúng'), false);
      assert.equal(afterRetryText.includes('Giải thích câu 1 OOP.'), false);
      assert.equal(afterRetryText.includes('Lựa chọn của bạn'), false);
      assert.equal(rootEl.querySelector('input[type="radio"][name="question_q_pti_1"]').disabled, false);
      assert.equal(rootEl.querySelector('input[type="radio"][name="question_q_pti_1"]').checked, false);

      // 5) Retry attempt fails with 409 QUIZ_CHANGED_MID_ATTEMPT -> clears selections & loads updated questions cleanly
      simulateQuizChangedOnNextSubmit = true;
      await act(async () => {
        rootEl.querySelectorAll('input[type="radio"][name="question_q_pti_1"]')[1].click();
        rootEl.querySelectorAll('input[type="radio"][name="question_q_pti_2"]')[2].click();
      });
      await act(async () => {
        Array.from(rootEl.querySelectorAll('button')).find((b) =>
          (b.textContent || '').includes('Nộp bài chấm điểm')
        ).click();
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 400));
      });
      const afterChangedText = rootEl.textContent || '';
      assert.ok(afterChangedText.includes('Câu hỏi mới v2 #1'));
      assert.ok(afterChangedText.includes('Đã chọn 0 / 2 câu'));
      assert.ok(afterChangedText.includes('Nội dung bài trắc nghiệm đã được giáo viên cập nhật'));
    } finally {
      if (root) {
        try {
          await act(async () => { root.unmount(); });
        } catch {}
      }
      restoreGlobals();
      try { dom.window.close(); } catch {}
      if (prevDemoEnv === undefined) delete process.env.NEXT_PUBLIC_MINDX_DEMO;
      else process.env.NEXT_PUBLIC_MINDX_DEMO = prevDemoEnv;
    }
  });

  test('4b. UI StudentLessonDetailPage renders Click Counter Markdown table, CSS/Python code blocks without HTML iframe, safe links, and draft gating', async () => {
    const savedGlobals = new Map();
    const setGlobal = (key, val) => {
      if (!savedGlobals.has(key)) savedGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, { value: val, configurable: true, writable: true });
    };
    const restoreGlobals = () => {
      for (const [key, desc] of savedGlobals.entries()) {
        if (desc === undefined) delete globalThis[key];
        else Object.defineProperty(globalThis, key, desc);
      }
      savedGlobals.clear();
    };

    const practiceSql = await fsp.readFile(PRACTICE_MIGRATION_PATH, 'utf8');
    const matMatch = practiceSql.match(/\$PTI_B2_PRACTICE\$([\s\S]*?)\$PTI_B2_PRACTICE\$/);
    assert.ok(matMatch, 'Expected $PTI_B2_PRACTICE$ dollar-quoted materials block');
    const actualMaterials = `${matMatch[1]}\n\n[Thử XSS](javascript:alert(1))`;

    const LESSON_ID = '55555555-5555-4555-8555-555555555602';
    const COURSE_ID = '44444444-4444-4444-8444-444444444423';
    const ADMIN_USER = {
      id: 'adm_pti_01',
      name: 'Admin MindX',
      email: 'admin@mindx.local',
      role: 'admin',
      status: 'active',
    };
    const STUDENT_USER = {
      id: 'stu_pti_01',
      name: 'Học sinh PTI',
      studentCode: 'PTI01',
      role: 'student',
      status: 'active',
    };

    let activeMockUser = ADMIN_USER;
    const makeBootstrap = () => ({
      currentUser: activeMockUser,
      users: [ADMIN_USER, STUDENT_USER],
      students: [],
      classes: [],
      courses: [{ id: COURSE_ID, title: 'PTI', description: 'Python Intensive', status: 'active' }],
      lessons: [
        {
          id: LESSON_ID,
          courseId: COURSE_ID,
          sessionNumber: 2,
          title: 'Buổi 2: Python OOP & PyQt6',
          description: 'Ôn tập Python OOP, 20 câu trắc nghiệm và thực hành Click Counter.',
          materials:
            actualMaterials +
            '\n\nTham khảo: [Tài liệu PyQt6](https://doc.qt.io/qtforpython-6/) | [BadJS](javascript:alert(1)) | [BadProto](//evil.example.com)',
          videoUrl: '',
          status: 'draft',
          hasQuiz: true,
          hasPractice: true,
          practiceMode: 'file_allowed',
          questions: [],
        },
      ],
      quizResults: [],
      submissions: [],
    });

    const prevDemoEnv = process.env.NEXT_PUBLIC_MINDX_DEMO;
    process.env.NEXT_PUBLIC_MINDX_DEMO = '0';

    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'http://localhost:3000/student/lessons/' + LESSON_ID,
      pretendToBeVisual: true,
    });
    dom.window.scrollTo = () => {};

    setGlobal('window', dom.window);
    setGlobal('document', dom.window.document);
    setGlobal('HTMLElement', dom.window.HTMLElement);
    setGlobal('HTMLInputElement', dom.window.HTMLInputElement);
    setGlobal('HTMLButtonElement', dom.window.HTMLButtonElement);
    setGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
    setGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));
    setGlobal('cancelAnimationFrame', (id) => clearTimeout(id));
    setGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    setGlobal('fetch', async (url) => {
      const target = typeof url === 'string' ? url : url?.url || '';
      const pathname = target.startsWith('http') ? new URL(target).pathname : target;
      if (pathname === '/api/m2/session') {
        return new Response(JSON.stringify({ success: true, user: activeMockUser }), { status: 200 });
      }
      if (pathname === '/api/m2/bootstrap') {
        return new Response(JSON.stringify({ success: true, data: makeBootstrap() }), { status: 200 });
      }
      throw new Error(`Unexpected fetch URL: ${target}`);
    });

    const moduleCache = new Map();
    const loadModule = (filePath) => {
      const abs = path.resolve(filePath);
      if (moduleCache.has(abs)) return moduleCache.get(abs).exports;
      const code = fs.readFileSync(abs, 'utf8');
      const { outputText } = ts.transpileModule(code, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.React,
          esModuleInterop: true,
        },
        fileName: abs,
      });
      const mod = { exports: {} };
      moduleCache.set(abs, mod);
      const customRequire = (spec) => {
        if (spec === 'react') return { ...React, default: React };
        if (spec === 'next/link') {
          const Link = ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children);
          return { default: Link, __esModule: true };
        }
        if (spec === 'next/navigation') {
          return {
            __esModule: true,
            useRouter: () => ({ push: () => {}, replace: () => {} }),
            usePathname: () => `/student/lessons/${LESSON_ID}`,
            useParams: () => ({ lessonId: LESSON_ID }),
          };
        }
        if (spec.startsWith('@/')) {
          const sub = spec.slice(2);
          for (const ext of ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts']) {
            const cand = path.resolve('src', sub + ext);
            if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return loadModule(cand);
          }
        }
        if (spec.startsWith('.')) {
          const dir = path.dirname(abs);
          for (const ext of ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts']) {
            const cand = path.resolve(dir, spec + ext);
            if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return loadModule(cand);
          }
        }
        throw new Error(`Unexpected import: ${spec}`);
      };
      new Function('require', 'module', 'exports', '__filename', '__dirname', outputText)(
        customRequire,
        mod,
        mod.exports,
        abs,
        path.dirname(abs)
      );
      return mod.exports;
    };

    const { createRoot } = await import('react-dom/client');
    const { StoreProvider } = loadModule('src/lib/store.tsx');
    const StudentLessonDetailPage = loadModule(STUDENT_LESSON_PATH).default;
    const rootEl = dom.window.document.getElementById('root');
    let root = null;

    try {
      // 1) Staff preview renders draft Session 2 with full Click Counter lab, table, code blocks, and practice tabs
      root = createRoot(rootEl);
      await act(async () => {
        root.render(React.createElement(StoreProvider, null, React.createElement(StudentLessonDetailPage)));
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 150));
      });

      const fullText = rootEl.textContent || '';
      assert.ok(fullText.includes('Đang ở trạng thái Bản nháp'));
      assert.ok(fullText.includes('BÀI THỰC HÀNH 1: ỨNG DỤNG BỘ ĐẾM SỐ (CLICK COUNTER)'));
      assert.equal(fullText.includes(':---'), false, 'GFM table separator row must not render as raw text');
      assert.equal(fullText.includes('<br>'), false, '<br> inside table cells must convert to DOM <br> elements');

      const tables = rootEl.querySelectorAll('table');
      assert.equal(tables.length, 1, 'Expected 1 rendered HTML table for Qt Designer Property Editor');
      assert.equal(tables[0].querySelectorAll('thead th').length, 4);
      assert.equal(tables[0].querySelectorAll('tbody tr').length, 4);
      assert.ok(tables[0].querySelectorAll('tbody tr')[0].querySelectorAll('br').length >= 1);
      assert.ok((tables[0].textContent || '').includes('txt_display'));
      assert.ok((tables[0].textContent || '').includes('btn_inc'));
      assert.ok((tables[0].textContent || '').includes('btn_dec'));
      assert.ok((tables[0].textContent || '').includes('btn_reset'));

      const codeBlocks = rootEl.querySelectorAll('pre code');
      assert.equal(codeBlocks.length, 3, 'Expected 2 CSS styleSheet blocks + 1 Python CounterApp block');
      assert.ok((codeBlocks[2].textContent || '').includes('uic.loadUi("counter.ui", self)'));
      assert.ok((codeBlocks[2].textContent || '').includes('    def increase_count(self):'));
      assert.equal(rootEl.querySelectorAll('iframe').length, 0, 'CSS/Python blocks must not open an HTML iframe');

      assert.ok(fullText.includes('3. Nộp bài thực hành'));
      assert.ok(fullText.includes('Nộp đường link'));
      assert.ok(fullText.includes('Tải tệp (<= 2MB)'));
      const safeDocLink = rootEl.querySelector('a[href="https://doc.qt.io/qtforpython-6/"]');
      assert.ok(safeDocLink, 'Valid https:// markdown link must render as an anchor');
      assert.equal(safeDocLink.getAttribute('rel'), 'noopener noreferrer');
      assert.equal(rootEl.querySelector('a[href^="javascript:"]'), null, 'javascript: links must be rejected');
      assert.equal(rootEl.querySelector('a[href^="//"]'), null, 'protocol-relative // links must be rejected');

      await act(async () => {
        root.unmount();
      });
      root = null;

      // 2) Student role is blocked while Session 2 remains in draft
      activeMockUser = STUDENT_USER;
      root = createRoot(rootEl);
      await act(async () => {
        root.render(React.createElement(StoreProvider, null, React.createElement(StudentLessonDetailPage)));
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 150));
      });
      const studentDraftText = rootEl.textContent || '';
      assert.ok(studentDraftText.includes('Bài học chưa xuất bản'));
      assert.equal(studentDraftText.includes('BÀI THỰC HÀNH 1'), false);
    } finally {
      if (root) {
        try {
          await act(async () => { root.unmount(); });
        } catch {}
      }
      restoreGlobals();
      try { dom.window.close(); } catch {}
      if (prevDemoEnv === undefined) delete process.env.NEXT_PUBLIC_MINDX_DEMO;
      else process.env.NEXT_PUBLIC_MINDX_DEMO = prevDemoEnv;
    }
  });

  test('5. Real PostgreSQL engine executes all PTI Session 2 migrations and enforces m3_update_lesson + m3_submit_quiz_attempt invariants', async (t) => {
    const { initdb, pgCtl, psql, skipReason } = resolvePostgresBinaries();
    if (skipReason) {
      t.skip(skipReason);
      return;
    }

    const port = await getFreeLocalPort();
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mindx-pti-pg-'));
    const pgDataDir = path.join(tmpRoot, 'data');
    const pgLogPath = path.join(tmpRoot, 'pg.log');
    const bootstrapSqlPath = path.join(tmpRoot, 'bootstrap.sql');
    const verifySqlPath = path.join(tmpRoot, 'verify.sql');
    const pgEnv = { ...process.env, PGCLIENTENCODING: 'UTF8' };
    let pgStartAttempted = false;
    let pgStartSucceeded = false;
    let primaryError = null;

    const runPsqlFile = (filePath, extraArgs = []) =>
      execFileSync(
        psql,
        ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', ...extraArgs, '-f', filePath],
        { encoding: 'utf8', env: pgEnv, stdio: 'pipe', timeout: 30000 }
      );

    try {
      execFileSync(
        initdb,
        ['-D', pgDataDir, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--no-locale'],
        { env: pgEnv, stdio: 'pipe', timeout: 30000 }
      );

      const postgresOpts =
        process.platform === 'win32'
          ? `-h 127.0.0.1 -p ${port} -F -c listen_addresses=127.0.0.1`
          : `-h 127.0.0.1 -p ${port} -k ${tmpRoot} -F -c listen_addresses=127.0.0.1`;

      pgStartAttempted = true;
      try {
        execFileSync(
          pgCtl,
          ['-D', pgDataDir, '-l', pgLogPath, '-w', '-o', postgresOpts, 'start'],
          { env: pgEnv, stdio: 'ignore', timeout: 30000 }
        );
        pgStartSucceeded = true;
      } catch (err) {
        const pgLog = fs.existsSync(pgLogPath) ? fs.readFileSync(pgLogPath, 'utf8') : '';
        throw new Error(`pg_ctl start failed: ${err instanceof Error ? err.message : String(err)}\n${pgLog}`);
      }

      const bootstrapSql = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS private;
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
GRANT USAGE ON SCHEMA public, private TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version TEXT PRIMARY KEY,
  name TEXT
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
  full_name TEXT NOT NULL,
  email TEXT,
  student_code TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  session_version INTEGER NOT NULL DEFAULT 1,
  is_fixture BOOLEAN NOT NULL DEFAULT false,
  m4_synced BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.courses (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  total_sessions INTEGER NOT NULL DEFAULT 14,
  is_fixture BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.classes (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  course_id UUID REFERENCES public.courses(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'completed')),
  is_14_sessions_confirmed BOOLEAN NOT NULL DEFAULT false,
  is_fixture BOOLEAN NOT NULL DEFAULT false,
  m4_synced BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL UNIQUE,
  student_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  current_class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  original_class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  pin_issued_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'transferred', 'archived')),
  notes TEXT,
  is_fixture BOOLEAN NOT NULL DEFAULT false,
  m4_synced BOOLEAN NOT NULL DEFAULT false,
  m4_previous_full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  session_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  materials TEXT NOT NULL DEFAULT '',
  video_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  has_quiz BOOLEAN NOT NULL DEFAULT false,
  has_practice BOOLEAN NOT NULL DEFAULT false,
  practice_mode TEXT NOT NULL DEFAULT 'link_only',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (course_id, session_number)
);

CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_option_index INTEGER NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quiz_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  highest_score INTEGER NOT NULL CHECK (highest_score >= 0 AND highest_score <= 100),
  attempts_count INTEGER NOT NULL CHECK (attempts_count >= 1),
  passed BOOLEAN NOT NULL,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, lesson_id, class_id)
);

CREATE TABLE IF NOT EXISTS public.m5_course_close_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL,
  course_id UUID NOT NULL,
  next_course_id UUID,
  status TEXT NOT NULL,
  target_storage_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
  deleted_storage_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
  remaining_storage_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_14_sessions_confirmed BOOLEAN NOT NULL DEFAULT false,
  csv_sha256 TEXT,
  snapshot_digest TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  created_by UUID,
  execution_run_id UUID NOT NULL DEFAULT gen_random_uuid(),
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;
      fs.writeFileSync(bootstrapSqlPath, bootstrapSql, 'utf8');
      runPsqlFile(bootstrapSqlPath);

      // Apply all real PTI Session 2 migrations in chronological order, then re-apply to confirm idempotency
      runPsqlFile(MIGRATION_PATH);
      runPsqlFile(ATOMIC_RPC_MIGRATION_PATH);
      runPsqlFile(PRACTICE_MIGRATION_PATH);
      runPsqlFile(MIGRATION_PATH);
      runPsqlFile(ATOMIC_RPC_MIGRATION_PATH);
      runPsqlFile(PRACTICE_MIGRATION_PATH);

      const verifySql = `
DO $$
DECLARE
  v_course_id CONSTANT UUID := '44444444-4444-4444-8444-444444444423';
  v_lesson_id CONSTANT UUID := '55555555-5555-4555-8555-555555555602';
  v_admin_id CONSTANT UUID := '11111111-1111-4111-8111-000000000001';
  v_class_id CONSTANT UUID := '22222222-2222-4222-8222-000000000001';
  v_student_id CONSTANT UUID := '33333333-3333-4333-8333-000000000001';
  v_count INT;
  v_err TEXT;
  v_expected_ids TEXT[];
  v_swapped_ids TEXT[];
  v_new_ids TEXT[];
  v_correct_answers INT[];
  v_wrong_answers INT[];
  v_bad_answers INT[];
  v_res RECORD;
  v_q RECORD;
  v_review_item JSONB;
  v_idx INT;
  v_raised BOOLEAN;
  v_questions_payload JSONB;
BEGIN
  -- 1. Seeded PTI course, 14 lessons, draft Session 2, 20 questions + Python blocks + Q17 wording
  SELECT count(*)::INT INTO v_count
  FROM public.courses
  WHERE id = v_course_id AND total_sessions = 14 AND is_fixture = false;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'PTI course missing or invalid fixture/session count: %', v_count;
  END IF;

  SELECT count(*)::INT INTO v_count
  FROM public.lessons
  WHERE course_id = v_course_id;
  IF v_count <> 14 THEN
    RAISE EXCEPTION 'Expected 14 lessons for PTI, got %', v_count;
  END IF;

  SELECT count(*)::INT INTO v_count
  FROM public.lessons
  WHERE id = v_lesson_id
    AND status = 'draft'
    AND has_quiz = true
    AND has_practice = true
    AND practice_mode = 'file_allowed'
    AND materials LIKE '%BÀI THỰC HÀNH 1: ỨNG DỤNG BỘ ĐẾM SỐ (CLICK COUNTER)%'
    AND materials LIKE '%uic.loadUi("counter.ui", self)%'
    AND materials LIKE '%main_bai1.py%';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Session 2 must be in draft state with quiz & Click Counter practice materials enabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE version = '20261114103000' AND name = 'm6_pti_session2_practice'
  ) THEN
    RAISE EXCEPTION 'Migration 20261114103000 not recorded in schema_migrations';
  END IF;

  SELECT count(*)::INT INTO v_count
  FROM public.quiz_questions
  WHERE lesson_id = v_lesson_id
    AND correct_option_index BETWEEN 0 AND 3
    AND jsonb_array_length(options) = 4
    AND pg_catalog.btrim(explanation) <> '';
  IF v_count <> 20 THEN
    RAISE EXCEPTION 'Expected 20 valid quiz questions with explanations, got %', v_count;
  END IF;

  SELECT count(*)::INT INTO v_count
  FROM public.quiz_questions
  WHERE id IN (
    '66666666-6666-4666-8666-666666666702',
    '66666666-6666-4666-8666-666666666703',
    '66666666-6666-4666-8666-666666666704',
    '66666666-6666-4666-8666-666666666711'
  )
    AND prompt LIKE '%\`\`\`python%'
    AND prompt LIKE '%    def __init__%';
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'Expected 4 Python indented fenced code blocks (Q2,Q3,Q4,Q11), got %', v_count;
  END IF;

  SELECT count(*)::INT INTO v_count
  FROM public.quiz_questions
  WHERE id = '66666666-6666-4666-8666-666666666717'
    AND prompt = 'Trong PyQt6, thành phần giao diện nào được dùng để tạo ô nhập liệu văn bản trên một dòng?'
    AND correct_option_index = 1;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Q17 wording or correct index mismatch';
  END IF;

  -- 2. Single overload & privilege grants
  SELECT count(*)::INT INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'm3_submit_quiz_attempt';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 m3_submit_quiz_attempt overload, got %', v_count;
  END IF;

  IF has_function_privilege('anon', 'public.m3_submit_quiz_attempt(uuid,uuid,integer[],text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not have EXECUTE on m3_submit_quiz_attempt';
  END IF;
  IF has_function_privilege('authenticated', 'public.m3_submit_quiz_attempt(uuid,uuid,integer[],text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must not have EXECUTE on m3_submit_quiz_attempt';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.m3_submit_quiz_attempt(uuid,uuid,integer[],text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must have EXECUTE on m3_submit_quiz_attempt';
  END IF;

  -- Collect ordered IDs & answers
  SELECT
    array_agg(q.id::text ORDER BY q.order_index ASC, q.id ASC),
    array_agg(q.correct_option_index ORDER BY q.order_index ASC, q.id ASC),
    array_agg(((q.correct_option_index + 1) % 4) ORDER BY q.order_index ASC, q.id ASC)
  INTO v_expected_ids, v_correct_answers, v_wrong_answers
  FROM public.quiz_questions q
  WHERE q.lesson_id = v_lesson_id;

  -- 3. Seed test admin, active class, and student
  INSERT INTO public.profiles (id, role, full_name, email, status)
  VALUES
    (v_admin_id, 'admin', 'Test Admin', 'admin@test.local', 'active'),
    (v_student_id, 'student', 'Test Student', 'student@test.local', 'active');

  INSERT INTO public.classes (id, code, name, course_id, status)
  VALUES (v_class_id, 'PTI-TEST-01', 'Lớp PTI Test', v_course_id, 'active');

  INSERT INTO public.students (id, participant_id, student_code, full_name, current_class_id, original_class_id, status)
  VALUES (v_student_id, 'P-TEST-01', 'STU-TEST-01', 'Test Student', v_class_id, v_class_id, 'active');

  -- 4. Draft lesson blocks submission
  v_err := NULL;
  BEGIN
    PERFORM * FROM public.m3_submit_quiz_attempt(v_student_id, v_lesson_id, v_correct_answers, v_expected_ids);
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  IF v_err IS NULL OR v_err NOT LIKE 'FORBIDDEN:%' THEN
    RAISE EXCEPTION 'Draft lesson should raise FORBIDDEN, got: %', COALESCE(v_err, '<none>');
  END IF;

  -- 5. Publish Session 2 preserving existing quiz_questions via NULL::jsonb
  PERFORM public.m3_update_lesson(
    v_admin_id, v_lesson_id,
    'Buổi 2: Python OOP & PyQt6', 'Mô tả test', 'Giáo trình test', '',
    'published', true, true, 'file_allowed', NULL::jsonb
  );

  -- 6. Reject incomplete, negative, NULL, out-of-bounds, extra, swapped snapshot, and class close in progress
  v_err := NULL;
  BEGIN
    PERFORM * FROM public.m3_submit_quiz_attempt(v_student_id, v_lesson_id, ARRAY[1], NULL);
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  IF COALESCE(v_err, '') NOT LIKE 'INCOMPLETE_QUIZ_ANSWERS:%' THEN
    RAISE EXCEPTION 'Short answers should raise INCOMPLETE_QUIZ_ANSWERS, got: %', COALESCE(v_err, '<none>');
  END IF;

  v_bad_answers := v_correct_answers;
  v_bad_answers[5] := -1;
  v_err := NULL;
  BEGIN
    PERFORM * FROM public.m3_submit_quiz_attempt(v_student_id, v_lesson_id, v_bad_answers, v_expected_ids);
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  IF COALESCE(v_err, '') NOT LIKE 'INCOMPLETE_QUIZ_ANSWERS:%' THEN
    RAISE EXCEPTION 'Negative element should raise INCOMPLETE_QUIZ_ANSWERS, got: %', COALESCE(v_err, '<none>');
  END IF;

  v_bad_answers := v_correct_answers;
  v_bad_answers[5] := NULL;
  v_err := NULL;
  BEGIN
    PERFORM * FROM public.m3_submit_quiz_attempt(v_student_id, v_lesson_id, v_bad_answers, v_expected_ids);
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  IF COALESCE(v_err, '') NOT LIKE 'INCOMPLETE_QUIZ_ANSWERS:%' THEN
    RAISE EXCEPTION 'NULL element should raise INCOMPLETE_QUIZ_ANSWERS, got: %', COALESCE(v_err, '<none>');
  END IF;

  v_bad_answers := v_correct_answers;
  v_bad_answers[5] := 4;
  v_err := NULL;
  BEGIN
    PERFORM * FROM public.m3_submit_quiz_attempt(v_student_id, v_lesson_id, v_bad_answers, v_expected_ids);
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  IF COALESCE(v_err, '') NOT LIKE 'INCOMPLETE_QUIZ_ANSWERS:%' THEN
    RAISE EXCEPTION 'Out-of-bounds answer should raise INCOMPLETE_QUIZ_ANSWERS, got: %', COALESCE(v_err, '<none>');
  END IF;

  v_err := NULL;
  BEGIN
    PERFORM * FROM public.m3_submit_quiz_attempt(v_student_id, v_lesson_id, v_correct_answers || ARRAY[0], NULL);
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  IF COALESCE(v_err, '') NOT LIKE 'INCOMPLETE_QUIZ_ANSWERS:%' THEN
    RAISE EXCEPTION 'Extra 21st answer should raise INCOMPLETE_QUIZ_ANSWERS, got: %', COALESCE(v_err, '<none>');
  END IF;

  v_swapped_ids := v_expected_ids;
  v_swapped_ids[1] := v_expected_ids[2];
  v_swapped_ids[2] := v_expected_ids[1];
  v_err := NULL;
  BEGIN
    PERFORM * FROM public.m3_submit_quiz_attempt(v_student_id, v_lesson_id, v_correct_answers, v_swapped_ids);
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  IF COALESCE(v_err, '') NOT LIKE 'QUIZ_CHANGED_MID_ATTEMPT:%' THEN
    RAISE EXCEPTION 'Swapped questionIds should raise QUIZ_CHANGED_MID_ATTEMPT, got: %', COALESCE(v_err, '<none>');
  END IF;

  INSERT INTO public.m5_course_close_operations (class_id, course_id, status)
  VALUES (v_class_id, v_course_id, 'deleting_db');
  v_err := NULL;
  BEGIN
    PERFORM * FROM public.m3_submit_quiz_attempt(v_student_id, v_lesson_id, v_correct_answers, v_expected_ids);
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  IF COALESCE(v_err, '') NOT LIKE 'CLASS_CLOSE_IN_PROGRESS:%' THEN
    RAISE EXCEPTION 'Active close op should raise CLASS_CLOSE_IN_PROGRESS, got: %', COALESCE(v_err, '<none>');
  END IF;
  DELETE FROM public.m5_course_close_operations WHERE class_id = v_class_id;

  SELECT count(*)::INT INTO v_count FROM public.quiz_results;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'quiz_results must still be empty after rejected submissions, got %', v_count;
  END IF;

  -- 7. Privilege enforcement (authenticated blocked, service_role allowed) & atomic answer_review
  v_raised := false;
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM * FROM public.m3_submit_quiz_attempt(v_student_id, v_lesson_id, v_correct_answers, v_expected_ids);
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_raised := true;
  END;
  EXECUTE 'RESET ROLE';
  IF NOT v_raised THEN
    RAISE EXCEPTION 'Calling m3_submit_quiz_attempt as authenticated must raise insufficient_privilege';
  END IF;

  EXECUTE 'SET LOCAL ROLE service_role';
  SELECT s.score, s.passed, s.highest_score, s.attempts_count, s.answer_review
  INTO v_res
  FROM public.m3_submit_quiz_attempt(v_student_id, v_lesson_id, v_correct_answers, v_expected_ids) AS s;
  EXECUTE 'RESET ROLE';

  IF v_res.score <> 100 OR v_res.passed IS DISTINCT FROM true OR v_res.highest_score <> 100 OR v_res.attempts_count <> 1 THEN
    RAISE EXCEPTION 'Expected 100/true/100/1 on valid attempt, got %,%,%,%', v_res.score, v_res.passed, v_res.highest_score, v_res.attempts_count;
  END IF;
  IF jsonb_array_length(v_res.answer_review) <> 20 THEN
    RAISE EXCEPTION 'Expected 20 items in answer_review, got %', jsonb_array_length(v_res.answer_review);
  END IF;

  v_idx := 0;
  FOR v_q IN
    SELECT q.id, q.correct_option_index, q.explanation
    FROM public.quiz_questions q
    WHERE q.lesson_id = v_lesson_id
    ORDER BY q.order_index ASC, q.id ASC
  LOOP
    v_review_item := v_res.answer_review -> v_idx;
    IF (v_review_item->>'questionId') IS DISTINCT FROM v_q.id::text
       OR ((v_review_item->>'correctOptionIndex')::INT) IS DISTINCT FROM v_q.correct_option_index
       OR (v_review_item->>'explanation') IS DISTINCT FROM COALESCE(v_q.explanation, '') THEN
      RAISE EXCEPTION 'answer_review mismatch at index %', v_idx;
    END IF;
    v_idx := v_idx + 1;
  END LOOP;

  -- 8. Retry attempt keeps highest_score = 100 and increments attempts_count = 2
  SELECT s.score, s.passed, s.highest_score, s.attempts_count
  INTO v_res
  FROM public.m3_submit_quiz_attempt(v_student_id, v_lesson_id, v_wrong_answers, v_expected_ids) AS s;
  IF v_res.score <> 0 OR v_res.passed IS DISTINCT FROM false OR v_res.highest_score <> 100 OR v_res.attempts_count <> 2 THEN
    RAISE EXCEPTION 'Expected 0/false/100/2 on retry, got %,%,%,%', v_res.score, v_res.passed, v_res.highest_score, v_res.attempts_count;
  END IF;

  -- 9. m3_update_lesson preserves explanations across replacement and invalidates old questionIds snapshot
  SELECT jsonb_agg(
    jsonb_build_object(
      'prompt', q.prompt,
      'options', q.options,
      'correctOptionIndex', q.correct_option_index,
      'explanation', q.explanation
    )
    ORDER BY q.order_index ASC, q.id ASC
  ) INTO v_questions_payload
  FROM public.quiz_questions q
  WHERE q.lesson_id = v_lesson_id;

  PERFORM public.m3_update_lesson(
    v_admin_id, v_lesson_id,
    'Buổi 2: Python OOP & PyQt6', 'Mô tả mới', 'Giáo trình mới', '',
    'published', true, true, 'file_allowed', v_questions_payload
  );

  SELECT count(*)::INT INTO v_count
  FROM public.quiz_questions
  WHERE lesson_id = v_lesson_id AND pg_catalog.btrim(explanation) <> '';
  IF v_count <> 20 THEN
    RAISE EXCEPTION 'm3_update_lesson lost explanations, remaining non-empty: %', v_count;
  END IF;

  SELECT array_agg(q.id::text ORDER BY q.order_index ASC, q.id ASC) INTO v_new_ids
  FROM public.quiz_questions q
  WHERE q.lesson_id = v_lesson_id;
  IF v_new_ids IS NOT DISTINCT FROM v_expected_ids THEN
    RAISE EXCEPTION 'Expected new UUIDs after m3_update_lesson replacement';
  END IF;

  v_err := NULL;
  BEGIN
    PERFORM * FROM public.m3_submit_quiz_attempt(v_student_id, v_lesson_id, v_correct_answers, v_expected_ids);
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  IF COALESCE(v_err, '') NOT LIKE 'QUIZ_CHANGED_MID_ATTEMPT:%' THEN
    RAISE EXCEPTION 'Old questionIds after m3_update_lesson should raise QUIZ_CHANGED_MID_ATTEMPT, got: %', COALESCE(v_err, '<none>');
  END IF;

  SELECT s.attempts_count, s.highest_score, jsonb_array_length(s.answer_review) AS review_len
  INTO v_res
  FROM public.m3_submit_quiz_attempt(v_student_id, v_lesson_id, v_correct_answers, v_new_ids) AS s;
  IF v_res.attempts_count <> 3 OR v_res.highest_score <> 100 OR v_res.review_len <> 20 THEN
    RAISE EXCEPTION 'Expected 3/100/20 on updated snapshot, got %,%,%', v_res.attempts_count, v_res.highest_score, v_res.review_len;
  END IF;
END $$;
SELECT 'PG_VERIFY_OK';
`;
      fs.writeFileSync(verifySqlPath, verifySql, 'utf8');
      const verifyOutput = runPsqlFile(verifySqlPath, ['-t', '-A']);
      assert.ok(verifyOutput.includes('PG_VERIFY_OK'), `Unexpected psql verify output: ${verifyOutput}`);
    } catch (err) {
      primaryError = err;
      throw err;
    } finally {
      const cleanupErrors = [];
      const pidFile = path.join(pgDataDir, 'postmaster.pid');
      const shouldStopPg = pgStartSucceeded || (pgStartAttempted && fs.existsSync(pidFile));

      if (shouldStopPg) {
        try {
          execFileSync(pgCtl, ['-D', pgDataDir, '-w', '-m', 'immediate', 'stop'], {
            env: pgEnv,
            stdio: 'ignore',
            timeout: 15000,
          });
        } catch (err) {
          cleanupErrors.push(`Failed to stop temporary PostgreSQL server: ${err instanceof Error ? err.message : String(err)}`);
        }
        try {
          execFileSync(pgCtl, ['-D', pgDataDir, 'status'], { env: pgEnv, stdio: 'pipe', timeout: 5000 });
          cleanupErrors.push('Temporary PostgreSQL server is still running after pg_ctl stop');
        } catch (statusErr) {
          const exitStatus = statusErr && typeof statusErr === 'object' ? statusErr.status : null;
          if (exitStatus !== 3) {
            cleanupErrors.push(`Unexpected pg_ctl status exit code after stop (expected 3 = stopped, got ${String(exitStatus)})`);
          }
        }
        if (fs.existsSync(pidFile)) {
          cleanupErrors.push(`Temporary PostgreSQL server PID file still exists after stop: ${pidFile}`);
        }
      }

      if (fs.existsSync(tmpRoot)) {
        try {
          fs.rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        } catch (err) {
          cleanupErrors.push(`Failed to remove temporary PostgreSQL directory ${tmpRoot}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (fs.existsSync(tmpRoot)) {
        cleanupErrors.push(`Temporary PostgreSQL directory still exists after cleanup: ${tmpRoot}`);
      }

      if (cleanupErrors.length > 0) {
        const cleanupMsg = `Cleanup failure:\n${cleanupErrors.join('\n')}`;
        if (primaryError instanceof Error) {
          throw new Error(`${primaryError.message}\n${cleanupMsg}`, { cause: primaryError });
        }
        if (primaryError !== null) {
          throw new Error(`${String(primaryError)}\n${cleanupMsg}`);
        }
        throw new Error(cleanupMsg);
      }
    }
  });
});

function resolvePostgresBinaries() {
  const ext = process.platform === 'win32' ? '.exe' : '';
  const candidateDirs = [
    process.env.PG_BIN_DIR,
    'C:\\Program Files\\PostgreSQL\\17\\bin',
    'C:\\Program Files\\PostgreSQL\\16\\bin',
    'C:\\Program Files\\PostgreSQL\\15\\bin',
    '/usr/lib/postgresql/17/bin',
    '/usr/lib/postgresql/16/bin',
    null,
  ].filter((d) => d !== undefined && d !== '');

  for (const dir of candidateDirs) {
    const initdb = dir ? path.join(dir, `initdb${ext}`) : `initdb${ext}`;
    const pgCtl = dir ? path.join(dir, `pg_ctl${ext}`) : `pg_ctl${ext}`;
    const psql = dir ? path.join(dir, `psql${ext}`) : `psql${ext}`;

    if (dir && (!fs.existsSync(initdb) || !fs.existsSync(pgCtl) || !fs.existsSync(psql))) {
      continue;
    }

    try {
      execFileSync(psql, ['--version'], { stdio: 'pipe', timeout: 5000 });
      return { initdb, pgCtl, psql, skipReason: null };
    } catch (err) {
      const code = err && typeof err === 'object' ? err.code : '';
      if (code === 'EPERM' || code === 'EACCES') {
        return {
          initdb: null,
          pgCtl: null,
          psql: null,
          skipReason: `PostgreSQL binary execution blocked by sandbox (${code})`,
        };
      }
    }
  }

  return {
    initdb: null,
    pgCtl: null,
    psql: null,
    skipReason: 'PostgreSQL client/server binaries (initdb/pg_ctl/psql) not found',
  };
}

function getFreeLocalPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      server.close((closeErr) => {
        if (closeErr) reject(closeErr);
        else resolve(port);
      });
    });
  });
}
