const ROLES = Object.freeze({
  STUDENT: 'student',
  SUPER_ADMIN: 'super_admin',
  SCHOOL_ADMIN: 'school_admin',
  LECTURER: 'lecturer',
  MEDIA_ADMIN: 'media_admin',
  SUPPORT: 'support',
});

const STAFF_ROLES = [ROLES.SUPER_ADMIN, ROLES.SCHOOL_ADMIN, ROLES.LECTURER, ROLES.MEDIA_ADMIN, ROLES.SUPPORT];

const PERMISSIONS = Object.freeze({
  APPLICATIONS_READ: 'applications.read',
  APPLICATIONS_REVIEW: 'applications.review',
  STUDENTS_READ: 'students.read',
  STUDENTS_WRITE: 'students.write',
  ACADEMICS_MANAGE: 'academics.manage',
  LECTURES_WRITE: 'lectures.write',
  LECTURES_PUBLISH: 'lectures.publish',
  RECORDS_READ_ALL: 'records.read_all',
  RECORDS_READ_OWN_COURSES: 'records.read_own_courses',
  ATTENDANCE_MANAGE: 'attendance.manage',
  CERTIFICATES_ISSUE: 'certificates.issue',
  CONTENT_NGO: 'content.ngo',
  CONTENT_RADIO: 'content.radio',
  CONTENT_PAGES: 'content.pages',
  SUPPORT_READ: 'support.read',
  SUPPORT_RESPOND: 'support.respond',
  FAQ_MANAGE: 'faq.manage',
  STAFF_MANAGE: 'staff.manage',
  SETTINGS_MANAGE: 'settings.manage',
  PAYMENTS_VIEW: 'payments.view',
  LOGS_VIEW: 'logs.view',
});

const P = PERMISSIONS;

// Default permissions per role. Super Admin can grant or revoke individual permissions per person.
const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.SUPER_ADMIN]: Object.values(PERMISSIONS),
  [ROLES.SCHOOL_ADMIN]: [
    P.APPLICATIONS_READ, P.APPLICATIONS_REVIEW, P.STUDENTS_READ, P.STUDENTS_WRITE, P.ACADEMICS_MANAGE,
    P.LECTURES_WRITE, P.LECTURES_PUBLISH, P.RECORDS_READ_ALL, P.ATTENDANCE_MANAGE, P.CERTIFICATES_ISSUE,
    P.CONTENT_NGO, P.CONTENT_RADIO, P.SUPPORT_READ, P.SUPPORT_RESPOND, P.FAQ_MANAGE, P.PAYMENTS_VIEW,
  ],
  [ROLES.LECTURER]: [P.LECTURES_WRITE, P.RECORDS_READ_OWN_COURSES, P.SUPPORT_READ, P.SUPPORT_RESPOND],
  [ROLES.MEDIA_ADMIN]: [P.CONTENT_NGO, P.CONTENT_RADIO],
  [ROLES.SUPPORT]: [P.SUPPORT_READ, P.SUPPORT_RESPOND, P.FAQ_MANAGE],
  [ROLES.STUDENT]: [],
});

module.exports = { ROLES, STAFF_ROLES, PERMISSIONS, ROLE_PERMISSIONS };
