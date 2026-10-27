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

// ============================================================================
// MỐC 5 FIXTURE: LỚP HỌC 14 BUỔI CHUẨN, KHÓA KẾ TIẾP & BỘ DỮ LIỆU ĐÓNG KHÓA
// ============================================================================

export const m5FixtureClass: ClassItem = {
  id: 'cls_rob_m5_01',
  code: 'ROB-K14-M5-01',
  name: 'Lớp Robotics Mốc 5 (Đủ 14 Buổi - Sẵn sàng nghiệm thu đóng khóa)',
  courseId: 'crs_m5_14',
  teacherId: 'usr_tea_1',
  status: 'active',
  is14SessionsConfirmed: true,
};

export const m5Course14: Course = {
  id: 'crs_m5_14',
  title: 'Robotics & Tự Động Hóa K14 M5 (14 Buổi chuẩn)',
  description: 'Chương trình cố định 14 buổi đã giảng dạy hoàn tất để thử nghiệm quy trình đóng khóa Mốc 5.',
  totalSessions: 14,
  createdAt: '2026-09-01T08:00:00.000Z',
};

export const m5NextCourse: Course = {
  id: 'crs_m5_next',
  title: 'Robotics & Tự Động Hóa Nâng Cao K15 (Khóa Kế Tiếp)',
  description: 'Khóa học kế tiếp sẵn sàng gán cho lớp sau khi kết thúc đợt học cũ thành công.',
  totalSessions: 14,
  createdAt: '2026-10-01T08:00:00.000Z',
};

export const m5Lessons14: Lesson[] = Array.from({ length: 14 }, (_, idx) => {
  const sessionNum = idx + 1;
  const hasQuiz = sessionNum !== 4 && sessionNum !== 8;
  const hasPractice = sessionNum !== 3 && sessionNum !== 7;

  return {
    id: `les_m5_${sessionNum.toString().padStart(2, '0')}`,
    courseId: 'crs_m5_14',
    sessionNumber: sessionNum,
    title: `Buổi ${sessionNum}: Chủ đề Mốc 5 - Bài học ${sessionNum}`,
    description: `Nội dung Buổi ${sessionNum} của khóa CRS-M5-14.`,
    materials: `### Tài liệu Buổi ${sessionNum}`,
    videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    status: 'published',
    hasQuiz,
    hasPractice,
    practiceMode: 'file_allowed',
    questions: hasQuiz
      ? [
          {
            id: `q_m5_${sessionNum}_1`,
            prompt: `Câu hỏi trắc nghiệm Buổi ${sessionNum}`,
            options: ['Đáp án A (Đúng)', 'Đáp án B', 'Đáp án C', 'Đáp án D'],
            correctOptionIndex: 0,
          },
        ]
      : [],
  };
});

export const m5Students: StudentProfile[] = [
  {
    id: 'usr_m5_stu_1',
    participantId: 'PART_M5_001',
    studentCode: 'HS_M5_001',
    fullName: 'Trần Văn Hoàn Tất',
    originalClassId: 'cls_rob_m5_01',
    currentClassId: 'cls_rob_m5_01',
    pinHash: 'MOCK_HASH_PIN_50011111',
    hasPin: true,
    pinIssuedAt: '2026-09-02T10:00:00.000Z',
    status: 'active',
    notes: 'Đã hoàn thành xuất sắc 14/14 buổi học',
  },
  {
    id: 'usr_m5_stu_2',
    participantId: 'PART_M5_002',
    studentCode: 'HS_M5_002',
    fullName: 'Nguyễn Thị Đang Học',
    originalClassId: 'cls_rob_m5_01',
    currentClassId: 'cls_rob_m5_01',
    pinHash: 'MOCK_HASH_PIN_50022222',
    hasPin: true,
    pinIssuedAt: '2026-09-02T10:00:00.000Z',
    status: 'active',
    notes: 'Chưa hoàn tất 14/14, có bài thực hành đang chờ chấm',
  },
  {
    id: 'usr_m5_stu_3',
    participantId: 'PART_M5_003',
    studentCode: 'HS_M5_003',
    fullName: 'Lê Văn Chưa Nộp',
    originalClassId: 'cls_rob_m5_01',
    currentClassId: 'cls_rob_m5_01',
    pinHash: 'MOCK_HASH_PIN_50033333',
    hasPin: true,
    pinIssuedAt: '2026-09-02T10:00:00.000Z',
    status: 'active',
    notes: 'Chưa nộp bất kỳ bài tập nào (0/14)',
  },
  {
    id: 'usr_m5_stu_4',
    participantId: 'PART_M5_004',
    studentCode: 'HS_M5_004',
    fullName: 'Hoàng Chuyển Lớp',
    originalClassId: 'cls_rob_m5_01',
    currentClassId: 'cls_rob_02',
    pinHash: 'MOCK_HASH_PIN_50044444',
    hasPin: true,
    pinIssuedAt: '2026-09-02T10:00:00.000Z',
    status: 'transferred',
    notes: 'Đã chuyển sang lớp ROB-K14-02 từ Buổi 5',
  },
  {
    id: 'usr_m5_stu_5',
    participantId: 'PART_M5_005',
    studentCode: 'HS_M5_005',
    fullName: 'Phạm Lưu Trữ',
    originalClassId: 'cls_rob_m5_01',
    currentClassId: 'cls_rob_m5_01',
    pinHash: 'MOCK_HASH_PIN_50055555',
    hasPin: true,
    pinIssuedAt: '2026-09-02T10:00:00.000Z',
    status: 'archived',
    notes: 'Tạm dừng học và đã lưu trữ tài khoản từ Buổi 8',
  },
];

