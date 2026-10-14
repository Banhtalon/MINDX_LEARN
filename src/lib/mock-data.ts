import {
  User,
  Course,
  Lesson,
  ClassItem,
  StudentProfile,
  QuizResult,
  PracticeSubmission,
} from './types';

export const initialUsers: User[] = [
  {
    id: 'usr_admin_1',
    name: 'Admin Quản Trị Hệ Thống',
    email: 'admin@mindx.edu.vn',
    role: 'admin',
    status: 'active',
  },
  {
    id: 'usr_tea_1',
    name: 'Thầy Hoàng Minh',
    email: 'hoang.minh@mindx.edu.vn',
    role: 'teacher',
    status: 'active',
    assignedClassIds: ['cls_rob_01', 'cls_rob_02'],
  },
  {
    id: 'usr_tea_2',
    name: 'Cô Thu Trang (Chưa phân lớp)',
    email: 'thu.trang@mindx.edu.vn',
    role: 'teacher',
    status: 'active',
    assignedClassIds: [],
  },
  {
    id: 'usr_stu_1',
    name: 'Lê Bảo Nam',
    studentCode: 'HS_ROB_001',
    role: 'student',
    status: 'active',
  },
  {
    id: 'usr_stu_2',
    name: 'Phạm Quỳnh Chi',
    studentCode: 'HS_ROB_002',
    role: 'student',
    status: 'active',
  },
];

export const initialCourses: Course[] = [
  {
    id: 'crs_rob_k14',
    title: 'Robotics & Tự Động Hóa K14 (14 Buổi chuẩn)',
    description: 'Chương trình Robotics cố định 14 buổi thực hành và trắc nghiệm chuyên sâu.',
    totalSessions: 14,
    createdAt: '2026-09-01T08:00:00.000Z',
  },
];

export const initialLessons: Lesson[] = Array.from({ length: 14 }, (_, index) => {
  const sessionNum = index + 1;
  const isDraft = sessionNum >= 13; // Buổi 13, 14 là Nháp
  const hasQuiz = sessionNum !== 4 && sessionNum !== 8; // Buổi 4 và 8 chỉ thực hành
  const hasPractice = sessionNum !== 3 && sessionNum !== 7; // Buổi 3 và 7 chỉ quiz

  return {
    id: `les_rob_${sessionNum.toString().padStart(2, '0')}`,
    courseId: 'crs_rob_k14',
    sessionNumber: sessionNum,
    title: `Buổi ${sessionNum}: ${getSessionTitle(sessionNum)}`,
    description: `Nội dung học tập trọng tâm của Buổi ${sessionNum}. Học sinh xem bài giảng video, nghiên cứu tài liệu và hoàn thành các bài tập đánh giá.`,
    materials: `### Tài liệu học tập Buổi ${sessionNum}\n- Hướng dẫn lắp ráp khối điều khiển.\n- Bảng tra cứu tập lệnh cảm biến siêu âm.\n- Link tài liệu: [Tài liệu bài học PDF](https://mindx.edu.vn/mock-docs/b${sessionNum})`,
    videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    status: isDraft ? 'draft' : 'published',
    hasQuiz,
    hasPractice,
    practiceMode: sessionNum % 2 === 0 ? 'file_allowed' : 'link_only',
    questions: hasQuiz
      ? [
          {
            id: `q_${sessionNum}_1`,
            prompt: `Câu hỏi 1 (Buổi ${sessionNum}): Nguyên lý cơ bản của cảm biến ở bài học này là gì?`,
            options: [
              'Phát xung siêu âm và đo thời gian phản xạ trở lại',
              'Đo trực tiếp dòng điện rò trong mạch',
              'Sử dụng camera quét mã vạch trên bề mặt',
              'Dựa vào nhiệt độ môi trường xung quanh',
            ],
            correctOptionIndex: 0,
          },
          {
            id: `q_${sessionNum}_2`,
            prompt: `Câu hỏi 2 (Buổi ${sessionNum}): Để tránh va chạm chướng ngại vật ở cự ly 15cm, robot cần thực hiện lệnh nào?`,
            options: [
              'Tăng tốc động cơ lên công suất tối đa',
              'Dừng hoặc đổi hướng quay 90 độ',
              'Tắt nguồn toàn bộ hệ thống ngay lập tức',
              'Bật đèn tín hiệu nhưng giữ nguyên hướng đi',
            ],
            correctOptionIndex: 1,
          },
        ]
      : [],
  };
});

