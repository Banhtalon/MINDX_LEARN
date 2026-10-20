import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';

const savedGlobals = new Map();
function setGlobal(key, val) {
  if (!savedGlobals.has(key)) {
    savedGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }
  Object.defineProperty(globalThis, key, { value: val, configurable: true, writable: true });
}
function restoreGlobals() {
  for (const [key, desc] of savedGlobals.entries()) {
    if (desc === undefined) delete globalThis[key];
    else Object.defineProperty(globalThis, key, desc);
  }
  savedGlobals.clear();
}

function setupDomGlobals(dom) {
  setGlobal('window', dom.window);
  setGlobal('document', dom.window.document);
  setGlobal('HTMLElement', dom.window.HTMLElement);
  setGlobal('HTMLInputElement', dom.window.HTMLInputElement);
  setGlobal('HTMLButtonElement', dom.window.HTMLButtonElement);
  setGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
  setGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));
  setGlobal('cancelAnimationFrame', (id) => clearTimeout(id));
  setGlobal('IS_REACT_ACT_ENVIRONMENT', true);
}

const moduleCache = new Map();
function loadModule(filePath) {
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
        usePathname: () => '/student',
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
}

// Joined DTO fixtures
const STUDENT_ID = 'stu_rob_01';
const CLASS_ID = 'cls_rob_01';
const COURSE_ID = 'crs_rob_k14';
const LESSON_ID = 'les_rob_01';

const mockUser = {
  id: STUDENT_ID,
  name: 'Học sinh Robotics',
  studentCode: 'ROB01',
  role: 'student',
  status: 'active',
};

const mockBootstrap = {
  currentUser: mockUser,
  users: [mockUser],
  students: [
    {
      id: STUDENT_ID,
      studentCode: 'ROB01',
      fullName: 'Học sinh Robotics',
      currentClassId: CLASS_ID,
      originalClassId: CLASS_ID,
      status: 'active',
    },
  ],
  classes: [
    {
      id: CLASS_ID,
      code: 'ROB-K14',
      name: 'Lớp Robotics K14',
      courseId: COURSE_ID,
      status: 'active',
    },
  ],
  courses: [
    {
      id: COURSE_ID,
      title: 'Robotics K14',
      description: 'Khóa học Robotics',
      status: 'active',
    },
  ],
  lessons: [
    {
      id: LESSON_ID,
      courseId: COURSE_ID,
      sessionNumber: 1,
      title: 'Bài 1: Cảm biến và Động cơ',
      status: 'published',
      hasQuiz: false,
      hasPractice: false,
    },
  ],
  quizResults: [],
  submissions: [],
};

