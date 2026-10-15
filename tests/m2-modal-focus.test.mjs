/**
 * Regression & Accessibility Test Suite for Dialog A11y & Focus Management (Milestone 2)
 *
 * Verifies:
 * 1. Typing in inputs (e.g. Forgot Password modal) retains focus and cursor across caller re-renders
 *    with inline onClose callbacks, asserting React-controlled state & render counter update on every character.
 * 2. Escape key always invokes the latest committed onClose callback without stale closures.
 * 3. Tab and Shift+Tab wrap focus strictly inside dialog; closing restores focus to opener.
 * 4. Drawer and ConfirmDialog share useDialogA11y and restore opener focus upon closing.
 *
 * Exercises actual production Modal, Drawer, ConfirmDialog transpiled from src/components/modal.tsx
 * in existing jsdom/React runtime. No copied hook or implementation.
 */

import { describe, test, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import React, { act, useState } from 'react';

// Track original descriptors for clean teardown restoration
const savedDescriptors = new Map();

function setGlobal(key, val) {
  if (!savedDescriptors.has(key)) {
    savedDescriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }
  Object.defineProperty(globalThis, key, {
    value: val,
    configurable: true,
    writable: true,
    enumerable: true,
  });
}

function restoreGlobals() {
  for (const [key, desc] of savedDescriptors.entries()) {
    if (desc === undefined) {
      delete globalThis[key];
    } else {
      Object.defineProperty(globalThis, key, desc);
    }
  }
  savedDescriptors.clear();
}

// 1. Initialize JSDOM and mock layout/offsetParent strictly in test environment
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:3000',
  pretendToBeVisual: true,
});

// Mock offsetParent on HTMLElement prototype for JSDOM so production filter offsetParent!==null works
Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetParent', {
  get() {
    if (!this.isConnected) return null;
    if (this.hidden) return null;
    const style = dom.window.getComputedStyle(this);
    if (style.display === 'none' || style.visibility === 'hidden') return null;
    return this.parentElement || dom.window.document.body;
  },
  configurable: true,
});

// Apply globals to globalThis (Node 24 navigator is read-only getter, do NOT overwrite)
setGlobal('window', dom.window);
setGlobal('document', dom.window.document);
setGlobal('HTMLElement', dom.window.HTMLElement);
setGlobal('HTMLInputElement', dom.window.HTMLInputElement);
setGlobal('HTMLButtonElement', dom.window.HTMLButtonElement);
setGlobal('KeyboardEvent', dom.window.KeyboardEvent);
setGlobal('Event', dom.window.Event);
setGlobal('CustomEvent', dom.window.CustomEvent);
setGlobal('Node', dom.window.Node);
setGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
setGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));
setGlobal('cancelAnimationFrame', (id) => clearTimeout(id));
setGlobal('IS_REACT_ACT_ENVIRONMENT', true);

// 2. Import react-dom/client dynamically AFTER DOM globals are established
const ReactDOMClient = (await import('react-dom/client')).default;

// 3. Transpile production modal.tsx into CommonJS executable in-memory
const modalTsxPath = path.resolve('src/components/modal.tsx');
assert.ok(fs.existsSync(modalTsxPath), 'src/components/modal.tsx must exist');
const modalSource = fs.readFileSync(modalTsxPath, 'utf8');

const transpiled = ts.transpileModule(modalSource, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.React,
    esModuleInterop: true,
  },
  fileName: 'modal.tsx',
});

function loadProductionModule() {
  const customRequire = (specifier) => {
    if (specifier === 'react') return React;
    if (specifier === './icons') {
      return {
        IconX: (props) => React.createElement('svg', { 'data-testid': 'icon-x', ...props }),
        IconAlertTriangle: (props) => React.createElement('svg', { 'data-testid': 'icon-alert', ...props }),
        IconInfo: (props) => React.createElement('svg', { 'data-testid': 'icon-info', ...props }),
      };
    }
    throw new Error(`Unexpected import in modal.tsx: ${specifier}`);
  };

  const moduleObj = { exports: {} };
  const runner = new Function('require', 'module', 'exports', transpiled.outputText);
  runner(customRequire, moduleObj, moduleObj.exports);
  return moduleObj.exports;
}