function getSessionTitle(n: number): string {
  const titles = [
    'Giới thiệu phần cứng Robot và bo mạch điều khiển',
    'Cảm biến khoảng cách siêu âm và thuật toán tránh vật cản',
    'Lập trình điều khiển động cơ bước và bánh lái',
    'Thực hành thiết kế khung xe tự hành chuẩn 4 bánh',
    'Tích hợp cảm biến dò line và căn chỉnh độ nhạy',
    'Thuật toán bám đường PID cơ bản',
    'Giao tiếp Bluetooth và điều khiển qua ứng dụng di động',
    'Thực hành đóng gói cơ cấu cánh tay gắp vật phẩm',
    'Lập trình servo gắp nhả tự động theo tọa độ',
    'Tối ưu hóa mạch nguồn và quản lý pin an toàn',
    'Thử thách vượt mê cung tự động theo quy tắc tay phải',
    'Đồng bộ tín hiệu không dây đa robot',
    'Thiết kế bài toán cứu hộ mô phỏng (Dự thảo)',
    'Tổng duyệt đồ án tốt nghiệp K14 (Dự thảo)',
  ];
  return titles[n - 1] || `Chủ đề kiến thức Buổi ${n}`;
}

export const initialClasses: ClassItem[] = [
  {
    id: 'cls_rob_01',
    code: 'ROB-K14-01',
    name: 'Lớp Robotics K14 Chiều Thứ 7 (Cơ sở Hà Nội)',
    courseId: 'crs_rob_k14',
    teacherId: 'usr_tea_1',
    status: 'active',
    is14SessionsConfirmed: true,
  },
  {
    id: 'cls_rob_02',
    code: 'ROB-K14-02',
    name: 'Lớp Robotics K14 Sáng Chủ Nhật',
    courseId: 'crs_rob_k14',
    teacherId: 'usr_tea_1',
    status: 'active',
    is14SessionsConfirmed: false,
  },
  {
    id: 'cls_rob_03',
    code: 'ROB-K14-03',
    name: 'Lớp Robotics Mới (Chưa gán khóa học)',
    courseId: null,
    teacherId: null,
    status: 'active',
    is14SessionsConfirmed: false,
  },
];

export const initialStudents: StudentProfile[] = [
  {
    id: 'usr_stu_1',
    participantId: 'PART_ROB01_001',
    studentCode: 'HS_ROB_001',
    fullName: 'Lê Bảo Nam',
    currentClassId: 'cls_rob_01',
    originalClassId: 'cls_rob_01',
    pinHash: 'MOCK_HASH_PIN_88889999', // Đã cấp PIN giả lập
    pinIssuedAt: '2026-09-02T10:00:00.000Z',
    status: 'active',
    notes: 'Học sinh năng nổ, hoàn thành bài sớm',
  },
  {
    id: 'usr_stu_2',
    participantId: 'PART_ROB01_002',
    studentCode: 'HS_ROB_002',
    fullName: 'Phạm Quỳnh Chi',
    currentClassId: 'cls_rob_01',
    originalClassId: 'cls_rob_01',
    pinHash: null, // Chưa có PIN - dùng để kiểm tra cấp PIN lần đầu
    pinIssuedAt: null,
    status: 'active',
    notes: 'Học sinh mới nhập học, chờ cấp mã PIN lần đầu',
  },
  {
    id: 'usr_stu_3',
    participantId: 'PART_ROB01_003',
    studentCode: 'HS_ROB_003',
    fullName: 'Nguyễn Tiến Đạt (Đã chuyển lớp)',
    currentClassId: 'cls_rob_02',
    originalClassId: 'cls_rob_01',
    pinHash: 'MOCK_HASH_PIN_11223344',
    pinIssuedAt: '2026-09-02T10:00:00.000Z',
    status: 'transferred', // Học sinh đã chuyển lớp - vẫn phải có mặt trong CSV 14 buổi của lớp cũ cls_rob_01
    notes: 'Chuyển sang lớp ROB-K14-02 từ tuần thứ 4',
  },
  {
    id: 'usr_stu_4',
    participantId: 'PART_ROB01_004',
    studentCode: 'HS_ROB_004',
    fullName: 'Vũ Minh Khôi (Đã lưu trữ)',
    currentClassId: 'cls_rob_01',
    originalClassId: 'cls_rob_01',
    pinHash: 'MOCK_HASH_PIN_55667788',
    pinIssuedAt: '2026-09-02T10:00:00.000Z',
    status: 'archived', // Học sinh bị lưu trữ - vẫn thuộc đợt và xuất hiện trong CSV đóng khóa
    notes: 'Tạm dừng học vì lý do sức khỏe',
  },
  {
    id: 'usr_stu_5',
    participantId: 'PART_ROB02_001',
    studentCode: 'HS_ROB_005',
    fullName: 'Trần Đăng Khoa',
    currentClassId: 'cls_rob_02',
    originalClassId: 'cls_rob_02',
    pinHash: 'MOCK_HASH_PIN_99001122',
    pinIssuedAt: '2026-09-05T10:00:00.000Z',
    status: 'active',
  },
];