export const m5Users: User[] = m5Students.map((s) => ({
  id: s.id,
  name: s.fullName,
  studentCode: s.studentCode,
  role: 'student',
  status: s.status === 'archived' ? 'archived' : 'active',
}));

// Tạo kết quả Quiz cho các học sinh M5
export const m5QuizResults: QuizResult[] = [];
// 1. Học sinh 1: Đạt tất cả 12 buổi có quiz
for (const les of m5Lessons14) {
  if (les.hasQuiz) {
    m5QuizResults.push({
      studentId: 'usr_m5_stu_1',
      lessonId: les.id,
      classId: 'cls_rob_m5_01',
      highestScore: 100,
      attemptsCount: 1,
      passed: true,
      lastAttemptAt: '2026-09-10T10:00:00.000Z',
    });
  }
}
// 2. Học sinh 2: Đạt 5 buổi đầu
for (let i = 0; i < 5; i++) {
  const les = m5Lessons14[i];
  if (les.hasQuiz) {
    m5QuizResults.push({
      studentId: 'usr_m5_stu_2',
      lessonId: les.id,
      classId: 'cls_rob_m5_01',
      highestScore: 80,
      attemptsCount: 1,
      passed: true,
      lastAttemptAt: '2026-09-15T10:00:00.000Z',
    });
  }
}
// 4. Học sinh 4 (chuyển lớp): Đạt Buổi 1, 2
for (let i = 0; i < 2; i++) {
  const les = m5Lessons14[i];
  if (les.hasQuiz) {
    m5QuizResults.push({
      studentId: 'usr_m5_stu_4',
      lessonId: les.id,
      classId: 'cls_rob_m5_01',
      highestScore: 90,
      attemptsCount: 1,
      passed: true,
      lastAttemptAt: '2026-09-08T10:00:00.000Z',
    });
  }
}
// 5. Học sinh 5 (lưu trữ): Đạt Buổi 1
m5QuizResults.push({
  studentId: 'usr_m5_stu_5',
  lessonId: m5Lessons14[0].id,
  classId: 'cls_rob_m5_01',
  highestScore: 75,
  attemptsCount: 1,
  passed: true,
  lastAttemptAt: '2026-09-05T10:00:00.000Z',
});

