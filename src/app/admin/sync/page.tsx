'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import type { TeachingAggregatePreview, TeachingMultiPageFixture, TeachingSyncDiffReport } from '@/lib/teaching-sync';
import {
  IconRefreshCw,
  IconShield,
  IconCheckCircle,
  IconAlertCircle,
  IconDatabase,
  IconAlertTriangle,
  IconCheck,
  IconX,
  IconLock,
} from '@/components/icons';

const M6_REAL_SYNC_BOOKMARKLET_HREF =
  "javascript:(function(){if(location.origin!=='https://teachingmindx.top'||!/\\/hocsinh\\.php$/i.test(location.pathname)){alert('Vui lòng mở trang https://teachingmindx.top/hocsinh.php đã đăng nhập rồi bấm lại dấu trang này.');return;}var pages=[],start=0,len=15,pageIdx=0;(async function(){try{while(pageIdx<500){var draw=pageIdx+1;var r=await fetch('/hocsinh.php?datatable=students&draw='+draw+'&start='+start+'&length='+len,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});if(!r.ok)throw new Error('HTTP '+r.status);var j=await r.json();if(!j||!Array.isArray(j.data))throw new Error('Phản hồi không phải JSON DataTables');pages.push(j);start+=j.data.length;pageIdx++;if(start>=(j.recordsFiltered||0)||j.data.length===0)break;}var snap={pageLength:len,snapshotVersion:new Date().toISOString(),pages:pages};if(window.opener&&!window.opener.closed){try{window.opener.postMessage({type:'MINDX_TEACHING_SNAPSHOT_M6',snapshot:snap},'*');}catch(e){}}var b=new Blob([JSON.stringify(snap,null,2)],{type:'application/json'});var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='teaching-snapshot.json';document.body.appendChild(a);a.click();setTimeout(function(){a.remove();},500);alert('Đã đọc xong '+pages.length+' trang từ Teaching và tải tệp teaching-snapshot.json! Hãy quay lại tab MindX Learn để xem trước & xác nhận áp dụng.');}catch(err){alert('Không thể đọc danh sách từ Teaching: '+(err&&err.message?err.message:err));}})();})();";

type ScenarioKey =
  | 'valid_multipage'
  | 'class_transfer_id_check'
  | 'session_expired_mid_pagination'
  | 'total_changed_between_pages'
  | 'draw_mismatch'
  | 'last_page_mismatch'
  | 'duplicate_id_across_pages'
  | 'missing_id_on_page'
  | 'malformed_structure';