export const initialQuizResults: QuizResult[] = [
  {
    studentId: 'usr_stu_1',
    lessonId: 'les_rob_01',
    highestScore: 100,
    attemptsCount: 2,
    passed: true,
    lastAttemptAt: '2026-09-05T14:30:00.000Z',
  },
  {
    studentId: 'usr_stu_1',
    lessonId: 'les_rob_02',
    highestScore: 80,
    attemptsCount: 1,
    passed: true,
    lastAttemptAt: '2026-09-12T15:00:00.000Z',
  },
  {
    studentId: 'usr_stu_1',
    lessonId: 'les_rob_03',
    highestScore: 50, // Chưa đạt (ngưỡng 70%)
    attemptsCount: 1,
    passed: false,
    lastAttemptAt: '2026-09-19T16:00:00.000Z',
  },
  {
    studentId: 'usr_stu_3',
    lessonId: 'les_rob_01',
    highestScore: 90,
    attemptsCount: 1,
    passed: true,
    lastAttemptAt: '2026-09-05T14:35:00.000Z',
  },
];

export const initialSubmissions: PracticeSubmission[] = [
  {
    id: 'sub_001',
    studentId: 'usr_stu_1',
    lessonId: 'les_rob_01',
    type: 'link',
    content: 'https://github.com/mindx-student/robot-arm-les01',
    notes: 'Bài làm lập trình khởi tạo cổng GPIO của em',
    status: 'approved',
    teacherFeedback: 'Bài làm rất tốt, code sạch sẽ và có chú thích rõ ràng. Đạt.',
    submittedAt: '2026-09-06T09:00:00.000Z',
    gradedAt: '2026-09-07T11:00:00.000Z',
    gradedBy: 'usr_tea_1',
    canResubmit: false, // Đã đạt, bị khóa nộp lại trừ khi giáo viên mở lại
  },
  {
    id: 'sub_002',
    studentId: 'usr_stu_1',
    lessonId: 'les_rob_02',
    type: 'file',
    content: 'du_an_xe_sieu_am_nam.sb3',
    fileSizeBytes: 1024 * 512, // 512 KB <= 2MB
    notes: 'File dự án Scratch 3.0 mô phỏng xe né vật cản',
    status: 'submitted', // Chờ giáo viên chấm
    submittedAt: '2026-09-13T10:00:00.000Z',
    canResubmit: true,
  },
  {
    id: 'sub_003',
    studentId: 'usr_stu_2',
    lessonId: 'les_rob_01',
    type: 'link',
    content: 'https://scratch.mit.edu/projects/mock-002',
    notes: 'Bài nộp lần 1',
    status: 'needs_revision',
    teacherFeedback: 'Em cần xem lại khối lệnh điều kiện rẽ trái, hiện tại xe đang quay vòng liên tục.',
    submittedAt: '2026-09-07T14:00:00.000Z',
    gradedAt: '2026-09-08T09:30:00.000Z',
    gradedBy: 'usr_tea_1',
    canResubmit: true, // Cần làm lại -> học sinh nộp lại được
  },
];