const { Modal, Drawer, ConfirmDialog } = loadProductionModule();

assert.equal(typeof Modal, 'function', 'Modal must be exported');
assert.equal(typeof Drawer, 'function', 'Drawer must be exported');
assert.equal(typeof ConfirmDialog, 'function', 'ConfirmDialog must be exported');

// Helper to trigger native value setter so React controlled input tracker fires real onChange
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  dom.window.HTMLInputElement.prototype,
  'value'
).set;

// Test suite mounting harness
let rootContainer = null;
let reactRoot = null;

describe('M2 Modal A11y & Focus Management Regressions', () => {
  beforeEach(() => {
    dom.window.document.body.innerHTML = '<div id="root"></div>';
    rootContainer = dom.window.document.getElementById('root');
    reactRoot = ReactDOMClient.createRoot(rootContainer);
  });

  afterEach(() => {
    if (reactRoot) {
      act(() => {
        reactRoot.unmount();
      });
      reactRoot = null;
    }
    dom.window.document.body.innerHTML = '';
  });

  after(() => {
    restoreGlobals();
  });

  test('Rerender with inline onClose callback while typing retains focus and input value (Forgot Password modal bugfix)', async () => {
    let renderCount = 0;

    // Replicates exact pattern from src/app/login/page.tsx:
    // Opener button opens modal; modal has inline onClose; input updates state on each keystroke
    function TestLoginPageSimulation() {
      const [isOpen, setIsOpen] = useState(false);
      const [email, setEmail] = useState('');
      renderCount += 1;

      return React.createElement(
        'div',
        null,
        React.createElement(
          'button',
          {
            id: 'forgot-password-opener',
            type: 'button',
            onClick: () => setIsOpen(true),
          },
          'Quên mật khẩu?'
        ),
        React.createElement('span', { id: 'render-counter' }, `Renders: ${renderCount}`),
        React.createElement(
          Modal,
          {
            isOpen,
            // Inline callback recreated on EVERY render, exactly as in LoginPage
            onClose: () => setIsOpen(false),
            title: 'Quên mật khẩu Giáo viên / Admin',
          },
          React.createElement(
            'form',
            { onSubmit: (e) => e.preventDefault() },
            React.createElement(
              'label',
              { htmlFor: 'forgot-password-email' },
              'Email đăng ký'
            ),
            React.createElement('input', {
              id: 'forgot-password-email',
              type: 'email',
              value: email,
              onChange: (e) => setEmail(e.target.value),
            }),
            React.createElement(
              'button',
              { type: 'button', onClick: () => setIsOpen(false) },
              'Đóng'
            )
          )
        )
      );
    }

    // 1. Initial render
    await act(async () => {
      reactRoot.render(React.createElement(TestLoginPageSimulation));
    });

    const opener = dom.window.document.getElementById('forgot-password-opener');
    assert.ok(opener, 'Opener button should be rendered');

    // 2. Focus opener and click to open modal
    opener.focus();
    assert.equal(dom.window.document.activeElement, opener);

    await act(async () => {
      opener.click();
    });

    // Modal is now open
    const emailInput = dom.window.document.getElementById('forgot-password-email');
    assert.ok(emailInput, 'Email input should be rendered inside open modal');

    // Focus into email input
    emailInput.focus();
    assert.equal(dom.window.document.activeElement, emailInput, 'Email input should receive focus');

    // 3. Type text into email input character-by-character
    // Use native value setter + real bubbling input event to trigger React controlled value tracker
    const typingSequence = 'admin';
    let currentVal = '';

    for (const char of typingSequence) {
      currentVal += char;
      const rendersBefore = renderCount;

      await act(async () => {
        nativeInputValueSetter.call(emailInput, currentVal);
        const event = new dom.window.Event('input', { bubbles: true, cancelable: true });
        emailInput.dispatchEvent(event);
      });

      // Assert that React-controlled state and render counter actually updated
      assert.ok(
        renderCount > rendersBefore,
        `Component MUST re-render on character "${char}" (before: ${rendersBefore}, after: ${renderCount})`
      );

      // CRITICAL ASSERTION: Focus must remain on the email input, NEVER jump to the close button!
      assert.equal(
        dom.window.document.activeElement,
        emailInput,
        `Active element should remain emailInput after typing "${char}", but got: ${dom.window.document.activeElement?.outerHTML}`
      );
      assert.equal(emailInput.value, currentVal);
    }

    assert.equal(emailInput.value, 'admin', 'Final value in input must match typed string');
  });

  test('Escape key always invokes the LATEST committed onClose callback without stale closure', async () => {
    let closedCount = 0;
    let closedWithPayload = null;

    function TestDynamicCallbackModal() {
      const [isOpen, setIsOpen] = useState(true);
      const [step, setStep] = useState(1);

      // Expose state updater to test
      dom.window.__advanceStep = () => setStep((s) => s + 1);

      return React.createElement(
        Modal,
        {
          isOpen,
          // Inline callback capturing latest committed "step" state
          onClose: () => {
            closedCount += 1;
            closedWithPayload = step;
            setIsOpen(false);
          },
          title: 'Dynamic Callback Test',
        },
        React.createElement('span', null, `Current step: ${step}`)
      );
    }

    await act(async () => {
      reactRoot.render(React.createElement(TestDynamicCallbackModal));
    });

    // Advance step from 1 -> 2 -> 3 (re-renders component with new inline callback instances)
    await act(async () => {
      dom.window.__advanceStep();
    });
    await act(async () => {
      dom.window.__advanceStep();
    });

    // Trigger Escape key
    await act(async () => {
      const escEvent = new dom.window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      dom.window.document.dispatchEvent(escEvent);
      assert.equal(escEvent.defaultPrevented, true, 'Escape key should preventDefault()');
    });

    assert.equal(closedCount, 1, 'onClose should be called exactly once');
    assert.equal(closedWithPayload, 3, 'onClose must invoke the latest committed callback capturing step = 3');
  });

  test('Tab and Shift+Tab wrap focus strictly inside dialog, and closing restores focus to opener', async () => {
    function TestFocusTrapModal() {
      const [isOpen, setIsOpen] = useState(false);

      return React.createElement(
        'div',
        null,
        React.createElement(
          'button',
          {
            id: 'open-trap-btn',
            type: 'button',
            onClick: () => setIsOpen(true),
          },
          'Mở Modal'
        ),
        React.createElement(
          Modal,
          {
            isOpen,
            onClose: () => setIsOpen(false),
            title: 'Focus Trap Test',
          },
          React.createElement('input', { id: 'trap-input-1', type: 'text' }),
          React.createElement('input', { id: 'trap-input-2', type: 'text' }),
          React.createElement('button', { id: 'trap-last-btn', type: 'button' }, 'Xong')
        )
      );
    }

    await act(async () => {
      reactRoot.render(React.createElement(TestFocusTrapModal));
    });

    const openerBtn = dom.window.document.getElementById('open-trap-btn');
    openerBtn.focus();
    assert.equal(dom.window.document.activeElement, openerBtn);

    // Open modal
    await act(async () => {
      openerBtn.click();
    });

    const closeBtn = dom.window.document.querySelector('button[aria-label="Đóng cửa sổ"]');
    const input1 = dom.window.document.getElementById('trap-input-1');
    const lastBtn = dom.window.document.getElementById('trap-last-btn');

    assert.ok(closeBtn, 'Close button should exist');
    assert.ok(input1, 'Input 1 should exist');
    assert.ok(lastBtn, 'Last button should exist');

    // Initial focus went to first focusable (close button)
    assert.equal(dom.window.document.activeElement, closeBtn, 'Initial focus should be on close button');

    // 1. Tab wrap: Focus on last focusable element, press Tab -> should wrap to first element (closeBtn)
    lastBtn.focus();
    assert.equal(dom.window.document.activeElement, lastBtn);

    await act(async () => {
      const tabEvent = new dom.window.KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      });
      dom.window.document.dispatchEvent(tabEvent);
      assert.equal(tabEvent.defaultPrevented, true, 'Tab on last element should be prevented');
    });

    assert.equal(
      dom.window.document.activeElement,
      closeBtn,
      'Tab on last element must wrap around to first focusable element (close button)'
    );

    // 2. Shift+Tab wrap: Focus on first element (closeBtn), press Shift+Tab -> should wrap to last element (lastBtn)
    closeBtn.focus();
    assert.equal(dom.window.document.activeElement, closeBtn);

    await act(async () => {
      const shiftTabEvent = new dom.window.KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      dom.window.document.dispatchEvent(shiftTabEvent);
      assert.equal(shiftTabEvent.defaultPrevented, true, 'Shift+Tab on first element should be prevented');
    });

    assert.equal(
      dom.window.document.activeElement,
      lastBtn,
      'Shift+Tab on first element must wrap around to last focusable element'
    );

    // 3. Close restores focus: Click close button -> modal closes -> opener button regains focus
    await act(async () => {
      closeBtn.click();
    });

    assert.equal(
      dom.window.document.activeElement,
      openerBtn,
      'Closing modal must restore focus back to the opener button'
    );
  });

  test('Drawer and ConfirmDialog share useDialogA11y and restore opener on close', async () => {
    // 1. Verify Drawer focus behavior
    function TestDrawerContainer() {
      const [isOpen, setIsOpen] = useState(false);
      return React.createElement(
        'div',
        null,
        React.createElement(
          'button',
          { id: 'drawer-opener', onClick: () => setIsOpen(true) },
          'Mở Drawer'
        ),
        React.createElement(
          Drawer,
          {
            isOpen,
            onClose: () => setIsOpen(false),
            title: 'Chi tiết lớp',
          },
          React.createElement('input', { id: 'drawer-input', type: 'text' })
        )
      );
    }

    await act(async () => {
      reactRoot.render(React.createElement(TestDrawerContainer));
    });

    const drawerOpener = dom.window.document.getElementById('drawer-opener');
    drawerOpener.focus();

    await act(async () => {
      drawerOpener.click();
    });

    const drawerInput = dom.window.document.getElementById('drawer-input');
    assert.ok(drawerInput, 'Drawer input should exist');

    // Close with Escape
    await act(async () => {
      const escEvent = new dom.window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      dom.window.document.dispatchEvent(escEvent);
    });

    assert.equal(
      dom.window.document.activeElement,
      drawerOpener,
      'Closing Drawer via Escape should restore focus to drawer opener'
    );

    // 2. Verify ConfirmDialog focus behavior
    function TestConfirmContainer() {
      const [isOpen, setIsOpen] = useState(false);
      return React.createElement(
        'div',
        null,
        React.createElement(
          'button',
          { id: 'confirm-opener', onClick: () => setIsOpen(true) },
          'Xóa lớp'
        ),
        React.createElement(ConfirmDialog, {
          isOpen,
          onClose: () => setIsOpen(false),
          onConfirm: () => setIsOpen(false),
          title: 'Xác nhận xóa',
          message: 'Bạn có chắc chắn muốn xóa lớp này?',
        })
      );
    }

    await act(async () => {
      reactRoot.render(React.createElement(TestConfirmContainer));
    });

    const confirmOpener = dom.window.document.getElementById('confirm-opener');
    confirmOpener.focus();

    await act(async () => {
      confirmOpener.click();
    });

    // Close via Escape
    await act(async () => {
      const escEvent = new dom.window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      dom.window.document.dispatchEvent(escEvent);
    });

    assert.equal(
      dom.window.document.activeElement,
      confirmOpener,
      'Closing ConfirmDialog via Escape should restore focus to confirm opener'
    );
  });
});