export default function AdminSyncPage() {
  const router = useRouter();
  const {
    currentUser,
    classes,
    students,
    previewTeachingSync,
    applyTeachingSync,
    resetTeachingFixtureSync,
  } = useStore();

  const [activeTab, setActiveTab] = useState<'mock_fixture' | 'real_source'>('mock_fixture');
  const [robFilterMode, setRobFilterMode] = useState<'include_rob' | 'exclude_rob'>('include_rob');
  const [selectedScenario, setSelectedScenario] = useState<ScenarioKey>('valid_multipage');

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSampleAggregate, setIsLoadingSampleAggregate] = useState(false);
  const [isApplyingSync, setIsApplyingSync] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);

  const [isLoadingRealPreview, setIsLoadingRealPreview] = useState(false);
  const [isApplyingRealSync, setIsApplyingRealSync] = useState(false);
  const [realDiffReport, setRealDiffReport] = useState<TeachingSyncDiffReport | null>(null);
  const [realAbortError, setRealAbortError] = useState<{
    code: string;
    message: string;
    failedAtPage?: number;
    pagesRead?: number;
  } | null>(null);
  const [realStatusMessage, setRealStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [realSnapshotSourceLabel, setRealSnapshotSourceLabel] = useState<string | null>(null);
  const realPreviewReqSeqRef = useRef<number>(0);

  const previewReqSeqRef = useRef<number>(0);
  const sampleAggregateReqSeqRef = useRef<number>(0);
  const inFlightMutationRef = useRef<'apply' | 'reset' | 'apply_real' | null>(null);
  const robFilterModeRef = useRef<'include_rob' | 'exclude_rob'>('include_rob');
  const isMutating = isApplyingSync || isResetting || isApplyingRealSync;

  const [diffReport, setDiffReport] = useState<TeachingSyncDiffReport | null>(null);
  const [sampleAggregatePreview, setSampleAggregatePreview] = useState<TeachingAggregatePreview | null>(null);
  const [abortError, setAbortError] = useState<{
    code: string;
    message: string;
    failedAtPage?: number;
    pagesRead?: number;
  } | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [liveProbeResult, setLiveProbeResult] = useState<{
    code: string;
    title: string;
    message: string;
    timestamp: string;
  } | null>(null);

  const handleRealSnapshotPreview = async (snapshotPayload: any, sourceLabel: string) => {
    if (inFlightMutationRef.current !== null || isApplyingRealSync || isApplyingSync || isResetting) return;
    const reqSeq = ++realPreviewReqSeqRef.current;
    setIsLoadingRealPreview(true);
    setRealSnapshotSourceLabel(sourceLabel);
    setRealStatusMessage(null);
    setRealAbortError(null);
    setRealDiffReport(null);

    try {
      const result = await previewTeachingSync(snapshotPayload, {
        robFilterMode: 'include_rob',
        sourceMode: 'real_teaching_sync',
      });
      if (realPreviewReqSeqRef.current !== reqSeq || inFlightMutationRef.current !== null) return;
      setIsLoadingRealPreview(false);

      if (!result.success || result.aborted || !result.report) {
        setRealDiffReport(null);
        setRealAbortError({
          code: result.code || 'SYNC_ABORTED',
          message:
            result.message ||
            'Lượt đọc phân trang DataTables không hợp lệ. Đã hủy toàn bộ lượt đọc, không áp dụng một phần dữ liệu.',
          failedAtPage: result.failedAtPage,
          pagesRead: result.pagesRead,
        });
        return;
      }

      setRealAbortError(null);
      setRealDiffReport(result.report);
      setRealStatusMessage({
        text: `Đã đọc và kiểm tra xong toàn bộ ${result.report.pagination.pagesRead} trang DataTables từ ${sourceLabel} (${result.report.pagination.recordsFiltered}/${result.report.pagination.recordsTotal} dòng). Phát hiện +${result.report.counts.addedCount} học sinh ROB mới, ${result.report.counts.updatedCount} cập nhật, ${result.report.counts.unchangedCount} giữ nguyên, ${result.report.counts.needsReviewCount} cần Admin đối chiếu, ${result.report.counts.ignoredCount} bỏ qua.`,
        isError: false,
      });
    } catch {
      if (realPreviewReqSeqRef.current !== reqSeq || inFlightMutationRef.current !== null) return;
      setIsLoadingRealPreview(false);
      setRealDiffReport(null);
      setRealStatusMessage({
        text: 'Không thể xử lý tệp Snapshot Teaching. Vui lòng kiểm tra lại tệp .json tải từ dấu trang.',
        isError: true,
      });
    }
  };

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (
        event.data &&
        typeof event.data === 'object' &&
        event.data.type === 'MINDX_TEACHING_SNAPSHOT_M6' &&
        event.data.snapshot
      ) {
        setActiveTab('real_source');
        void handleRealSnapshotPreview(event.data.snapshot, 'Phiên Teaching trực tiếp (Dấu trang 1-chạm)');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  });

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white rounded-xl border border-slate-200">
        <IconAlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900 mb-2">Quyền truy cập hạn chế</h2>
        <p className="text-xs text-slate-500 mb-4">
          Chỉ có Admin mới có quyền truy cập trang đồng bộ danh sách học sinh [UI-08].
        </p>
        <button
          onClick={() => router.push('/login')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700"
        >
          Đăng nhập vai trò Admin
        </button>
      </div>
    );
  }

  const loadScenarioFixture = async (
    scenarioKey: ScenarioKey,
    overrideRobMode?: 'include_rob' | 'exclude_rob'
  ) => {
    if (inFlightMutationRef.current !== null || isApplyingSync || isResetting) return;
    const reqSeq = ++previewReqSeqRef.current;
    setIsConfirmingReset(false);
    setIsLoading(true);
    setSelectedScenario(scenarioKey);
    setStatusMessage(null);
    setAbortError(null);
    setDiffReport(null);

    const effectiveRobMode = overrideRobMode ?? robFilterModeRef.current;

    try {
      const res = await fetch('/fixtures/teaching_mock.json', { cache: 'no-store' });
      if (previewReqSeqRef.current !== reqSeq || inFlightMutationRef.current !== null) return;

      const rootFixture: TeachingMultiPageFixture = await res.json();
      if (previewReqSeqRef.current !== reqSeq || inFlightMutationRef.current !== null) return;

      const targetPayload =
        scenarioKey === 'valid_multipage'
          ? rootFixture
          : rootFixture.scenarios?.[scenarioKey] || rootFixture;

      const result = await previewTeachingSync(targetPayload, {
        robFilterMode: effectiveRobMode,
        sourceMode: 'synthetic_fixture',
      });
      if (previewReqSeqRef.current !== reqSeq || inFlightMutationRef.current !== null) return;

      setIsLoading(false);

      if (!result.success || result.aborted || !result.report) {
        setDiffReport(null);
        setAbortError({
          code: result.code || 'SYNC_ABORTED',
          message:
            result.message ||
            'Lượt đọc phân trang DataTables không hợp lệ. Đã hủy toàn bộ lượt đọc, không áp dụng một phần dữ liệu.',
          failedAtPage: result.failedAtPage,
          pagesRead: result.pagesRead,
        });
        return;
      }

      setAbortError(null);
      setDiffReport(result.report);
      setStatusMessage({
        text: `Đã đọc và xác thực toàn bộ ${result.report.pagination.pagesRead} trang DataTables (${result.report.pagination.recordsFiltered}/${result.report.pagination.recordsTotal} bản ghi, trang cuối ${result.report.pagination.lastPageRowCount} dòng). Phát hiện +${result.report.counts.addedCount} thêm mới, ${result.report.counts.updatedCount} cập nhật, ${result.report.counts.unchangedCount} giữ nguyên, ${result.report.counts.needsReviewCount} cần Admin đối chiếu, ${result.report.counts.ignoredCount} bỏ qua.`,
        isError: false,
      });
    } catch {
      if (previewReqSeqRef.current !== reqSeq || inFlightMutationRef.current !== null) return;
      setIsLoading(false);
      setDiffReport(null);
      setStatusMessage({
        text: 'Lỗi tải tệp fixture mẫu từ /fixtures/teaching_mock.json.',
        isError: true,
      });
    }
  };

  const handleRobFilterModeChange = (nextMode: 'include_rob' | 'exclude_rob') => {
    if (inFlightMutationRef.current !== null || isApplyingSync || isResetting) return;
    if (robFilterModeRef.current === nextMode && robFilterMode === nextMode) return;
    robFilterModeRef.current = nextMode;
    setRobFilterMode(nextMode);
    if (isLoading || diffReport || abortError) {
      void loadScenarioFixture(selectedScenario, nextMode);
    } else {
      ++previewReqSeqRef.current;
    }
  };

  const handleCancelPreview = () => {
    if (inFlightMutationRef.current !== null || isApplyingSync || isResetting) return;
    ++previewReqSeqRef.current;
    setIsLoading(false);
    setDiffReport(null);
    setAbortError(null);
    setStatusMessage({
      text: 'Đã hủy xem trước đồng bộ. Không có bất kỳ thay đổi nào được áp dụng vào TEST.',
      isError: false,
    });
  };

  const handleApplySync = async () => {
    if (
      !diffReport ||
      abortError ||
      isLoading ||
      isApplyingSync ||
      isResetting ||
      inFlightMutationRef.current !== null
    ) {
      return;
    }
    if (diffReport.robFilterMode !== robFilterModeRef.current) {
      setStatusMessage({
        text: 'Chế độ lọc ROB đã thay đổi so với bản xem trước hiện tại. Vui lòng đọc lại xem trước trước khi áp dụng.',
        isError: true,
      });
      return;
    }
    inFlightMutationRef.current = 'apply';
    ++previewReqSeqRef.current;
    setIsConfirmingReset(false);
    setIsApplyingSync(true);
    try {
      const res = await applyTeachingSync(diffReport);
      if (res.success) {
        setStatusMessage({
          text: `${res.message} (Bạn có thể bấm "Đọc toàn bộ phân trang Fixture & Xem trước" lần nữa để kiểm chứng tính lặp lại an toàn: chạy lại không tạo bản ghi trùng).`,
          isError: false,
        });
        setDiffReport(null);
      } else {
        setStatusMessage({ text: res.message, isError: true });
      }
    } finally {
      inFlightMutationRef.current = null;
      setIsApplyingSync(false);
    }
  };

  const handleRequestResetSandbox = () => {
    if (isResetting || isApplyingSync || inFlightMutationRef.current !== null) return;
    setIsConfirmingReset(true);
  };

  const handleCancelResetSandbox = () => {
    if (isResetting || isApplyingSync || inFlightMutationRef.current !== null) return;
    setIsConfirmingReset(false);
  };

  const handleResetSandbox = async () => {
    if (isResetting || isApplyingSync || inFlightMutationRef.current !== null) return;
    inFlightMutationRef.current = 'reset';
    ++previewReqSeqRef.current;
    setIsConfirmingReset(false);
    setIsLoading(false);
    setIsResetting(true);
    try {
      const res = await resetTeachingFixtureSync();
      setDiffReport(null);
      setAbortError(null);
      setStatusMessage({
        text: res.message,
        isError: !res.success,
      });
    } finally {
      inFlightMutationRef.current = null;
      setIsResetting(false);
    }
  };

  const handleProbeDirectCrossOriginTeaching = () => {
    setLiveProbeResult(null);
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    const teachingOrigin = 'https://teachingmindx.top';

    if (currentOrigin !== teachingOrigin) {
      setLiveProbeResult({
        code: 'DIFFERENT_ORIGIN_DIRECT_READ_NOT_ATTEMPTED',
        title: 'Khác nguồn — chưa thử kết nối trực tiếp',
        message: `Ứng dụng đang chạy tại nguồn "${currentOrigin}" khác với nguồn "${teachingOrigin}". Hệ thống chỉ đối chiếu nguồn hiện tại và không tự phát yêu cầu mạng khác nguồn sang Teaching (chưa thử kết nối trực tiếp, không khẳng định đã bị CORS chặn). Vui lòng dùng Tiện ích Dấu trang Cục bộ ở Bước 2 ngay trên tab Teaching đã đăng nhập của Owner.`,
        timestamp: new Date().toISOString(),
      });
      return;
    }
  };

  const handlePreviewAggregateOnlyDemo = async () => {
    const reqSeq = ++sampleAggregateReqSeqRef.current;
    setIsLoadingSampleAggregate(true);
    try {
      const res = await fetch('/fixtures/teaching_mock.json', { cache: 'no-store' });
      if (sampleAggregateReqSeqRef.current !== reqSeq) return;
      const rootFixture: TeachingMultiPageFixture = await res.json();
      if (sampleAggregateReqSeqRef.current !== reqSeq) return;
      const previewRes = await previewTeachingSync(rootFixture, {
        robFilterMode: 'include_rob',
        sourceMode: 'real_teaching_preview',
      });
      if (sampleAggregateReqSeqRef.current !== reqSeq) return;
      setIsLoadingSampleAggregate(false);
      if (previewRes.aggregatePreview) {
        setSampleAggregatePreview(previewRes.aggregatePreview);
      }
    } catch {
      if (sampleAggregateReqSeqRef.current !== reqSeq) return;
      setIsLoadingSampleAggregate(false);
    }
  };

  const handleRealSnapshotFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await handleRealSnapshotPreview(parsed, `tệp "${file.name}"`);
    } catch {
      setRealDiffReport(null);
      setRealAbortError(null);
      setRealStatusMessage({
        text: `Tệp "${file.name}" không phải là định dạng JSON Snapshot hợp lệ từ Teaching.`,
        isError: true,
      });
    }
  };

  const handleCancelRealPreview = () => {
    if (inFlightMutationRef.current !== null || isApplyingRealSync || isApplyingSync || isResetting) return;
    ++realPreviewReqSeqRef.current;
    setIsLoadingRealPreview(false);
    setRealDiffReport(null);
    setRealAbortError(null);
    setRealStatusMessage({
      text: 'Đã hủy xem trước danh sách thật. Không có thay đổi nào được áp dụng vào hệ thống.',
      isError: false,
    });
  };

  const handleApplyRealSync = async () => {
    if (
      !realDiffReport ||
      realAbortError ||
      isLoadingRealPreview ||
      isApplyingRealSync ||
      isApplyingSync ||
      isResetting ||
      inFlightMutationRef.current !== null
    ) {
      return;
    }
    inFlightMutationRef.current = 'apply_real';
    ++realPreviewReqSeqRef.current;
    setIsApplyingRealSync(true);
    try {
      const res = await applyTeachingSync(realDiffReport);
      if (res.success) {
        setRealStatusMessage({
          text: res.message,
          isError: false,
        });
        setRealDiffReport(null);
      } else {
        setRealStatusMessage({
          text: res.message,
          isError: true,
        });
      }
    } finally {
      inFlightMutationRef.current = null;
      setIsApplyingRealSync(false);
    }
  };

  const activeStudentsCount = students.filter((s) => s.status === 'active').length;
  const transferredStudentsCount = students.filter((s) => s.status === 'transferred').length;
  const archivedStudentsCount = students.filter((s) => s.status === 'archived').length;

  return (
    <div className="space-y-6">
      {/* Title & Current Roster Summary Card */}
      <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_14px_40px_rgba(8,112,184,0.06)] flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-[#1d63ed] border border-blue-100">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1d63ed]" />
            <span>Quản trị Đồng bộ (Admin)</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Đồng bộ Danh sách Học sinh Teaching MindX (Có Xem Trước)
          </h1>
          <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
            Đọc đủ phân trang DataTables, kiểm tra tính nhất quán, lọc lớp ROB, đối chiếu ID khi đổi lớp và xác nhận trước khi áp dụng danh sách.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3.5 bg-[#f8fafc] border border-slate-200/80 rounded-2xl px-4 py-3 text-xs shrink-0">
          <div>
            <span className="text-slate-500 block text-[11px] font-medium">Trạng thái hệ thống hiện tại:</span>
            <span className="font-extrabold text-slate-900">
              {classes.length} lớp • {students.length} học sinh ({activeStudentsCount} đang học, {transferredStudentsCount} chuyển lớp, {archivedStudentsCount} lưu trữ)
            </span>
          </div>
          <button
            type="button"
            disabled={isMutating}
            onClick={handleRequestResetSandbox}
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 font-bold text-xs transition-colors shadow-2xs cursor-pointer"
          >
            {isResetting ? 'Đang khôi phục...' : '↺ Khôi phục dữ liệu mẫu ban đầu'}
          </button>
        </div>
      </div>

      {isConfirmingReset && (
        <div
          role="alertdialog"
          aria-label="Xác nhận khôi phục dữ liệu mẫu ban đầu"
          className="p-5 rounded-3xl bg-amber-50/90 border-2 border-amber-300 text-amber-950 text-xs space-y-3 shadow-sm"
        >
          <div className="font-extrabold text-amber-900 text-sm">
            ⚠ Xác nhận khôi phục dữ liệu mẫu ban đầu trên TEST
          </div>
          <p className="leading-relaxed text-amber-900">
            Thao tác này sẽ xóa toàn bộ học sinh và lớp học mới đồng bộ từ fixture Mốc 4, khôi phục họ tên gốc trước đồng bộ và xóa vĩnh viễn các kết quả trắc nghiệm, bài nộp thực hành cùng tệp đã tải lên của học sinh đồng bộ Mốc 4 (không thể hoàn tác).
          </p>
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              disabled={isMutating}
              onClick={handleResetSandbox}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs transition-colors shadow-sm cursor-pointer"
            >
              Xác nhận Khôi phục TEST
            </button>
            <button
              type="button"
              disabled={isMutating}
              onClick={handleCancelResetSandbox}
              className="px-4 py-2 rounded-xl border border-amber-300 bg-white hover:bg-amber-100 disabled:opacity-50 text-amber-900 font-bold text-xs transition-colors cursor-pointer"
            >
              Hủy khôi phục
            </button>
          </div>
        </div>
      )}

      {/* Segmented Source Selector Tab */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 p-1.5 bg-slate-100/90 border border-slate-200/80 rounded-2xl">
        <button
          type="button"
          disabled={isMutating}
          onClick={() => {
            if (isMutating) return;
            setActiveTab('mock_fixture');
            setStatusMessage(null);
          }}
          className={`py-3 px-4 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer ${
            activeTab === 'mock_fixture'
              ? 'bg-white text-[#1d63ed] shadow-sm ring-1 ring-slate-200/70'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          1. Nguồn Dữ liệu giả TEST (Fixture DataTables Nhiều Trang — Áp dụng TEST)
        </button>
        <button
          type="button"
          disabled={isMutating}
          onClick={() => {
            if (isMutating) return;
            setActiveTab('real_source');
            setStatusMessage(null);
          }}
          className={`py-3 px-4 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer ${
            activeTab === 'real_source'
              ? 'bg-[#1d63ed] text-white shadow-md shadow-blue-600/20'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          2. Nguồn Teaching MindX Thật (Xem trước Tổng hợp &amp; Đồng bộ Snapshot)
        </button>
      </div>

      {/* TAB 1: Multi-Page Synthetic Fixture Preview & TEST Apply */}
      {activeTab === 'mock_fixture' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_14px_40px_rgba(8,112,184,0.06)] space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Kiểm chứng phân trang DataTables & Đối chiếu danh sách trên bộ Fixture giả TEST
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Đọc tuần tự từng trang theo <code className="font-mono text-[#1d63ed] font-semibold">length=15</code> và{' '}
                  <code className="font-mono text-[#1d63ed] font-semibold">recordsFiltered=35</code> (3 trang: 15 + 15 + 5 dòng cuối) từ{' '}
                  <code className="font-mono text-[#1d63ed] font-semibold">/public/fixtures/teaching_mock.json</code>. Tuyệt đối không dùng tên/mã học sinh thật.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={isLoading || isMutating}
                  onClick={() => loadScenarioFixture('valid_multipage')}
                  className="px-5 py-2.5 bg-[#1d63ed] hover:bg-[#154ec2] disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-all flex items-center gap-2 cursor-pointer"
                >
                  {isLoading ? <IconRefreshCw className="w-4 h-4 animate-spin" /> : <IconDatabase className="w-4 h-4" />}
                  <span>Đọc toàn bộ phân trang Fixture & Xem trước</span>
                </button>
              </div>
            </div>

            {/* Filter & Identity Options */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-bold text-slate-600">Chế độ lọc mã lớp ROB:</span>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="robFilterMode"
                    disabled={isMutating}
                    checked={robFilterMode === 'include_rob'}
                    onChange={() => handleRobFilterModeChange('include_rob')}
                  />
                  <span className="font-semibold text-slate-800">
                    Chỉ nhận lớp có mã ROB (không phân biệt hoa/thường)
                  </span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="robFilterMode"
                    disabled={isMutating}
                    checked={robFilterMode === 'exclude_rob'}
                    onChange={() => handleRobFilterModeChange('exclude_rob')}
                  />
                  <span className="text-slate-600">
                    Đối chứng đảo ngược (Loại trừ ROB như bản thử HTML 13/10)
                  </span>
                </label>
              </div>

              <div className="px-2.5 py-1 rounded bg-amber-50 border border-amber-200 text-amber-800 font-semibold text-[11px]">
                Quy tắc đổi lớp & trùng tên: Luôn giữ ở Cần Admin đối chiếu (không tự gộp hay chuyển nhầm)
              </div>
            </div>

            {/* Scenario Test Buttons (Multi-page, Identity Conflict, Atomic Aborts) */}
            <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
              <div className="font-bold text-slate-500">
                Bộ kịch bản kiểm tra bắt buộc Mốc 4 (Đủ trang, trang cuối, đổi lớp/trùng tên, mất phiên, sai cấu trúc):
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isMutating}
                  onClick={() => loadScenarioFixture('valid_multipage')}
                  className={`px-2.5 py-1 rounded font-semibold border transition-colors disabled:opacity-50 ${
                    selectedScenario === 'valid_multipage' && diffReport
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200'
                  }`}
                >
                  ✓ Đủ 3 trang chuẩn (15+15+5 = 35 dòng)
                </button>
                <button
                  type="button"
                  disabled={isMutating}
                  onClick={() => loadScenarioFixture('class_transfer_id_check')}
                  className={`px-2.5 py-1 rounded font-semibold border transition-colors disabled:opacity-50 ${
                    selectedScenario === 'class_transfer_id_check' && diffReport
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200'
                  }`}
                >
                  🔍 Kiểm chứng đổi lớp & Cùng tên khác mã ID
                </button>
                <button
                  type="button"
                  disabled={isMutating}
                  onClick={() => loadScenarioFixture('session_expired_mid_pagination')}
                  className="px-2.5 py-1 rounded bg-purple-50 text-purple-700 hover:bg-purple-100 font-semibold border border-purple-200 disabled:opacity-50"
                >
                  ✕ Mất phiên ở Trang 2 (401/Login)
                </button>
                <button
                  type="button"
                  disabled={isMutating}
                  onClick={() => loadScenarioFixture('total_changed_between_pages')}
                  className="px-2.5 py-1 rounded bg-amber-50 text-amber-800 hover:bg-amber-100 font-semibold border border-amber-200 disabled:opacity-50"
                >
                  ✕ Tổng thay đổi giữa các trang
                </button>
                <button
                  type="button"
                  disabled={isMutating}
                  onClick={() => loadScenarioFixture('draw_mismatch')}
                  className="px-2.5 py-1 rounded bg-amber-50 text-amber-800 hover:bg-amber-100 font-semibold border border-amber-200 disabled:opacity-50"
                >
                  ✕ Sai lệch tham số Draw
                </button>
                <button
                  type="button"
                  disabled={isMutating}
                  onClick={() => loadScenarioFixture('last_page_mismatch')}
                  className="px-2.5 py-1 rounded bg-rose-50 text-rose-700 hover:bg-rose-100 font-semibold border border-rose-200 disabled:opacity-50"
                >
                  ✕ Lệch số dòng Trang cuối
                </button>
                <button
                  type="button"
                  disabled={isMutating}
                  onClick={() => loadScenarioFixture('duplicate_id_across_pages')}
                  className="px-2.5 py-1 rounded bg-rose-50 text-rose-700 hover:bg-rose-100 font-semibold border border-rose-200 disabled:opacity-50"
                >
                  ✕ Trùng mã ID học sinh
                </button>
                <button
                  type="button"
                  disabled={isMutating}
                  onClick={() => loadScenarioFixture('missing_id_on_page')}
                  className="px-2.5 py-1 rounded bg-rose-50 text-rose-700 hover:bg-rose-100 font-semibold border border-rose-200 disabled:opacity-50"
                >
                  ✕ Thiếu mã ID học sinh
                </button>
                <button
                  type="button"
                  disabled={isMutating}
                  onClick={() => loadScenarioFixture('malformed_structure')}
                  className="px-2.5 py-1 rounded bg-rose-50 text-rose-700 hover:bg-rose-100 font-semibold border border-rose-200 disabled:opacity-50"
                >
                  ✕ Sai cấu trúc dòng DataTables
                </button>
              </div>
            </div>
          </div>

          {/* Status Message Alert */}
          {statusMessage && (
            <div
              className={`p-4 rounded-xl text-xs flex items-start gap-2.5 ${
                statusMessage.isError
                  ? 'bg-rose-50 border border-rose-300 text-rose-800'
                  : 'bg-emerald-50 border border-emerald-300 text-emerald-800'
              }`}
            >
              {statusMessage.isError ? (
                <IconAlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              ) : (
                <IconCheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
              )}
              <span className="font-medium flex-1 leading-relaxed">{statusMessage.text}</span>
            </div>
          )}

          {/* Atomic Abort Alert */}
          {abortError && (
            <div
              role="alert"
              className="p-5 rounded-xl bg-rose-50 border-2 border-rose-300 text-rose-900 text-xs space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-extrabold text-sm text-rose-800">
                  <IconAlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
                  <span>HỦY TOÀN BỘ LƯỢT ĐỌC ({abortError.code}) — KHÔNG ÁP DỤNG MỘT PHẦN</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-rose-200 text-rose-900 font-mono font-bold text-[11px]">
                  partialApplied: false (0 bản ghi được ghi)
                </span>
              </div>
              <p className="leading-relaxed font-medium">{abortError.message}</p>
              <div className="pt-2 border-t border-rose-200 flex flex-wrap gap-4 text-[11px] text-rose-700 font-semibold">
                <span>• Trang phát hiện lỗi: Trang {abortError.failedAtPage ?? 1}</span>
                <span>• Số trang trước đó đã bị hủy bỏ: {abortError.pagesRead ?? 0} trang</span>
                <span>• Cam kết toàn vẹn: Toàn bộ dữ liệu lớp và học sinh hiện tại được giữ nguyên 100%.</span>
              </div>
            </div>
          )}

          {/* Diff Preview Report */}
          {diffReport && !abortError && !isLoading && (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_14px_40px_rgba(8,112,184,0.06)] overflow-hidden space-y-6 p-6 sm:p-8">
              {/* Top Confirmation Bar */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-4 border-b border-slate-100 gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-extrabold text-slate-900">
                      Báo cáo Xem trước Chênh lệch (Diff Preview Mốc 4)
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-[#1d63ed] border border-blue-100">
                      Đã đọc đủ {diffReport.pagination.pagesRead} trang ({diffReport.pagination.recordsFiltered}/{diffReport.pagination.recordsTotal} dòng)
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Kiểm tra kỹ danh sách thêm mới, cập nhật và các trường hợp cần Admin đối chiếu trước khi xác nhận áp dụng vào TEST.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isMutating}
                    onClick={handleCancelPreview}
                    className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                  >
                    <IconX className="w-4 h-4" />
                    <span>Hủy bỏ (Không thay đổi)</span>
                  </button>
                  <button
                    type="button"
                    disabled={isMutating}
                    onClick={handleApplySync}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    {isApplyingSync ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Đang áp dụng...</span>
                      </>
                    ) : (
                      <>
                        <IconCheck className="w-4 h-4" />
                        <span>
                          Xác nhận Áp dụng Fixture (+{diffReport.counts.addedCount} mới, {diffReport.counts.updatedCount} cập nhật)
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 6 Summary Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <div className="text-emerald-700 font-semibold text-[11px]">+ Thêm mới hợp lệ</div>
                  <div className="text-lg font-extrabold text-emerald-900 mt-0.5">
                    {diffReport.counts.addedCount} HS
                  </div>
                  <div className="text-[10px] text-emerald-700">
                    +{diffReport.counts.newClassesCount} lớp mới chờ gán khóa
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <div className="text-blue-700 font-semibold text-[11px]">↻ Cập nhật hồ sơ</div>
                  <div className="text-lg font-extrabold text-blue-900 mt-0.5">
                    {diffReport.counts.updatedCount} HS
                  </div>
                  <div className="text-[10px] text-blue-700">Bảo toàn PIN & điểm</div>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-slate-600 font-semibold text-[11px]">✓ Giữ nguyên (Khớp)</div>
                  <div className="text-lg font-extrabold text-slate-900 mt-0.5">
                    {diffReport.counts.unchangedCount} HS
                  </div>
                  <div className="text-[10px] text-slate-500">Không tạo bản ghi trùng</div>
                </div>

                <div className="p-3 rounded-lg bg-amber-50 border border-amber-300">
                  <div className="text-amber-800 font-semibold text-[11px]">⚠ Cần Admin đối chiếu</div>
                  <div className="text-lg font-extrabold text-amber-900 mt-0.5">
                    {diffReport.counts.needsReviewCount} dòng
                  </div>
                  <div className="text-[10px] text-amber-800">Không tự gộp theo tên</div>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-slate-600 font-semibold text-[11px]">⊘ Bỏ qua theo quy tắc</div>
                  <div className="text-lg font-extrabold text-slate-700 mt-0.5">
                    {diffReport.counts.ignoredCount} dòng
                  </div>
                  <div className="text-[10px] text-slate-500">Ngoài ROB / Nghỉ / Đóng</div>
                </div>

                <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200">
                  <div className="text-indigo-700 font-semibold text-[11px]">🛡 Vắng mặt (Bảo toàn)</div>
                  <div className="text-lg font-extrabold text-indigo-900 mt-0.5">
                    {diffReport.counts.absentPreservedCount} HS
                  </div>
                  <div className="text-[10px] text-indigo-700">Không tự động xóa</div>
                </div>
              </div>

              {/* Warnings Banner if NeedsReview > 0 */}
              {diffReport.warnings.length > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2.5">
                  <IconAlertTriangle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
                  <div className="space-y-1">
                    {diffReport.warnings.map((w, idx) => (
                      <div key={idx} className="font-semibold">
                        {w}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* New Classes Waiting for Admin Course Assignment */}
              {diffReport.newClassesToCreate.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-purple-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-purple-600" />
                    <span>
                      Lớp ROB mới sẽ được tạo ở trạng thái chờ Admin gán khóa học ({diffReport.newClassesToCreate.length})
                    </span>
                  </h4>
                  <div className="border border-purple-200 rounded-lg overflow-x-auto bg-purple-50/30">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-purple-50 text-purple-900 font-bold border-b border-purple-200">
                        <tr>
                          <th className="px-3 py-2">Mã lớp mới</th>
                          <th className="px-3 py-2">Tên lớp mặc định</th>
                          <th className="px-3 py-2">Trạng thái gán khóa</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-purple-100">
                        {diffReport.newClassesToCreate.map((cls) => (
                          <tr key={cls.code}>
                            <td className="px-3 py-2 font-mono font-bold text-purple-800">{cls.code}</td>
                            <td className="px-3 py-2 font-medium text-slate-800">{cls.name}</td>
                            <td className="px-3 py-2">
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800">
                                Chờ Admin gán khóa 14 buổi (courseId: null)
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Needs Review Table (Identity Conflicts, Class Change, Unknown Status, Archived) */}
              {diffReport.needsReview.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span>
                      Danh sách Cần Admin Đối Chiếu Thủ Công — Giữ nguyên hồ sơ hiện tại ({diffReport.needsReview.length})
                    </span>
                  </h4>
                  <div className="border border-amber-300 rounded-lg overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-amber-50 text-amber-900 font-bold border-b border-amber-200">
                        <tr>
                          <th className="px-3 py-2">Mã ID nguồn</th>
                          <th className="px-3 py-2">Họ và tên</th>
                          <th className="px-3 py-2">Mã lớp nguồn</th>
                          <th className="px-3 py-2">Trạng thái nguồn</th>
                          <th className="px-3 py-2">Lý do dừng chờ Admin đối chiếu</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-100 bg-amber-50/20">
                        {diffReport.needsReview.map((item) => (
                          <tr key={item.id} className="hover:bg-amber-50/60">
                            <td className="px-3 py-2 font-mono font-bold text-amber-900">{item.id}</td>
                            <td className="px-3 py-2 font-semibold text-slate-900">{item.name}</td>
                            <td className="px-3 py-2 font-mono font-bold text-slate-700">{item.classCode}</td>
                            <td className="px-3 py-2 text-slate-600">
                              {item.status} / {item.classStatus}
                            </td>
                            <td className="px-3 py-2 text-amber-900 font-medium">{item.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Added Students Table */}
              <div>
                <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600" />
                  <span>Học sinh mới hợp lệ cần thêm ({diffReport.added.length})</span>
                </h4>
                {diffReport.added.length === 0 ? (
                  <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-500">
                    Không có học sinh mới cần thêm trong lượt xem trước này (0 bản ghi mới).
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2">Mã học sinh nguồn (ID)</th>
                          <th className="px-3 py-2">Họ và tên</th>
                          <th className="px-3 py-2">Mã lớp chuẩn hóa</th>
                          <th className="px-3 py-2">Hành động dự kiến</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {diffReport.added.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-mono font-bold text-blue-600">{item.id}</td>
                            <td className="px-3 py-2 font-semibold text-slate-800">{item.name}</td>
                            <td className="px-3 py-2 font-mono font-bold text-slate-700">{item.classCode}</td>
                            <td className="px-3 py-2">
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700">
                                {item.action}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Updated Students Table */}
              <div>
                <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-600" />
                  <span>Hồ sơ hiện có cần cập nhật ({diffReport.updated.length})</span>
                </h4>
                {diffReport.updated.length === 0 ? (
                  <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-500">
                    Không có hồ sơ hiện có nào thay đổi thông tin (0 cập nhật).
                  </div>
                ) : (
                  <div className="border border-blue-200 rounded-lg overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-blue-50 text-blue-900 font-bold border-b border-blue-200">
                        <tr>
                          <th className="px-3 py-2">Mã ID</th>
                          <th className="px-3 py-2">Họ tên hiện tại</th>
                          <th className="px-3 py-2">Họ tên mới từ nguồn</th>
                          <th className="px-3 py-2">Lớp</th>
                          <th className="px-3 py-2">Hành động</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-blue-100">
                        {diffReport.updated.map((item) => (
                          <tr key={item.id} className="hover:bg-blue-50/40">
                            <td className="px-3 py-2 font-mono font-bold text-blue-700">{item.id}</td>
                            <td className="px-3 py-2 text-slate-500">{item.previousName}</td>
                            <td className="px-3 py-2 font-bold text-slate-900">{item.name}</td>
                            <td className="px-3 py-2 font-mono">{item.classCode}</td>
                            <td className="px-3 py-2 text-blue-800 font-medium">{item.action}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Unchanged & Absent Preserved Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-500" />
                    <span>Hồ sơ đang học không thay đổi ({diffReport.unchanged.length})</span>
                  </h4>
                  <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-48">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-1.5">Mã ID</th>
                          <th className="px-3 py-1.5">Họ tên</th>
                          <th className="px-3 py-1.5">Lớp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-600">
                        {diffReport.unchanged.map((item) => (
                          <tr key={item.id}>
                            <td className="px-3 py-1.5 font-mono font-semibold">{item.id}</td>
                            <td className="px-3 py-1.5">{item.name}</td>
                            <td className="px-3 py-1.5 font-mono">{item.classCode}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-indigo-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500" />
                    <span>Hồ sơ vắng mặt trong lần đọc — Bảo toàn, không xóa ({diffReport.absentPreserved.length})</span>
                  </h4>
                  <div className="border border-indigo-200 rounded-lg overflow-x-auto max-h-48">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-indigo-50 text-indigo-900 font-bold border-b border-indigo-200">
                        <tr>
                          <th className="px-3 py-1.5">Mã ID</th>
                          <th className="px-3 py-1.5">Họ tên</th>
                          <th className="px-3 py-1.5">Cam kết bảo toàn</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-indigo-100 text-slate-700">
                        {diffReport.absentPreserved.map((item) => (
                          <tr key={item.id}>
                            <td className="px-3 py-1.5 font-mono font-semibold text-indigo-700">{item.id}</td>
                            <td className="px-3 py-1.5">{item.name}</td>
                            <td className="px-3 py-1.5 text-indigo-800">{item.note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Ignored / Filtered Out Table */}
              <div>
                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  <span>Dòng bị bỏ qua theo quy tắc lọc ROB & trạng thái nghỉ/đóng lớp ({diffReport.ignored.length})</span>
                </h4>
                <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-60">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2">Mã</th>
                        <th className="px-3 py-2">Tên</th>
                        <th className="px-3 py-2">Lớp</th>
                        <th className="px-3 py-2">Trạng thái nguồn</th>
                        <th className="px-3 py-2">Lý do bỏ qua</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-500">
                      {diffReport.ignored.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono">{item.id}</td>
                          <td className="px-3 py-2">{item.name}</td>
                          <td className="px-3 py-2 font-mono">{item.classCode}</td>
                          <td className="px-3 py-2">
                            {item.status} / {item.classStatus}
                          </td>
                          <td className="px-3 py-2 text-rose-600 font-medium">{item.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Safety Commitments */}
              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-600 space-y-1">
                <span className="font-bold text-slate-800 block">Cam kết an toàn đồng bộ Mốc 4:</span>
                <div>• Đồng bộ KHÔNG tự động cấp mã PIN và KHÔNG tạo/tải tệp CSV PIN (việc cấp PIN chỉ qua thao tác Admin riêng tại [UI-07]).</div>
                <div>• Đồng bộ KHÔNG tự xóa các học sinh vắng mặt trong lần đọc này ({diffReport.counts.absentPreservedCount} hồ sơ vắng mặt được giữ nguyên).</div>
                <div>• Không hợp nhất học sinh theo tên; không tự mở khóa tài khoản đã lưu trữ; không ghi đè mật khẩu, mã PIN hay điểm bài học bằng các trường nguồn không liên quan.</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Real Teaching Source — Mốc 4 Aggregate Preview Only & Local Bookmarklet Utility */}
      {activeTab === 'real_source' && (
        <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_14px_40px_rgba(8,112,184,0.06)] space-y-6">
          <div className="flex items-start gap-4">
            <div className="p-3.5 bg-blue-50 text-[#1d63ed] border border-blue-100 rounded-2xl shrink-0">
              <IconShield className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-[#1d63ed] border border-blue-100">
                  Chế độ Xem trước Tổng hợp Mốc 4
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                  Chỉ đọc — Không ghi dữ liệu thật vào TEST (Chờ Mốc 6)
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                Đồng bộ có xem trước từ Phiên Teaching do Owner đăng nhập trực tiếp
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Tuân thủ nghiêm ngặt quy tắc bảo mật và đồng bộ có xem trước:
              </p>
              <ul className="list-disc list-inside text-xs text-slate-700 space-y-1 pl-1">
                <li>
                  <strong>Không hỏi mật khẩu hay cookie:</strong> Ứng dụng không bao giờ yêu cầu, lưu trữ hoặc gửi mật khẩu/cookie của Teaching lên bất kỳ máy chủ nào.
                </li>
                <li>
                  <strong>Không cần F12, JSON hay lệnh Terminal:</strong> Owner chỉ tự đăng nhập Teaching bình thường trên Chrome và bấm nút giao diện/tiện ích dấu trang đã kiểm tra.
                </li>
                <li>
                  <strong>Tôn trọng CORS / Same-Origin Policy:</strong> Nếu trình duyệt chặn đọc trực tiếp khác nguồn từ webapp sang <code className="font-mono">teachingmindx.top</code>, hệ thống dừng ngay và báo rõ lý do, tuyệt đối không vượt rào bảo mật.
                </li>
                <li>
                  <strong>Báo cáo xem trước thật chỉ có số tổng hợp:</strong> Tại Mốc 4, kết quả đọc trên phiên thật chỉ hiển thị các con số tổng hợp (số trang, tổng dòng, số lớp ROB, số trạng thái hợp lệ/cần xem xét); tuyệt đối không lưu tên, mã học sinh thật hoặc payload vào TEST, tệp hay log.
                </li>
              </ul>
            </div>
          </div>

          {/* Direct Webapp-to-Teaching Probe & Aggregate Preview Verification */}
          <div className="p-5 bg-[#f8fafc] rounded-2xl border border-slate-200/80 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-extrabold text-slate-900">
                  Bước 1: Kiểm tra đọc từ trình duyệt & Xem mẫu báo cáo tổng hợp Mốc 4
                </h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  Kiểm chứng quy tắc cùng nguồn (Same-Origin Policy / CORS) ngay trên trình duyệt hoặc xem định dạng báo cáo tổng hợp Mốc 4 (0 dữ liệu cá nhân).
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleProbeDirectCrossOriginTeaching}
                  className="px-4 py-2 bg-[#0f172a] hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Kiểm tra nguồn hiện tại (Khác nguồn — chưa thử kết nối trực tiếp)
                </button>
                <button
                  type="button"
                  disabled={isLoadingSampleAggregate}
                  onClick={handlePreviewAggregateOnlyDemo}
                  className="px-4 py-2 bg-[#1d63ed] hover:bg-[#154ec2] disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-all cursor-pointer"
                >
                  {isLoadingSampleAggregate
                    ? 'Đang tạo mẫu...'
                    : 'Xem mẫu Báo cáo Tổng hợp (Minh họa bằng dữ liệu giả)'}
                </button>
              </div>
            </div>

            {liveProbeResult && (
              <div
                role="alert"
                className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-amber-900">
                    ⚠ {liveProbeResult.title} ({liveProbeResult.code})
                  </span>
                  <span className="font-mono text-[10px] text-amber-700">{liveProbeResult.timestamp}</span>
                </div>
                <p className="leading-relaxed">{liveProbeResult.message}</p>
              </div>
            )}

            {sampleAggregatePreview && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-extrabold text-emerald-900">
                    ✓ MẪU ĐỊNH DẠNG BÁO CÁO TỔNG HỢP MỐC 4 (MINH HỌA BẰNG DỮ LIỆU GIẢ — CHỈ CÓ CON SỐ, KHÔNG LƯU TÊN/MÃ HỌC SINH)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-200 text-emerald-900 font-mono font-bold text-[10px]">
                    Nguồn mẫu: dữ liệu giả (Synthetic Fixture) • piiStoredOrSent: false • realApplyAllowedInM4: false
                  </span>
                </div>
                <p className="text-emerald-800">
                  {sampleAggregatePreview.message} (Lưu ý: Đây là bản minh họa cấu trúc báo cáo tổng hợp từ dữ liệu giả. Để đọc phiên Teaching thật, vui lòng bấm dấu trang cục bộ ở Bước 2 ngay trên tab Teaching đã đăng nhập).
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-2.5 bg-white rounded-lg border border-emerald-200">
                    <div className="text-[10px] text-slate-500">Số trang đã đọc hết</div>
                    <div className="text-sm font-extrabold text-slate-900">
                      {sampleAggregatePreview.pagesRead} trang (cỡ {sampleAggregatePreview.pageLength})
                    </div>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-emerald-200">
                    <div className="text-[10px] text-slate-500">Tổng bản ghi (Total / Filtered)</div>
                    <div className="text-sm font-extrabold text-slate-900">
                      {sampleAggregatePreview.recordsTotal} / {sampleAggregatePreview.recordsFiltered}
                    </div>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-emerald-200">
                    <div className="text-[10px] text-slate-500">Số dòng trang cuối / Mã ID duy nhất</div>
                    <div className="text-sm font-extrabold text-slate-900">
                      {sampleAggregatePreview.lastPageRowCount ?? 0} dòng / {sampleAggregatePreview.uniqueIdCount} mã
                    </div>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-emerald-200">
                    <div className="text-[10px] text-slate-500">Dòng lớp ROB / Ngoài ROB</div>
                    <div className="text-sm font-extrabold text-slate-900">
                      {sampleAggregatePreview.robClassRowCount} / {sampleAggregatePreview.nonRobClassRowCount}
                    </div>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-emerald-200">
                    <div className="text-[10px] text-slate-500">Hợp lệ (ROB + Đang học + Running)</div>
                    <div className="text-sm font-extrabold text-emerald-700">
                      {sampleAggregatePreview.eligibleActiveRobCount} học sinh
                    </div>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-emerald-200">
                    <div className="text-[10px] text-slate-500">Bỏ qua (Nghỉ / Đóng lớp)</div>
                    <div className="text-sm font-extrabold text-slate-700">
                      {sampleAggregatePreview.inactiveStatusRowCount} dòng
                    </div>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-emerald-200">
                    <div className="text-[10px] text-slate-500">Trạng thái lạ cần xem xét</div>
                    <div className="text-sm font-extrabold text-amber-700">
                      {sampleAggregatePreview.unknownStatusRowCount} dòng
                    </div>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-emerald-200">
                    <div className="text-[10px] text-slate-500">Trùng tên khác mã ID cần đối chiếu</div>
                    <div className="text-sm font-extrabold text-amber-700">
                      {sampleAggregatePreview.sameNameDifferentIdCount} dòng
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Local Bookmarklet Guide Card for Same-Origin Execution on teachingmindx.top */}
          <div className="p-5 bg-blue-50/70 rounded-xl border border-blue-200 text-xs text-slate-700 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-200 text-blue-900 inline-block mb-1">
                  Tiện ích Cục bộ Mốc 1 & Mốc 4 [Chỉ đọc trên tab Teaching của Owner]
                </span>
                <h4 className="text-sm font-bold text-slate-900">
                  Bước 2: Mở Hướng dẫn & Nút Dấu trang Đọc thử toàn bộ phân trang trên Teaching
                </h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  Khi Owner đang mở tab <code className="font-mono font-semibold">https://teachingmindx.top/hocsinh.php</code> đã đăng nhập, bấm dấu trang cục bộ để đọc kiểm tra hết các trang DataTables và hiển thị báo cáo số lượng tổng hợp ngay tại chỗ.
                </p>
              </div>
              <a
                href="/teaching-readonly/index.html"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors whitespace-nowrap"
              >
                Mở Hướng dẫn Tiện ích ↗
              </a>
            </div>
            <div className="pt-2 border-t border-blue-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-blue-800">
              <span>
                • Đường dẫn hướng dẫn: <code className="font-mono font-semibold">/teaching-readonly/index.html</code>
              </span>
              <span>
                • Nguồn mục tiêu: <code className="font-mono font-semibold">https://teachingmindx.top/hocsinh.php</code>
              </span>
              <span>
                • Tuyệt đối không ghi dữ liệu học sinh thật vào TEST ở Mốc 4 (Chờ Mốc 6).
              </span>
            </div>
          </div>

          {/* Mốc 6 Official PROD Real Teaching Sync Card */}
          <div className="p-5 bg-emerald-50/70 rounded-xl border border-emerald-200 text-xs text-slate-700 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-200 text-emerald-900 inline-block mb-1">
                  Mốc 6 — Đồng bộ Chính thức trên PROD [Có Xem Trước & Xác Nhận]
                </span>
                <h4 className="text-sm font-bold text-slate-900">
                  Bước 3: Đồng bộ & Áp dụng Danh sách Lớp ROB & Học sinh Thật từ Teaching (PROD)
                </h4>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  1) Kéo nút dấu trang màu xanh bên phải lên thanh Bookmark Chrome, mở{' '}
                  <a
                    href="https://teachingmindx.top/hocsinh.php"
                    target="_blank"
                    rel="opener"
                    className="font-mono font-bold text-emerald-800 underline"
                  >
                    https://teachingmindx.top/hocsinh.php ↗
                  </a>{' '}
                  đã đăng nhập rồi bấm dấu trang để đọc đủ các trang. 2) Chọn tệp{' '}
                  <code className="font-mono font-semibold">teaching-snapshot.json</code> vừa tải (hoặc nhận tự động qua cửa sổ vừa mở) để Xem trước Chênh lệch rồi bấm <strong>Xác nhận Áp dụng Danh sách Thật</strong>.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <a
                  href={M6_REAL_SYNC_BOOKMARKLET_HREF}
                  onClick={(e) => {
                    e.preventDefault();
                    alert(
                      'Hãy kéo nút này thả lên thanh Dấu trang (Bookmarks Bar) của Chrome, sau đó bấm vào dấu trang khi đang ở tab https://teachingmindx.top/hocsinh.php!'
                    );
                  }}
                  className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold shadow-sm transition-colors cursor-grab"
                  title="Kéo thả nút này lên thanh Dấu trang (Bookmarks Bar) của Chrome"
                >
                  ⚡ Đọc Teaching & Tải Snapshot Đồng Bộ
                </a>
                <label className="px-3.5 py-2 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold shadow-sm transition-colors cursor-pointer">
                  <span>{isLoadingRealPreview ? 'Đang đọc...' : '📂 Chọn tệp Snapshot (.json) để Xem trước'}</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    disabled={isMutating || isLoadingRealPreview}
                    onChange={handleRealSnapshotFileSelect}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {realStatusMessage && (
              <div
                className={`p-3.5 rounded-xl text-xs flex items-start gap-2 ${
                  realStatusMessage.isError
                    ? 'bg-rose-50 border border-rose-300 text-rose-800'
                    : 'bg-white border border-emerald-300 text-emerald-900'
                }`}
              >
                {realStatusMessage.isError ? (
                  <IconAlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <IconCheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span className="font-semibold">{realStatusMessage.text}</span>
              </div>
            )}

            {realAbortError && (
              <div
                role="alert"
                className="p-4 rounded-xl bg-rose-50 border-2 border-rose-300 text-rose-900 text-xs space-y-1.5"
              >
                <div className="font-extrabold text-rose-800">
                  ✕ HỦY TOÀN BỘ LƯỢT ĐỌC SNAPSHOT THẬT ({realAbortError.code}) — 0 BẢN GHI ĐƯỢC GHI
                </div>
                <p>{realAbortError.message}</p>
              </div>
            )}

            {realDiffReport && !realAbortError && !isLoadingRealPreview && (
              <div className="bg-white rounded-xl border border-emerald-200 p-4 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-3 border-b border-slate-200 gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-slate-900">
                        Báo cáo Xem trước Chênh lệch Danh sách Thật (PROD)
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        {realSnapshotSourceLabel || 'Snapshot Teaching'} • {realDiffReport.pagination.pagesRead} trang ({realDiffReport.pagination.recordsFiltered} dòng)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Lọc lớp ROB (không phân biệt hoa/thường), không tự cấp mã PIN, không xóa học sinh vắng mặt, giữ trường hợp trùng tên/đổi lớp ở mục Cần Admin đối chiếu.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isMutating}
                      onClick={handleCancelRealPreview}
                      className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-50 disabled:opacity-50"
                    >
                      Hủy xem trước thật
                    </button>
                    <button
                      type="button"
                      disabled={isMutating}
                      onClick={handleApplyRealSync}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-sm"
                    >
                      {isApplyingRealSync
                        ? 'Đang lưu vào PROD...'
                        : `✓ Xác nhận Áp dụng Danh sách Thật (+${realDiffReport.counts.addedCount} mới, ${realDiffReport.counts.updatedCount} cập nhật)`}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
                    <div className="text-emerald-700 font-semibold text-[10px]">+ Thêm mới ROB</div>
                    <div className="text-base font-extrabold text-emerald-900">
                      {realDiffReport.counts.addedCount} HS (+{realDiffReport.counts.newClassesCount} lớp)
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200">
                    <div className="text-blue-700 font-semibold text-[10px]">↻ Cập nhật tên</div>
                    <div className="text-base font-extrabold text-blue-900">
                      {realDiffReport.counts.updatedCount} HS
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-slate-600 font-semibold text-[10px]">✓ Giữ nguyên</div>
                    <div className="text-base font-extrabold text-slate-900">
                      {realDiffReport.counts.unchangedCount} HS
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300">
                    <div className="text-amber-800 font-semibold text-[10px]">⚠ Cần Admin đối chiếu</div>
                    <div className="text-base font-extrabold text-amber-900">
                      {realDiffReport.counts.needsReviewCount} dòng
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-slate-600 font-semibold text-[10px]">⊘ Bỏ qua ngoài ROB/nghỉ</div>
                    <div className="text-base font-extrabold text-slate-700">
                      {realDiffReport.counts.ignoredCount} dòng
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-indigo-50 border border-indigo-200">
                    <div className="text-indigo-700 font-semibold text-[10px]">🛡 Vắng mặt bảo toàn</div>
                    <div className="text-base font-extrabold text-indigo-900">
                      {realDiffReport.counts.absentPreservedCount} HS
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