test('StoreProvider bootstraps live session and renders student dashboard with Robotics K14', async () => {
  const prevDemoEnv = process.env.NEXT_PUBLIC_MINDX_DEMO;
  process.env.NEXT_PUBLIC_MINDX_DEMO = '0';

  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost:3000',
    pretendToBeVisual: true,
  });

  setupDomGlobals(dom);

  setGlobal('fetch', async (url) => {
    const target = typeof url === 'string' ? url : url?.url || '';
    const pathname = target.startsWith('http') ? new URL(target).pathname : target;
    if (pathname === '/api/m2/session') {
      return new Response(JSON.stringify({ success: true, user: mockUser }), { status: 200 });
    }
    if (pathname === '/api/m2/bootstrap') {
      return new Response(JSON.stringify({ success: true, data: mockBootstrap }), { status: 200 });
    }
    throw new Error(`Unexpected fetch URL: ${target}`);
  });

  let root = null;
  try {
    const ReactDOM = (await import('react-dom/client')).default;
    const { StoreProvider } = loadModule('src/lib/store.tsx');
    const StudentDashboardPage = loadModule('src/app/student/page.tsx').default;

    const rootEl = dom.window.document.getElementById('root');
    root = ReactDOM.createRoot(rootEl);

    await act(async () => {
      root.render(React.createElement(StoreProvider, null, React.createElement(StudentDashboardPage, null)));
    });

    // Wait until live session & bootstrap settle in real DOM
    const start = Date.now();
    while (Date.now() - start < 3000) {
      if (rootEl.textContent.includes('Robotics K14') && rootEl.textContent.includes('Bài 1: Cảm biến và Động cơ')) {
        break;
      }
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    }

    const text = rootEl.textContent || '';
    assert.ok(text.includes('Robotics K14'), 'Settled DOM must show Robotics K14');
    assert.ok(text.includes('Bài 1: Cảm biến và Động cơ'), 'Settled DOM must show published lesson');
    assert.equal(text.includes('Lớp chưa được gán khóa học'), false, 'Must not show unassigned warning');
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

test('logout race: late bootstrap response does not restore session or course content', async () => {
  const prevDemoEnv = process.env.NEXT_PUBLIC_MINDX_DEMO;
  process.env.NEXT_PUBLIC_MINDX_DEMO = '0';

  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost:3000',
    pretendToBeVisual: true,
  });

  setupDomGlobals(dom);

  let resolveBootstrap;
  const bootstrapPromise = new Promise((resolve) => {
    resolveBootstrap = resolve;
  });

  setGlobal('fetch', async (url, opts) => {
    const target = typeof url === 'string' ? url : url?.url || '';
    const pathname = target.startsWith('http') ? new URL(target).pathname : target;
    if (pathname === '/api/m2/session') {
      return new Response(JSON.stringify({ success: true, user: mockUser }), { status: 200 });
    }
    if (pathname === '/api/m2/bootstrap') {
      return bootstrapPromise;
    }
    if (pathname === '/api/m2/logout' && opts?.method === 'POST') {
      return new Response(JSON.stringify({ success: true, message: 'Đăng xuất thành công.' }), { status: 200 });
    }
    throw new Error(`Unexpected fetch URL in logout race test: ${target}`);
  });

  let probeStore = null;
  let root = null;
  try {
    const ReactDOM = (await import('react-dom/client')).default;
    const { StoreProvider, useStore } = loadModule('src/lib/store.tsx');
    const StudentDashboardPage = loadModule('src/app/student/page.tsx').default;

    function StoreProbe() {
      probeStore = useStore();
      return null;
    }

    const rootEl = dom.window.document.getElementById('root');
    root = ReactDOM.createRoot(rootEl);

    // Initial mount establishing Session A while bootstrap is held pending
    await act(async () => {
      root.render(
        React.createElement(
          StoreProvider,
          null,
          React.createElement(StoreProbe, null),
          React.createElement(StudentDashboardPage, null)
        )
      );
    });

    // Session A is active
    assert.equal(probeStore?.currentUser?.id, STUDENT_ID);

    // Trigger real logout while bootstrap A is still pending
    await act(async () => {
      await probeStore.logout();
    });

    // Assert logged-out state
    assert.equal(probeStore.currentUser, null);
    assert.equal(rootEl.textContent.includes('Robotics K14'), false);

    // Resolve old pending bootstrap A with original mockBootstrap payload (currentUser is Student A)
    await act(async () => {
      resolveBootstrap(new Response(JSON.stringify({ success: true, data: mockBootstrap }), { status: 200 }));
      await new Promise((r) => setTimeout(r, 20));
    });

    // Assert state remains logged out, domain lists remain empty, and DOM has no course or lesson content
    assert.equal(probeStore.currentUser, null);
    assert.deepEqual(probeStore.students, []);
    assert.deepEqual(probeStore.classes, []);
    assert.deepEqual(probeStore.courses, []);
    assert.deepEqual(probeStore.lessons, []);
    assert.deepEqual(probeStore.users, []);
    assert.deepEqual(probeStore.quizResults, []);
    assert.deepEqual(probeStore.submissions, []);
    assert.equal(rootEl.textContent.includes('Robotics K14'), false);
    assert.equal(rootEl.textContent.includes('Bài 1: Cảm biến và Động cơ'), false);
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