// Tạo bài nộp Thực hành cho các học sinh M5
export const m5Submissions: PracticeSubmission[] = [];
// 1. Học sinh 1: Đạt tất cả các buổi có thực hành
for (const les of m5Lessons14) {
  if (les.hasPractice) {
    m5Submissions.push({
      id: `sub_m5_001_${les.sessionNumber}`,
      studentId: 'usr_m5_stu_1',
      lessonId: les.id,
      classId: 'cls_rob_m5_01',
      type: 'file',
      content: `usr_m5_stu_1/${les.id}/project_b${les.sessionNumber}.zip`,
      fileSizeBytes: 1024 * 512, // 512 KB
      notes: `Bài nộp thực hành Buổi ${les.sessionNumber}`,
      status: 'approved',
      teacherFeedback: 'Bài làm xuất sắc, đạt yêu cầu.',
      submittedAt: '2026-09-12T10:00:00.000Z',
      gradedAt: '2026-09-13T10:00:00.000Z',
      gradedBy: 'usr_tea_1',
      canResubmit: false,
    });
  }
}
// 2. Học sinh 2: Đạt buổi 1-4, Buổi 6 đang ở trạng thái submitted (chờ chấm) kèm tệp giả
m5Submissions.push({
  id: 'sub_m5_002_06',
  studentId: 'usr_m5_stu_2',
  lessonId: m5Lessons14[5].id, // Buổi 6
  classId: 'cls_rob_m5_01',
  type: 'file',
  content: `usr_m5_stu_2/${m5Lessons14[5].id}/project_cho_cham.sb3`,
  fileSizeBytes: 1024 * 768, // 768 KB
  notes: 'Bài thực hành Buổi 6 của em, nhờ thầy chấm giúp ạ.',
  status: 'submitted', // Chờ giáo viên chấm
  submittedAt: '2026-09-20T14:00:00.000Z',
  canResubmit: true,
});

export const m5CohortMembers = m5Students.map((s) => ({
  classId: 'cls_rob_m5_01',
  courseId: 'crs_m5_14',
  studentId: s.id,
  participantId: s.participantId,
  studentCode: s.studentCode,
  fullName: s.fullName,
  membershipStatus: s.status,
  notesSnapshot: s.notes || '',
  isM5Fixture: true,
}));

export const m5CourseCloseFixture = {
  classItem: m5FixtureClass,
  course: m5Course14,
  nextCourse: m5NextCourse,
  lessons: m5Lessons14,
  students: m5Students,
  users: m5Users,
  quizResults: m5QuizResults,
  submissions: m5Submissions,
  cohortMembers: m5CohortMembers,
};

/**
 * R19-02: Kiểm tra một lớp có phải là lớp "ngoài" đối với học sinh mẫu Mốc 5 hay không.
 * Lớp mẫu (m5FixtureClass.id) không bao giờ là tham chiếu chéo. Chỉ trường `currentClassId`
 * (field = 'current') được phép khác lớp mẫu khi trùng đúng giá trị bộ mẫu khai báo (vd. học sinh
 * chuyển lớp số 4 ở 'cls_rob_02'); `originalClassId` (field = 'original') và mọi bản ghi
 * cohortMembers/quizResults/submissions (field = 'record') phải thuộc lớp mẫu, nếu không là tham chiếu chéo.
 */
export function isM5FixtureStudentForeignClass(
  studentId: string,
  classId?: string | null,
  field: 'current' | 'original' | 'record' = 'record'
): boolean {
  if (!classId || classId === m5FixtureClass.id) return false;
  if (field === 'current') {
    const fixtureStudent = m5Students.find((s) => s.id === studentId);
    if (!fixtureStudent) return false;
    return classId !== fixtureStudent.currentClassId;
  }
  return true;
}

/**
 * Trộn dữ liệu fixture Mốc 5 vào trạng thái ứng dụng.
 * R19-02 / R19-03: Chỉ dọn đúng phạm vi lớp mẫu; giữ nguyên khóa/bài học đang được lớp khác dùng,
 * học sinh mẫu đang gắn với lớp khác, kết quả/bài nộp của lớp khác và cohortMembers (tùy chọn) của lớp khác.
 */
