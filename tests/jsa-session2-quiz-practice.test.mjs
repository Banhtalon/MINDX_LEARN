import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import net from 'node:net';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { sanitizeBootstrapDto } from '../src/lib/server/crypto.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PTI_BASE_MIGRATION_PATH = path.resolve(
  __dirname,
  '../supabase/migrations/20261114090000_m6_pti_course_session2_quiz.sql'
);
const ATOMIC_RPC_MIGRATION_PATH = path.resolve(
  __dirname,
  '../supabase/migrations/20261114093000_m6_submit_quiz_atomic_review.sql'
);
const JSA_MIGRATION_PATH = path.resolve(
  __dirname,
  '../supabase/migrations/20261114160000_m6_jsa_course_session2_quiz_practice.sql'
);
const STUDENT_QUIZ_PATH = path.resolve(__dirname, '../src/app/student/lessons/[lessonId]/quiz/page.tsx');
const STUDENT_LESSON_PATH = path.resolve(__dirname, '../src/app/student/lessons/[lessonId]/page.tsx');
const CODE_HIGHLIGHT_PATH = path.resolve(__dirname, '../src/lib/code-highlight.ts');
const INLINE_MARKDOWN_PATH = path.resolve(__dirname, '../src/lib/inline-markdown.ts');

const JSA_COURSE_ID = '44444444-4444-4444-8444-444444444412';
const JSA_LESSON_2_ID = '55555555-5555-4555-8555-555555555702';

function parseJsaQuestionsFromSql(sql) {
  const questions = [];
  for (let i = 1; i <= 20; i++) {
    const id = `66666666-6666-4666-8666-6666666668${String(i).padStart(2, '0')}`;
    const pMatch = sql.match(new RegExp(`\\$JSA_P${i}\\$([\\s\\S]*?)\\$JSA_P${i}\\$`));
    const eMatch = sql.match(new RegExp(`\\$JSA_E${i}\\$([\\s\\S]*?)\\$JSA_E${i}\\$`));
    assert.ok(pMatch, `Expected $JSA_P${i}$ prompt block`);
    assert.ok(eMatch, `Expected $JSA_E${i}$ explanation block`);

    const tupleRe = new RegExp(
      `'${id}',[\\s\\S]*?\\$JSA_P${i}\\$[\\s\\S]*?\\$JSA_P${i}\\$,\\s*jsonb_build_array\\(([\\s\\S]*?)\\),\\s*(\\d+),\\s*\\$JSA_E${i}\\$[\\s\\S]*?\\$JSA_E${i}\\$,\\s*(\\d+)`
    );
    const tMatch = sql.match(tupleRe);
    assert.ok(tMatch, `Expected full INSERT tuple for question ${i} (${id})`);

    const rawOptionsBlock = tMatch[1];
    const options = [];
    const optTokenRe = /\$JSA_O\d+_\d+\$([\s\S]*?)\$JSA_O\d+_\d+\$|'((?:''|[^'])*)'/g;
    let m;
    while ((m = optTokenRe.exec(rawOptionsBlock)) !== null) {
      if (m[1] !== undefined) {
        options.push(m[1]);
      } else {
        options.push(m[2].replace(/''/g, "'"));
      }
    }
    assert.equal(options.length, 4, `Question ${i} must have exactly 4 options`);

    questions.push({
      id,
      prompt: pMatch[1],
      options,
      correctOptionIndex: Number(tMatch[2]),
      explanation: eMatch[1],
      orderIndex: Number(tMatch[3]),
    });
  }
  return questions;
}

function extractJsSnippet(promptText) {
  const m = promptText.match(/```js\r?\n([\s\S]*?)```/);
  assert.ok(m, `Expected \`\`\`js code block in prompt: ${promptText.slice(0, 60)}`);
  return m[1].trim();
}

function runJsCapturingLogs(code, promptValues = ['15']) {
  const logs = [];
  let promptIdx = 0;
  const sandbox = {
    console: {
      log: (...args) => logs.push(args.map((a) => String(a)).join(' ')),
    },
    prompt: () => promptValues[Math.min(promptIdx++, promptValues.length - 1)] ?? '',
  };
  vm.runInNewContext(code, sandbox, { timeout: 1000 });
  return logs;
}

function canParseJs(code) {
  try {
    new vm.Script(code);
    return true;
  } catch {
    return false;
  }
}

