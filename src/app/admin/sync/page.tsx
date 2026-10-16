'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
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

export default function AdminSyncPage() {
  const router = useRouter();
  const { currentUser, isLiveMode, previewTeachingSync, applyTeachingSync } = useStore();

  const [activeTab, setActiveTab] = useState<'mock_fixture' | 'real_source'>('mock_fixture');
  const [isLoading, setIsLoading] = useState(false);
  const [isApplyingSync, setIsApplyingSync] = useState(false);
  const [diffReport, setDiffReport] = useState<any | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [simulatedError, setSimulatedError] = useState<string | null>(null);

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

  // Load and preview mock fixture
  const handleFetchMockFixture = async () => {
    setIsLoading(true);
    setStatusMessage(null);
    setSimulatedError(null);

    try {
      const res = await fetch('/fixtures/teaching_mock.json');
      const data = await res.json();

      setTimeout(async () => {
        setIsLoading(false);
        const result = await previewTeachingSync(data);
        if (result.success && result.report) {
          setDiffReport(result.report);
          setStatusMessage({
            text: `Đã nạp và phân tích cấu trúc DataTables thành công: ${result.report.totalValid} học sinh hợp lệ (lớp ROB, trạng thái Đang học).`,
            isError: false,
          });
        }
      }, 500);
    } catch (err) {
      setIsLoading(false);
      setStatusMessage({ text: 'Lỗi tải tệp fixture mẫu từ public/fixtures/teaching_mock.json', isError: true });
    }
  };

  // Simulate invalid DataTables / Session expired error
  const handleSimulateSourceError = (errorType: 'expired' | 'malformed') => {
    setIsLoading(true);
    setDiffReport(null);
    setStatusMessage(null);

    setTimeout(() => {
      setIsLoading(false);
      if (errorType === 'expired') {
        setSimulatedError(
          'Lỗi phiên làm việc: Phiên đăng nhập Teaching của Owner đã hết hạn (401/Redirect). Thao tác đọc danh sách đã bị dừng lại hoàn toàn. Không áp dụng một phần dữ liệu.'
        );
      } else {
        setSimulatedError(
          'Lỗi cấu trúc phản hồi: Tham số draw hoặc recordsFiltered không khớp với số bản ghi thực nhận. Thao tác đồng bộ đã bị hủy bỏ để đảm bảo tính toàn vẹn.'
        );
      }
    }, 400);
  };

  const handleApplySync = async () => {
    if (!diffReport || isApplyingSync) return;
    setIsApplyingSync(true);
    await new Promise((r) => setTimeout(r, 400));
    const res = await applyTeachingSync(diffReport);
    setIsApplyingSync(false);
    if (res.success) {
      setStatusMessage({ text: res.message, isError: false });
      setDiffReport(null);
    } else {
      setStatusMessage({ text: res.message, isError: true });
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-800">
              Quản trị Admin
            </span>
            <span className="text-xs text-slate-400 font-mono">[UI-08]</span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 mt-1">
            Đồng bộ Danh sách Học sinh Teaching MindX
          </h1>
          <p className="text-xs text-slate-500">
            Xem trước chênh lệch, đối chiếu tiền tố lớp ROB, kiểm tra cấu trúc DataTables và áp dụng an toàn.
          </p>
        </div>
      </div>

      {/* Source Selector Tab */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl overflow-hidden shadow-sm">
        <button
          onClick={() => {
            setActiveTab('mock_fixture');
            setStatusMessage(null);
            setSimulatedError(null);
          }}
          className={`flex-1 py-3 px-4 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'mock_fixture'
              ? 'border-blue-600 text-blue-600 bg-blue-50/40'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          1. Nguồn Dữ liệu giả TEST (Fixture DataTables)
        </button>
        <button
          onClick={() => {
            setActiveTab('real_source');
            setStatusMessage(null);
            setSimulatedError(null);
          }}
          className={`flex-1 py-3 px-4 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'real_source'
              ? 'border-blue-600 text-blue-600 bg-blue-50/40'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          2. Nguồn Teaching MindX Thật (Chế độ an toàn Mốc 1)
        </button>
      </div>

      {/* Tab 1: Mock Fixture Testing */}
      {activeTab === 'mock_fixture' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Thử nghiệm đối chiếu với tập dữ liệu mẫu DataTables
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Nạp tệp fixture giả định <code className="font-mono text-blue-600">/public/fixtures/teaching_mock.json</code>{' '}
                  để kiểm chứng quy tắc lọc tiền tố lớp ROB, loại bỏ học sinh nghỉ học/lớp đóng, và xem trước danh sách.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  disabled={isLoading}
                  onClick={handleFetchMockFixture}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5"
                >
                  {isLoading ? <IconRefreshCw className="w-4 h-4 animate-spin" /> : <IconDatabase className="w-4 h-4" />}
                  <span>Lấy dữ liệu giả & Xem trước</span>
                </button>
              </div>
            </div>

            {/* Error simulation buttons for QA testing */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-slate-500">Mô phỏng tình huống lỗi:</span>
              <button
                type="button"
                onClick={() => handleSimulateSourceError('expired')}
                className="px-2.5 py-1 rounded bg-purple-50 text-purple-700 hover:bg-purple-100 font-semibold border border-purple-200"
              >
                Mô phỏng hết phiên (401)
              </button>
              <button
                type="button"
                onClick={() => handleSimulateSourceError('malformed')}
                className="px-2.5 py-1 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 font-semibold border border-amber-200"
              >
                Mô phỏng sai lệch Draw / Mất gói
              </button>
            </div>
          </div>

          {/* Status Alert */}
          {statusMessage && (
            <div
              className={`p-4 rounded-xl text-xs flex items-start gap-2.5 animate-in fade-in ${
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
              <span className="font-medium flex-1">{statusMessage.text}</span>
            </div>
          )}

          {/* Simulated Error Alert */}
          {simulatedError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs flex items-start gap-2.5 animate-in fade-in">
              <IconAlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
              <div className="flex-1">
                <span className="font-bold block mb-1">DỪNG LƯỢT ĐỒNG BỘ:</span>
                <span className="leading-relaxed">{simulatedError}</span>
              </div>
            </div>
          )}

          {/* Diff Preview Display */}
          {diffReport && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Báo cáo xem trước chênh lệch (Diff Preview)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Kiểm tra các thay đổi trước khi áp dụng vào bộ nhớ tạm TEST. Dòng vắng mặt không bị xóa.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDiffReport(null)}
                    className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-50"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="button"
                    disabled={isApplyingSync}
                    onClick={handleApplySync}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5"
                  >
                    {isApplyingSync ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Đang áp dụng...</span>
                      </>
                    ) : (
                      <>
                        <IconCheck className="w-4 h-4" />
                        <span>Xác nhận Áp dụng ({diffReport.totalValid} học sinh)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Added Students Table */}
              <div>
                <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600" />
                  <span>Học sinh mới hợp lệ cần thêm ({diffReport.added.length})</span>
                </h4>
                <div className="border border-slate-200 rounded-lg overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2">Mã học sinh nguồn</th>
                        <th className="px-3 py-2">Họ và tên</th>
                        <th className="px-3 py-2">Mã lớp</th>
                        <th className="px-3 py-2">Hành động dự kiến</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {diffReport.added.map((item: any) => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono font-bold text-blue-600">{item.id}</td>
                          <td className="px-3 py-2 font-semibold text-slate-800">{item.name}</td>
                          <td className="px-3 py-2 font-mono font-bold text-slate-700">{item.classCode}</td>
                          <td className="px-3 py-2">
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700">
                              + Thêm mới vào TEST
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Ignored / Skipped Students */}
              <div>
                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  <span>Dòng bị bỏ qua theo quy tắc ({diffReport.ignored.length})</span>
                </h4>
                <div className="border border-slate-200 rounded-lg overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2">Mã</th>
                        <th className="px-3 py-2">Tên</th>
                        <th className="px-3 py-2">Lớp</th>
                        <th className="px-3 py-2">Lý do bỏ qua</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-500">
                      {diffReport.ignored.map((item: any) => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono">{item.id}</td>
                          <td className="px-3 py-2">{item.name}</td>
                          <td className="px-3 py-2 font-mono">{item.classCode}</td>
                          <td className="px-3 py-2 text-rose-600 font-medium">{item.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border text-[11px] text-slate-600 space-y-1">
                <span className="font-bold text-slate-800 block">Cam kết an toàn đồng bộ:</span>
                <div>• Đồng bộ KHÔNG tự động cấp mã PIN và KHÔNG tạo tệp CSV PIN.</div>
                <div>• Đồng bộ KHÔNG tự xóa các học sinh vắng mặt trong lần đọc này.</div>
                <div>• Không ghi đè mật khẩu hoặc kết quả điểm của học sinh hiện có.</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Real Teaching Notice & Safety Rules */}
      {activeTab === 'real_source' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0">
              <IconShield className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-extrabold text-slate-900">
                Quy trình Đọc thử Teaching An Toàn (Mục 5 Kế hoạch v3)
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Để bảo vệ an toàn tối đa cho hệ thống và thông tin cá nhân của học sinh:
              </p>
              <ul className="list-disc list-inside text-xs text-slate-700 space-y-1 pl-1">
                <li>
                  <strong>Không chuyển mật khẩu hay cookie:</strong> Ứng dụng web MINDX LEARN không bao giờ yêu cầu,
                  lưu trữ hoặc gửi mật khẩu/cookie của Teaching lên bất kỳ máy chủ nào.
                </li>
                <li>
                  <strong>Owner không cần kỹ thuật:</strong> Không yêu cầu Owner mở F12, sao chép JSON hay chạy lệnh
                  Terminal. Owner chỉ cần tự đăng nhập Teaching trên trình duyệt rồi bấm nút trên giao diện tiện ích
                  cục bộ đã được kiểm tra.
                </li>
                <li>
                  <strong>Phạm vi Mốc 1:</strong> Đội triển khai thực hiện spike kỹ thuật ở chế độ CHỈ ĐỌC (Read-only);
                  báo cáo chỉ giữ các con số tổng hợp, không lưu tên hoặc mã học sinh thật vào TEST hay log.
                </li>
                <li>
                  <strong>Không ghi dữ liệu thật tại Mốc 1:</strong> Việc áp dụng học sinh thật vào PROD chỉ bắt đầu
                  tại Mốc 6 sau khi toàn bộ quy trình và kết quả thử tải được Owner phê duyệt riêng.
                </li>
              </ul>
            </div>
          </div>

          <div className="p-5 bg-blue-50/70 rounded-xl border border-blue-200 text-xs text-slate-700 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-200 text-blue-900 inline-block mb-1">
                  Tiện ích Cục bộ Mốc 1 [M1-C2]
                </span>
                <h4 className="text-sm font-bold text-slate-900">
                  Hướng dẫn Sử dụng Tiện ích Đọc Thử Teaching (Chỉ Đọc Cục bộ)
                </h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  Tiện ích chạy hoàn toàn cục bộ trên trình duyệt Owner. Không gửi dữ liệu từ Teaching vào webapp,
                  không lưu cookie hay thông tin cá nhân.
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
              <span>• Đường dẫn hướng dẫn trên bản đang mở: <code className="font-mono font-semibold">/teaching-readonly/index.html</code> (chỉ xem hướng dẫn, không kết nối hay đồng bộ thật)</span>
              <span>• Nguồn mục tiêu: <code className="font-mono font-semibold">https://teachingmindx.top/hocsinh.php</code></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