export function seedM5CourseCloseFixtureData<T extends {
  classes: ClassItem[];
  courses: Course[];
  lessons: Lesson[];
  students: StudentProfile[];
  users: User[];
  quizResults: QuizResult[];
  submissions: PracticeSubmission[];
  cohortMembers?: any[];
}>(state: T, resetOnly = false): T {
  // Loại bỏ các mục M5 fixture cũ nếu có
  const nextClasses = state.classes.filter((c) => c.id !== m5FixtureClass.id);
  // R19-03: Lớp khác (ngoài lớp mẫu) đang dùng khóa mẫu thì khi đặt lại giữ nguyên khóa và toàn bộ bài học của khóa đó
  const otherClassUsesCourse14 = nextClasses.some((c) => c.courseId === m5Course14.id);
  const otherClassUsesNextCourse = nextClasses.some((c) => c.courseId === m5NextCourse.id);
  const keepCourse14 = resetOnly && otherClassUsesCourse14;
  const keepNextCourse = resetOnly && otherClassUsesNextCourse;
  const nextCourses = state.courses.filter(
    (c) =>
      (c.id !== m5Course14.id || keepCourse14) &&
      (c.id !== m5NextCourse.id || keepNextCourse)
  );
  // Bài học của khóa kế tiếp không bị dọn ở bất kỳ chế độ nào; bài học của khóa 14 buổi chỉ bị dọn khi không có lớp khác đang dùng khi đặt lại
  const nextLessons = state.lessons.filter((l) => l.courseId !== m5Course14.id || keepCourse14);
  // R17-01 / R3-06: Chỉ xóa đúng 5 học sinh mẫu Mốc 5; tuyệt đối không xóa học sinh, kết quả quiz hay bài nộp
  // của học sinh ngoài bộ mẫu dù họ đang thuộc lớp mẫu (currentClassId / originalClassId === m5FixtureClass.id)
  const m5StudentIds = new Set(m5Students.map((s) => s.id));
  // R19-02 / R19-03: Khi đặt lại, giữ nguyên học sinh mẫu đang có hồ sơ ở lớp khác (ngoài lớp mẫu)
  const keptStudentIds = new Set<string>(
    resetOnly
      ? state.students
          .filter(
            (s) =>
              m5StudentIds.has(s.id) &&
              (isM5FixtureStudentForeignClass(s.id, s.currentClassId, 'current') ||
                isM5FixtureStudentForeignClass(s.id, s.originalClassId, 'original') ||
                (Array.isArray(state.cohortMembers) &&
                  state.cohortMembers.some(
                    (cm) =>
                      (cm.studentId || cm.student_id || cm.id || '') === s.id &&
                      isM5FixtureStudentForeignClass(s.id, cm.classId || cm.class_id || '', 'record')
                  )) ||
                state.quizResults.some(
                  (q) => q.studentId === s.id && isM5FixtureStudentForeignClass(s.id, q.classId, 'record')
                ) ||
                state.submissions.some(
                  (sub) => sub.studentId === s.id && isM5FixtureStudentForeignClass(s.id, sub.classId, 'record')
                ))
          )
          .map((s) => s.id)
      : []
  );
  const nextStudents = state.students.filter((s) => !m5StudentIds.has(s.id) || keptStudentIds.has(s.id));
  const nextUsers = state.users.filter((u) => !m5StudentIds.has(u.id) || keptStudentIds.has(u.id));
  // R19-02: Chỉ xóa bản ghi thuộc đúng lớp mẫu (hoặc chưa gắn lớp); giữ nguyên mọi bản ghi của lớp khác
  const nextQuiz = state.quizResults.filter(
    (q) => !(m5StudentIds.has(q.studentId) && (!q.classId || q.classId === m5FixtureClass.id))
  );
  const nextSubs = state.submissions.filter(
    (s) => !(m5StudentIds.has(s.studentId) && (!s.classId || s.classId === m5FixtureClass.id))
  );
  const cohortPatch: { cohortMembers?: any[] } = {};
  if (Array.isArray(state.cohortMembers)) {
    const preservedCohort = state.cohortMembers.filter(
      (cm) => (cm.classId || cm.class_id || '') !== m5FixtureClass.id
    );
    cohortPatch.cohortMembers = resetOnly ? preservedCohort : [...preservedCohort, ...m5CohortMembers];
  }

  if (resetOnly) {
    return {
      ...state,
      classes: nextClasses,
      courses: nextCourses,
      lessons: nextLessons,
      students: nextStudents,
      users: nextUsers,
      quizResults: nextQuiz,
      submissions: nextSubs,
      ...cohortPatch,
    };
  }

  return {
    ...state,
    classes: [m5FixtureClass, ...nextClasses],
    courses: [m5Course14, m5NextCourse, ...nextCourses],
    lessons: [...nextLessons, ...m5Lessons14],
    students: [...nextStudents, ...m5Students],
    users: [...nextUsers, ...m5Users],
    quizResults: [...nextQuiz, ...m5QuizResults],
    submissions: [...nextSubs, ...m5Submissions],
    ...cohortPatch,
  };
}

