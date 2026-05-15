const fs = require('fs');

const path = 'backend/prisma/schema.prisma';
let code = fs.readFileSync(path, 'utf8');

const modelsWithMissingIsActive = [
  'AcademicYear', 'UserCenterAssignment', 'UserActivityAssignment', 'Batch',
  'StudentTransfer', 'BatchEnrollment', 'ParentStudent', 'AttendanceSession',
  'AttendanceRecord', 'Exam', 'ExamScore', 'StudentSkillLog', 'FormAssignment',
  'FormSubmission', 'MessageThread', 'ThreadParticipant', 'Message',
  'EquipmentLog', 'Announcement', 'Alert', 'AuditLog', 'ActivityStatusLog'
];

modelsWithMissingIsActive.forEach(model => {
  const regex = new RegExp(`(model ${model} \\{[^}]*?)(\n\\})`, 's');
  code = code.replace(regex, (match, p1, p2) => {
    if (!p1.includes('isActive')) {
      return `${p1}\n  isActive Boolean @default(true) @map("is_active")${p2}`;
    }
    return match;
  });
});

fs.writeFileSync(path, code);
console.log('Schema updated.');