describe('JSA Course & Session 2 Quiz + Practice (JavaScript Variables, Types & Strings)', () => {
  test('1. Migration creates official JSA 14-session course, draft Session 2 with executable Practice 1 & 2, and 20 V8-verified JS quiz questions', async () => {
    const sql = await fsp.readFile(JSA_MIGRATION_PATH, 'utf8');

    assert.ok(sql.includes(`'${JSA_COURSE_ID}'`));
    assert.ok(sql.includes('JSA — Lập trình Web Nâng cao (JavaScript Advanced & Web App)'));
    assert.ok(sql.includes('FOR v_s IN 1..14 LOOP'));
    assert.ok(sql.includes(`'${JSA_LESSON_2_ID}'`));
    assert.ok(sql.includes("status = 'draft'"), 'JSA Session 2 must remain in draft status');
    assert.ok(sql.includes('has_quiz = true'));
    assert.ok(sql.includes('has_practice = true'));
    assert.ok(sql.includes("practice_mode = 'file_allowed'"));
    assert.ok(sql.includes("VALUES ('20261114160000', 'm6_jsa_course_session2_quiz_practice')"));

    // Verify Practice 1 & Practice 2 starter JS files actually execute cleanly in V8
    const matMatch = sql.match(/\$JSA_B2_PRACTICE\$([\s\S]*?)\$JSA_B2_PRACTICE\$/);
    assert.ok(matMatch);
    const practiceJsBlocks = Array.from(matMatch[1].matchAll(/```js\r?\n([\s\S]*?)```/g)).map((m) => m[1]);
    assert.equal(practiceJsBlocks.length, 2, 'Expected bai1.js and bai2.js starter blocks');
    const bai1Logs = runJsCapturingLogs(practiceJsBlocks[0]);
    assert.ok(bai1Logs.some((l) => l.includes('HELLO JSA STUDENTS!')));
    assert.ok(bai1Logs.some((l) => l.includes('Good afternoon JSA Students!')));
    const bai2Logs = runJsCapturingLogs(practiceJsBlocks[1], ['mindx', 'Hoc JS']);
    assert.ok(bai2Logs.some((l) => l.includes('MINDX')));
    assert.ok(bai2Logs.some((l) => l.includes('Tên bạn là Minh và bạn 15 tuổi.')));
    assert.ok(bai2Logs.some((l) => l.includes('6')));

    const q = parseJsaQuestionsFromSql(sql);
    assert.equal(q.length, 20);
    assert.deepEqual(
      q.map((item) => item.orderIndex),
      Array.from({ length: 20 }, (_, idx) => idx)
    );

    const jsCodeQuestions = q.filter((item) => /```js\r?\n/.test(item.prompt));
    assert.equal(jsCodeQuestions.length, 13, 'Expected 13 JSA quiz questions with fenced ```js code blocks');

    // Verify JavaScript runtime semantics of the 20 questions directly in Node V8 (vm):
    // Q1: Options A, B, C must ALL be valid JS declarations so Option D ("Tất cả các câu trên", index 3) is genuinely true
    assert.equal(q[0].correctOptionIndex, 3);
    assert.equal(canParseJs(q[0].options[0]), true, 'Q1 Option A must parse in JS');
    assert.equal(canParseJs(q[0].options[1]), true, 'Q1 Option B must parse in JS');
    assert.equal(canParseJs(q[0].options[2]), true, 'Q1 Option C must parse in JS (const initialized)');

    // Q2: console.log(typeof NaN) -> 'number'
    assert.equal(runJsCapturingLogs(extractJsSnippet(q[1].prompt))[0], q[1].options[q[1].correctOptionIndex]);

    // Q3: Primitive type among ['Object', 'Array', 'Function', 'Number'] -> 'Number' (index 3)
    assert.equal(q[2].options[q[2].correctOptionIndex], "'Number'");

    // Q4: ('b' + 'a' + + 'a' + 'a').toLowerCase() -> 'banana'
    assert.equal(runJsCapturingLogs(extractJsSnippet(q[3].prompt))[0], q[3].options[q[3].correctOptionIndex]);

    // Q5: Invalid identifier -> ONLY the chosen option fails `let <ident>;`
    const q5InvalidIndices = q[4].options
      .map((ident, idx) => (!canParseJs(`let ${ident};`) ? idx : -1))
      .filter((idx) => idx !== -1);
    assert.deepEqual(q5InvalidIndices, [q[4].correctOptionIndex]);

    // Q6: Purpose of `let` -> 'Để khai báo biến số' (index 1)
    assert.equal(q[5].options[q[5].correctOptionIndex], 'Để khai báo biến số');

    // Q7: console.log(typeof typeof 1) -> 'string'
    assert.equal(runJsCapturingLogs(extractJsSnippet(q[6].prompt))[0], q[6].options[q[6].correctOptionIndex]);

    // Q8: Invalid declaration -> ONLY the chosen option fails JS parsing
    const q8InvalidIndices = q[7].options
      .map((stmt, idx) => (!canParseJs(stmt) ? idx : -1))
      .filter((idx) => idx !== -1);
    assert.deepEqual(q8InvalidIndices, [q[7].correctOptionIndex]);

    // Q9: Unclosed string syntax error -> prompt fails parse; Option A's fix runs and prints 'Hello'
    assert.equal(canParseJs(extractJsSnippet(q[8].prompt)), false);
    assert.equal(q[8].correctOptionIndex, 0);
    const q9FixedLine = q[8].options[0].split('sửa:')[1].trim();
    assert.deepEqual(runJsCapturingLogs(`${q9FixedLine}\nconsole.log(greeting);`), ['Hello']);

    // Q10: Uninitialized const + reassignment -> prompt fails parse; Option C merges first 2 lines into `const number = 5;`
    assert.equal(canParseJs(extractJsSnippet(q[9].prompt)), false);
    assert.ok(q[9].prompt.includes('hằng số `const`'), 'Q10 prompt must specify keeping number as const');
    assert.equal(q[9].correctOptionIndex, 2);
    const q10MergedLine = q[9].options[2].split('thành:')[1].trim();
    assert.deepEqual(runJsCapturingLogs(`${q10MergedLine}\nconsole.log(number);`), ['5']);
    assert.throws(() => runJsCapturingLogs(`${q10MergedLine}\nnumber = 6;`), /TypeError/);

    // Q11: Only Option C (`const PI = 3.14;`) both parses cleanly AND throws TypeError on reassignment
    const q11ConstIndices = q[10].options
      .map((stmt, idx) => {
        if (!canParseJs(stmt)) return -1;
        try {
          runJsCapturingLogs(`${stmt}\nPI = 0;`);
          return -1;
        } catch {
          return idx;
        }
      })
      .filter((idx) => idx !== -1);
    assert.deepEqual(q11ConstIndices, [q[10].correctOptionIndex]);

    // Q12..Q16 & Q20: Direct console.log output matches chosen option
    for (const qNum of [12, 13, 14, 15, 16, 20]) {
      const item = q[qNum - 1];
      const out = runJsCapturingLogs(extractJsSnippet(item.prompt), ['15'])[0];
      assert.equal(out, item.options[item.correctOptionIndex], `Mismatch on Q${qNum}`);
    }

    // Q17: course.substring(0, 10) -> '"JavaScript"'
    const q17Out = runJsCapturingLogs(extractJsSnippet(q[16].prompt))[0];
    assert.equal(`"${q17Out}"`, q[16].options[q[16].correctOptionIndex]);

    // Q18: Both Option A and Option B output "Tên bạn là An và bạn 15 tuổi.", Option D does not -> Option C (index 2)
    const q18Setup = extractJsSnippet(q[17].prompt);
    assert.equal(runJsCapturingLogs(`${q18Setup}\n${q[17].options[0]}`)[0], 'Tên bạn là An và bạn 15 tuổi.');
    assert.equal(runJsCapturingLogs(`${q18Setup}\n${q[17].options[1]}`)[0], 'Tên bạn là An và bạn 15 tuổi.');
    assert.notEqual(runJsCapturingLogs(`${q18Setup}\n${q[17].options[3]}`)[0], 'Tên bạn là An và bạn 15 tuổi.');
    assert.equal(q[17].correctOptionIndex, 2);

    // Q19: Browser text-input dialog function -> prompt("Nhập một câu bất kỳ:"); (index 2)
    assert.ok(q[18].options[q[18].correctOptionIndex].startsWith('prompt('));

    // Confirm sanitizeBootstrapDto strips correctOptionIndex & explanation on JSA questions for students
    const sanitized = sanitizeBootstrapDto({
      currentUser: { id: 'stu_jsa_1', role: 'student', name: 'HS JSA' },
      lessons: [{ id: JSA_LESSON_2_ID, status: 'published', questions: q }],
    });
    for (const item of sanitized.lessons[0].questions) {
      assert.equal(item.correctOptionIndex, undefined);
      assert.equal(item.explanation, undefined);
    }
  });

  test('2. StudentQuizPage renders all 20 JSA questions with Antigravity JS highlighting, hides/shows/re-hides answers, and formats double-backtick explanations', async () => {
    const hlSource = await fsp.readFile(CODE_HIGHLIGHT_PATH, 'utf8');
    const hlTranspiled = ts.transpileModule(hlSource, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    });
    const hlMod = { exports: {} };
    new Function('module', 'exports', hlTranspiled.outputText)(hlMod, hlMod.exports);
    const { tokenizeCode, normalizeCodeLang, getCodeLangLabel } = hlMod.exports;

    assert.equal(getCodeLangLabel('js', 'console.log(1);'), 'JAVASCRIPT');
    assert.equal(normalizeCodeLang('text', 'var city = "Hà Nội";\nconsole.log(city.length);'), 'js');

    // Question 9 deliberate syntax error: unclosed single quote on line 1 must NOT bleed into line 2
    const q9Snippet = "let greeting = 'Hello;\nconsole.log(greeting);";
    const q9Tokens = tokenizeCode(q9Snippet, 'js');
    assert.equal(q9Tokens.map((t) => t.value).join(''), q9Snippet);
    assert.deepEqual(
      q9Tokens.filter((t) => t.kind === 'string').map((t) => t.value),
      ["'Hello;"]
    );
    assert.ok(q9Tokens.some((t) => t.kind === 'prop' && t.value === 'console'));
    assert.ok(q9Tokens.some((t) => t.kind === 'func' && t.value === 'log'));

    const sql = await fsp.readFile(JSA_MIGRATION_PATH, 'utf8');
    const parsedQuestions = parseJsaQuestionsFromSql(sql);
    const studentQuestions = parsedQuestions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      options: q.options,
    }));

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

    const prevDemoEnv = process.env.NEXT_PUBLIC_MINDX_DEMO;
    let dom = null;
    let root = null;

    try {
      process.env.NEXT_PUBLIC_MINDX_DEMO = '0';

      const STUDENT_ID = 'stu_jsa_01';
      const CLASS_ID = 'cls_jsa_01';
      const mockUser = {
        id: STUDENT_ID,
        name: 'Học sinh JSA',
        studentCode: 'JSA01',
        role: 'student',
        status: 'active',
      };

      const mockBootstrap = {
        currentUser: mockUser,
        users: [mockUser],
        students: [
          {
            id: STUDENT_ID,
            studentCode: 'JSA01',
            fullName: 'Học sinh JSA',
            currentClassId: CLASS_ID,
            originalClassId: CLASS_ID,
            status: 'active',
          },
        ],
        classes: [{ id: CLASS_ID, code: 'VT-JSA01', name: 'Lớp JSA', courseId: JSA_COURSE_ID, status: 'active' }],
        courses: [{ id: JSA_COURSE_ID, title: 'JSA', description: 'JavaScript Advanced', status: 'active' }],
        lessons: [
          {
            id: JSA_LESSON_2_ID,
            courseId: JSA_COURSE_ID,
            sessionNumber: 2,
            title: 'Buổi 2: Biến, Kiểu dữ liệu & Xử lý chuỗi trong JavaScript',
            status: 'published',
            hasQuiz: true,
            hasPractice: true,
            questions: studentQuestions,
          },
        ],
        quizResults: [],
        submissions: [],
      };

      dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
        url: 'http://localhost:3000/student/lessons/' + JSA_LESSON_2_ID + '/quiz',
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

      let submitCount = 0;
      let submittedPayload = null;
      setGlobal('fetch', async (url, opts) => {
        const target = typeof url === 'string' ? url : url?.url || '';
        const pathname = target.startsWith('http') ? new URL(target).pathname : target;
        if (pathname === '/api/m2/session') {
          return new Response(JSON.stringify({ success: true, user: mockUser }), { status: 200 });
        }
        if (pathname === '/api/m2/bootstrap') {
          return new Response(JSON.stringify({ success: true, data: mockBootstrap }), { status: 200 });
        }
        if (pathname === '/api/m2/submit-quiz' && opts?.method === 'POST') {
          submitCount++;
          submittedPayload = JSON.parse(opts.body);
          return new Response(
            JSON.stringify({
              success: true,
              score: 100,
              passed: true,
              highestScore: 100,
              attemptsCount: 1,
              message: 'Xuất sắc! Bạn đạt 100% (20/20 câu đúng).',
              answerReview: parsedQuestions.map((q) => ({
                questionId: q.id,
                correctOptionIndex: q.correctOptionIndex,
                explanation: q.explanation,
              })),
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
              usePathname: () => `/student/lessons/${JSA_LESSON_2_ID}/quiz`,
              useParams: () => ({ lessonId: JSA_LESSON_2_ID }),
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

      const ReactDOM = (await import('react-dom/client')).default;
      const { StoreProvider } = loadModule('src/lib/store.tsx');
      const StudentQuizPage = loadModule(STUDENT_QUIZ_PATH).default;

      const rootEl = dom.window.document.getElementById('root');
      root = ReactDOM.createRoot(rootEl);

      await act(async () => {
        root.render(React.createElement(StoreProvider, null, React.createElement(StudentQuizPage, null)));
      });

      const start = Date.now();
      while (Date.now() - start < 3000) {
        if ((rootEl.textContent || '').includes('Buổi 2: Biến, Kiểu dữ liệu & Xử lý chuỗi trong JavaScript')) break;
        await act(async () => {
          await new Promise((r) => setTimeout(r, 20));
        });
      }

      // 1) Before submit: 20 questions, 13 JAVASCRIPT code blocks, Q18 Option B keeps template backticks, answers hidden
      const beforeText = rootEl.textContent || '';
      assert.ok(beforeText.includes('Đã chọn 0 / 20 câu'));
      assert.ok(beforeText.includes('const myVariable = 10;'));
      assert.ok(beforeText.includes('console.log(`Tên bạn là ${name} và bạn ${age} tuổi.`);'));
      assert.equal(beforeText.includes('Đáp án đúng'), false);
      assert.equal(beforeText.includes('Giải thích:'), false);

      const codeBlocks = rootEl.querySelectorAll('pre code');
      assert.equal(codeBlocks.length, 13, 'All 13 code questions render Antigravity <CodeBlock />');
      assert.ok(beforeText.includes('JAVASCRIPT'));
      assert.ok(rootEl.querySelectorAll('.agy-tok-prop').length >= 12, 'console & properties highlighted');
      assert.ok(rootEl.querySelectorAll('.agy-tok-func').length >= 12, 'log/toLowerCase/toUpperCase/replace/substring/prompt highlighted');

      // 2) Incomplete submit blocked when only Q1 answered
      await act(async () => {
        rootEl.querySelectorAll(`input[type="radio"][name="question_${studentQuestions[0].id}"]`)[3].click();
      });
      const submitBtn = Array.from(rootEl.querySelectorAll('button')).find((b) =>
        (b.textContent || '').includes('Nộp bài chấm điểm')
      );
      await act(async () => {
        submitBtn.click();
      });
      assert.equal(submitCount, 0);
      assert.ok((rootEl.textContent || '').includes('còn 19 câu chưa chọn'));

      // 3) Answer all 20 questions & submit -> shows 100%, Đáp án đúng, and all 20 explanations including Q18 `...${biến}...`
      await act(async () => {
        parsedQuestions.forEach((q) => {
          const radios = rootEl.querySelectorAll(`input[type="radio"][name="question_${q.id}"]`);
          radios[q.correctOptionIndex].click();
        });
      });
      await act(async () => {
        submitBtn.click();
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 400));
      });

      assert.equal(submitCount, 1);
      assert.equal(submittedPayload.answers.length, 20);
      assert.deepEqual(
        submittedPayload.answers,
        parsedQuestions.map((q) => q.correctOptionIndex)
      );
      const afterSubmitText = rootEl.textContent || '';
      assert.ok(afterSubmitText.includes('100%'));
      assert.ok(afterSubmitText.includes('Đáp án đúng'));
      assert.ok(afterSubmitText.includes('Giải thích:'));
      assert.equal(afterSubmitText.includes('``'), false, 'Double-backtick delimiter must not leak raw `` into text');
      const inlineCodes = Array.from(rootEl.querySelectorAll('code')).map((el) => el.textContent);
      assert.ok(
        inlineCodes.includes('`...${biến}...`'),
        'Q18 explanation renders Template String backticks cleanly inside an inline <code> pill'
      );

      // 4) Clicking "Làm lại lần nữa" hides all answers & explanations again
      const retryBtn = Array.from(rootEl.querySelectorAll('button')).find((b) =>
        (b.textContent || '').includes('Làm lại lần nữa')
      );
      assert.ok(retryBtn);
      await act(async () => {
        retryBtn.click();
      });
      const afterRetryText = rootEl.textContent || '';
      assert.equal(afterRetryText.includes('Đáp án đúng'), false);
      assert.equal(afterRetryText.includes('Giải thích:'), false);
      assert.ok(afterRetryText.includes('Đã chọn 0 / 20 câu'));
    } finally {
      if (root) {
        try {
          await act(async () => {
            root.unmount();
          });
        } catch {}
      }
      restoreGlobals();
      if (dom) {
        try {
          dom.window.close();
        } catch {}
      }
      if (prevDemoEnv === undefined) delete process.env.NEXT_PUBLIC_MINDX_DEMO;
      else process.env.NEXT_PUBLIC_MINDX_DEMO = prevDemoEnv;
    }
  });

  test('3. StudentLessonDetailPage renders JSA Session 2 summary tables, Practice 1 (bai1.js) & Practice 2 (bai2.js) without HTML iframe, gates draft, and restores globals on setup error', async () => {
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

    const sql = await fsp.readFile(JSA_MIGRATION_PATH, 'utf8');
    const matMatch = sql.match(/\$JSA_B2_PRACTICE\$([\s\S]*?)\$JSA_B2_PRACTICE\$/);
    assert.ok(matMatch, 'Expected $JSA_B2_PRACTICE$ materials block');
    const actualMaterials = matMatch[1];

    const prevWindowDesc = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const prevDemoEnv = process.env.NEXT_PUBLIC_MINDX_DEMO;
    let dom = null;
    let root = null;

    try {
      process.env.NEXT_PUBLIC_MINDX_DEMO = '0';

      const ADMIN_USER = {
        id: 'adm_jsa_01',
        name: 'Admin MindX',
        email: 'admin@mindx.local',
        role: 'admin',
        status: 'active',
      };
      const STUDENT_USER = {
        id: 'stu_jsa_01',
        name: 'Học sinh JSA',
        studentCode: 'JSA01',
        role: 'student',
        status: 'active',
      };

      let activeMockUser = ADMIN_USER;
      const makeBootstrap = () => ({
        currentUser: activeMockUser,
        users: [ADMIN_USER, STUDENT_USER],
        students: [],
        classes: [],
        courses: [{ id: JSA_COURSE_ID, title: 'JSA', description: 'JavaScript Advanced', status: 'active' }],
        lessons: [
          {
            id: JSA_LESSON_2_ID,
            courseId: JSA_COURSE_ID,
            sessionNumber: 2,
            title: 'Buổi 2: Biến, Kiểu dữ liệu & Xử lý chuỗi trong JavaScript',
            description: 'Biến, kiểu dữ liệu nguyên thủy, xử lý chuỗi, 20 câu Quiz và Thực hành Đề 1 & 2.',
            materials: actualMaterials,
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

      dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
        url: 'http://localhost:3000/student/lessons/' + JSA_LESSON_2_ID,
        pretendToBeVisual: true,
      });
      dom.window.scrollTo = () => {};

      let copiedClipboardText = null;
      Object.defineProperty(dom.window.navigator, 'clipboard', {
        value: {
          writeText: (txt) => {
            copiedClipboardText = txt;
            return Promise.resolve();
          },
        },
        configurable: true,
      });

      setGlobal('navigator', dom.window.navigator);
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
              usePathname: () => `/student/lessons/${JSA_LESSON_2_ID}`,
              useParams: () => ({ lessonId: JSA_LESSON_2_ID }),
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

      // 1) Admin preview sees draft banner, 2 summary tables, Practice 1 & 2 JAVASCRIPT blocks, and submission UI
      root = createRoot(rootEl);
      await act(async () => {
        root.render(React.createElement(StoreProvider, null, React.createElement(StudentLessonDetailPage)));
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 150));
      });

      const fullText = rootEl.textContent || '';
      assert.ok(fullText.includes('Đang ở trạng thái Bản nháp'));
      assert.ok(fullText.includes('BÀI THỰC HÀNH ĐỀ BÀI 1: KHAI BÁO BIẾN & XỬ LÝ CHUỖI (bai1.js)'));
      assert.ok(fullText.includes('BÀI THỰC HÀNH ĐỀ BÀI 2: TƯƠNG TÁC CHUỖI & NỐI CHUỖI (bai2.js)'));
      assert.ok(fullText.includes('Mã nguồn (JAVASCRIPT)'));
      assert.equal(fullText.includes(':---'), false);
      assert.equal(fullText.includes('``'), false, 'Double-backtick inline code must not render raw ``');

      const tables = rootEl.querySelectorAll('table');
      assert.equal(tables.length, 2, 'Expected 2 GFM tables (var/let/const & string/prompt reference)');

      const codeBlocks = rootEl.querySelectorAll('pre code');
      assert.equal(codeBlocks.length, 2, 'Expected 2 JAVASCRIPT code blocks (bai1.js and bai2.js)');
      assert.ok((codeBlocks[0].textContent || '').includes('var city = "Hà Nội";'));
      assert.ok((codeBlocks[1].textContent || '').includes('let sampleStr = "Lập trình Web Developer";'));
      assert.ok(codeBlocks[0].querySelectorAll('.agy-tok-keyword').length >= 6);
      assert.ok(codeBlocks[0].querySelectorAll('.agy-tok-prop').length >= 5);
      assert.ok(codeBlocks[1].querySelectorAll('.agy-tok-func').length >= 6);
      assert.equal(rootEl.querySelectorAll('iframe').length, 0, 'JS code blocks must never mount an HTML iframe');

      const copyButtons = Array.from(rootEl.querySelectorAll('button')).filter((b) =>
        (b.textContent || '').includes('Sao chép code')
      );
      assert.equal(copyButtons.length, 2);
      await act(async () => {
        copyButtons[0].click();
      });
      assert.ok(copiedClipboardText.startsWith('// ĐỀ BÀI 1: Khai báo biến'));
      assert.ok(fullText.includes('3. Nộp bài thực hành'));

      await act(async () => {
        root.unmount();
      });
      root = null;

      // 2) Student role is blocked while JSA Session 2 remains in draft
      activeMockUser = STUDENT_USER;
      root = createRoot(rootEl);
      await act(async () => {
        root.render(React.createElement(StoreProvider, null, React.createElement(StudentLessonDetailPage)));
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 150));
      });
      const studentText = rootEl.textContent || '';
      assert.ok(studentText.includes('Bài học chưa xuất bản'));
      assert.equal(studentText.includes('BÀI THỰC HÀNH ĐỀ BÀI 1'), false);
    } finally {
      if (root) {
        try {
          await act(async () => {
            root.unmount();
          });
        } catch {}
      }
      restoreGlobals();
      if (dom) {
        try {
          dom.window.close();
        } catch {}
      }
      if (prevDemoEnv === undefined) delete process.env.NEXT_PUBLIC_MINDX_DEMO;
      else process.env.NEXT_PUBLIC_MINDX_DEMO = prevDemoEnv;
    }

    assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, 'window'), prevWindowDesc);
    assert.equal(process.env.NEXT_PUBLIC_MINDX_DEMO, prevDemoEnv);
  });

  test('3b. Inline markdown & fenced code parser run in strict O(N) linear time on adversarial inputs', async () => {
    const mdSource = await fsp.readFile(INLINE_MARKDOWN_PATH, 'utf8');
    const transpiled = ts.transpileModule(mdSource, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    });
    const mod = { exports: {} };
    new Function('module', 'exports', transpiled.outputText)(mod, mod.exports);
    const { tokenizeInlineMarkdown, parseFencedCodeBlocks, trimCodeBlockContent } = mod.exports;

    // Correctness on nested bold + code, double backticks, safe vs unsafe links, and unclosed outer bracket
    const richTokens = tokenizeInlineMarkdown(
      'Xem **`bai1.js`**, `` `...${biến}...` ``, [ngoài [Tài liệu](https://developer.mozilla.org), và [XSS](javascript:alert(1))',
      { allowBold: true, allowLinks: true }
    );
    assert.ok(richTokens.some((t) => t.kind === 'bold' && t.children.some((c) => c.kind === 'code' && c.value === 'bai1.js')));
    assert.ok(richTokens.some((t) => t.kind === 'code' && t.value === '`...${biến}...`'));
    assert.ok(richTokens.some((t) => t.kind === 'link' && t.label === 'Tài liệu' && t.href === 'https://developer.mozilla.org'));
    assert.equal(richTokens.some((t) => t.kind === 'link' && t.href.startsWith('javascript:')), false);

    // Strict O(N) timing checks across 64k+ adversarial inputs (must complete in milliseconds, never quadratic)
    const t0 = Date.now();
    const unclosedBrackets = tokenizeInlineMarkdown('[a'.repeat(32000), { allowBold: true, allowLinks: true });
    assert.equal(unclosedBrackets.length, 1);
    const unclosedLinkParens = tokenizeInlineMarkdown('[a](b'.repeat(16000) + ')', { allowBold: true, allowLinks: true });
    assert.ok(unclosedLinkParens.length >= 1);
    const unclosedBoldStars = tokenizeInlineMarkdown('**a*b'.repeat(16000), { allowBold: true, allowLinks: true });
    assert.equal(unclosedBoldStars.length, 1);
    const repeatedAdjacentStars = tokenizeInlineMarkdown('**a*'.repeat(16000), { allowBold: true, allowLinks: true });
    assert.ok(repeatedAdjacentStars.length >= 1);
    const unclosedDoubleTicks = tokenizeInlineMarkdown('``a' + '```b'.repeat(12000), { allowBold: true, allowLinks: true });
    assert.equal(unclosedDoubleTicks.length, 1);
    const trimmedSpaces = trimCodeBlockContent('\r\n    const x = 1;' + ' '.repeat(64000) + 'y   \r\n');
    assert.ok(trimmedSpaces.startsWith('    const x = 1;'));
    assert.ok(trimmedSpaces.endsWith('y'));
    const fencedAdversarial = parseFencedCodeBlocks(
      '```js\n' + ' '.repeat(64000) + 'console.log(1);\n```\n' + '```unclosed\n' + 'x'.repeat(32000),
      { trimTextBlocks: true }
    );
    assert.equal(fencedAdversarial.length, 2);
    assert.equal(fencedAdversarial[0].type, 'code');
    assert.ok(Date.now() - t0 < 250, 'All 64k adversarial markdown inputs must parse in strict linear O(N) time (< 250ms)');
  });

  test('4. Real PostgreSQL engine executes JSA Session 2 migration idempotently and scores all 20 quiz questions via m3_submit_quiz_attempt', async (t) => {
    const { initdb, pgCtl, psql, skipReason } = resolvePostgresBinaries();
    if (skipReason) {
      t.skip(skipReason);
      return;
    }

    const port = await getFreeLocalPort();
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mindx-jsa-pg-'));
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

      // Apply base explanation/RPC migrations + JSA Session 2 migration TWICE to verify full idempotency
      runPsqlFile(PTI_BASE_MIGRATION_PATH);
      runPsqlFile(ATOMIC_RPC_MIGRATION_PATH);
      runPsqlFile(JSA_MIGRATION_PATH);
      runPsqlFile(JSA_MIGRATION_PATH);

      const verifySql = `
DO $$
DECLARE
  v_course_id CONSTANT UUID := '44444444-4444-4444-8444-444444444412';
  v_lesson_id CONSTANT UUID := '55555555-5555-4555-8555-555555555702';
  v_admin_id CONSTANT UUID := '11111111-1111-4111-8111-000000000012';
  v_class_id CONSTANT UUID := '22222222-2222-4222-8222-000000000012';
  v_student_id CONSTANT UUID := '33333333-3333-4333-8333-000000000012';
  v_count INT;
  v_err TEXT;
  v_expected_ids TEXT[];
  v_correct_answers INT[];
  v_wrong_answers INT[];
  v_res RECORD;
BEGIN
  SELECT count(*)::INT INTO v_count
  FROM supabase_migrations.schema_migrations
  WHERE version = '20261114160000' AND name = 'm6_jsa_course_session2_quiz_practice';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Migration 20261114160000 missing from schema_migrations';
  END IF;

  SELECT count(*)::INT INTO v_count
  FROM public.lessons
  WHERE course_id = v_course_id AND status = 'draft';
  IF v_count <> 14 THEN
    RAISE EXCEPTION 'Expected all 14 JSA sessions in draft state, got %', v_count;
  END IF;

  SELECT
    array_agg(q.id::text ORDER BY q.order_index ASC, q.id ASC),
    array_agg(q.correct_option_index ORDER BY q.order_index ASC, q.id ASC),
    array_agg(((q.correct_option_index + 1) % 4) ORDER BY q.order_index ASC, q.id ASC)
  INTO v_expected_ids, v_correct_answers, v_wrong_answers
  FROM public.quiz_questions q
  WHERE q.lesson_id = v_lesson_id;

  IF array_length(v_expected_ids, 1) <> 20 THEN
    RAISE EXCEPTION 'Expected 20 JSA quiz questions, got %', array_length(v_expected_ids, 1);
  END IF;

  INSERT INTO public.profiles (id, role, full_name, email, status)
  VALUES
    (v_admin_id, 'admin', 'Admin JSA', 'admin.jsa@test.local', 'active'),
    (v_student_id, 'student', 'Student JSA', 'student.jsa@test.local', 'active');

  INSERT INTO public.classes (id, code, name, course_id, status)
  VALUES (v_class_id, 'JSA-TEST-01', 'Lớp JSA Test', v_course_id, 'active');

  INSERT INTO public.students (id, participant_id, student_code, full_name, current_class_id, original_class_id, status)
  VALUES (v_student_id, 'P-JSA-01', 'STU-JSA-01', 'Student JSA', v_class_id, v_class_id, 'active');

  -- Draft blocks student submission
  v_err := NULL;
  BEGIN
    PERFORM * FROM public.m3_submit_quiz_attempt(v_student_id, v_lesson_id, v_correct_answers, v_expected_ids);
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  IF COALESCE(v_err, '') NOT LIKE 'FORBIDDEN:%' THEN
    RAISE EXCEPTION 'Draft JSA Session 2 must reject student quiz submission, got: %', COALESCE(v_err, '<none>');
  END IF;

  -- Publish preserving materials & 20 quiz questions via NULL::jsonb
  PERFORM public.m3_update_lesson(
    v_admin_id, v_lesson_id,
    'Buổi 2: Biến, Kiểu dữ liệu & Xử lý chuỗi trong JavaScript',
    'Mô tả JSA Buổi 2',
    (SELECT materials FROM public.lessons WHERE id = v_lesson_id),
    '',
    'published', true, true, 'file_allowed', NULL::jsonb
  );

  EXECUTE 'SET LOCAL ROLE service_role';
  SELECT s.score, s.passed, s.highest_score, s.attempts_count, jsonb_array_length(s.answer_review) AS review_len
  INTO v_res
  FROM public.m3_submit_quiz_attempt(v_student_id, v_lesson_id, v_correct_answers, v_expected_ids) AS s;
  EXECUTE 'RESET ROLE';

  IF v_res.score <> 100 OR v_res.passed IS DISTINCT FROM true OR v_res.highest_score <> 100 OR v_res.attempts_count <> 1 OR v_res.review_len <> 20 THEN
    RAISE EXCEPTION 'Expected 100/true/100/1/20 on JSA Session 2 quiz, got %,%,%,%,%',
      v_res.score, v_res.passed, v_res.highest_score, v_res.attempts_count, v_res.review_len;
  END IF;

  -- Retry with wrong answers preserves highest_score = 100
  EXECUTE 'SET LOCAL ROLE service_role';
  SELECT s.score, s.passed, s.highest_score, s.attempts_count
  INTO v_res
  FROM public.m3_submit_quiz_attempt(v_student_id, v_lesson_id, v_wrong_answers, v_expected_ids) AS s;
  EXECUTE 'RESET ROLE';

  IF v_res.score <> 0 OR v_res.passed IS DISTINCT FROM false OR v_res.highest_score <> 100 OR v_res.attempts_count <> 2 THEN
    RAISE EXCEPTION 'Expected 0/false/100/2 on JSA retry, got %,%,%,%',
      v_res.score, v_res.passed, v_res.highest_score, v_res.attempts_count;
  END IF;
END $$;
SELECT 'JSA_PG_VERIFY_OK';
`;
      fs.writeFileSync(verifySqlPath, verifySql, 'utf8');
      const verifyOutput = runPsqlFile(verifySqlPath, ['-t', '-A']);
      assert.ok(verifyOutput.includes('JSA_PG_VERIFY_OK'), `Unexpected psql verify output: ${verifyOutput}`);
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
