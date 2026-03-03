const express = require('express');
const cors = require('cors');
const crypto = require('node:crypto');
const {
  getStudents,
  saveStudents,
  getAuditLogs,
  appendAuditLog,
} = require('./storage');

const app = express();
const ASSIGNMENT_KEYS = [
  'assignment1',
  'assignment2',
  'assignment3',
  'assignment4',
  'assignment5',
];

app.use(cors());
app.use(express.json());

const TOKEN_TTL_MS = 1000 * 60 * 60 * 12;
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 120);

const requestCounters = new Map();
const monitoringState = {
  startedAt: Date.now(),
  totalRequests: 0,
  totalErrors: 0,
};

function getAuthConfig() {
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.AUTH_SECRET || process.env.ADMIN_PASSWORD || 'dev-auth-secret';

  const adminEmails = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const facultyEmails = String(process.env.FACULTY_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const studentEmails = String(process.env.STUDENT_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return {
    password,
    secret,
    adminEmails,
    facultyEmails,
    studentEmails,
  };
}

function isAuthEnabled() {
  const { password, adminEmails, facultyEmails, studentEmails } = getAuthConfig();
  return Boolean(
    password || adminEmails.length || facultyEmails.length || studentEmails.length
  );
}

function getClientIp(req) {
  const forwardedFor = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  return forwardedFor || req.socket?.remoteAddress || 'unknown';
}

function rateLimit(req, res, next) {
  if (req.path === '/api/health') {
    return next();
  }

  const now = Date.now();
  const key = getClientIp(req);
  const existing = requestCounters.get(key);

  if (!existing || now >= existing.resetAt) {
    requestCounters.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return next();
  }

  if (existing.count >= RATE_LIMIT_MAX) {
    const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    return next(toError('Too many requests', 429));
  }

  existing.count += 1;
  return next();
}

app.use((req, _res, next) => {
  monitoringState.totalRequests += 1;
  req.requestId = crypto.randomUUID();
  next();
});

app.use(rateLimit);

function toBase64Url(text) {
  return Buffer.from(text, 'utf8').toString('base64url');
}

function fromBase64Url(encoded) {
  return Buffer.from(encoded, 'base64url').toString('utf8');
}

function signPayload(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function createAuthToken(user) {
  const { secret } = getAuthConfig();
  const payload = {
    sub: user.sub,
    name: user.name,
    email: user.email,
    role: user.role,
    rollNo: user.rollNo || '',
    exp: Date.now() + TOKEN_TTL_MS,
  };

  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

function verifyAuthToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return false;
  }

  const [encodedPayload, providedSignature] = token.split('.');
  if (!encodedPayload || !providedSignature) {
    return false;
  }

  const { secret } = getAuthConfig();
  const expectedSignature = signPayload(encodedPayload, secret);

  let signatureMatches = false;
  try {
    signatureMatches = crypto.timingSafeEqual(
      Buffer.from(providedSignature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }

  if (!signatureMatches) {
    return false;
  }

  try {
    const decoded = JSON.parse(fromBase64Url(encodedPayload));
    if (!decoded || typeof decoded.exp !== 'number' || decoded.exp <= Date.now()) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

function getTokenFromRequest(req) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) {
    return '';
  }

  return header.slice(7).trim();
}

function requireAuth(req, _res, next) {
  if (!isAuthEnabled()) {
    req.user = {
      sub: 'demo-admin',
      role: 'admin',
      name: 'Demo Admin',
      email: 'demo@local',
      rollNo: '',
    };
    return next();
  }

  const token = getTokenFromRequest(req);
  const decoded = verifyAuthToken(token);
  if (!decoded) {
    return next(toError('Unauthorized', 401));
  }

  req.user = decoded;

  return next();
}

function requireRole(roles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(toError('Unauthorized', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(toError('Forbidden', 403));
    }

    return next();
  };
}

function resolveRole(email, requestedRole) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedRequestedRole = String(requestedRole || '').trim().toLowerCase();
  const { adminEmails, facultyEmails, studentEmails } = getAuthConfig();

  if (adminEmails.includes(normalizedEmail)) return 'admin';
  if (facultyEmails.includes(normalizedEmail)) return 'faculty';
  if (studentEmails.includes(normalizedEmail)) return 'student';

  if (['admin', 'faculty', 'student'].includes(normalizedRequestedRole)) {
    return normalizedRequestedRole;
  }

  return 'faculty';
}

function toError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeAssignments(assignments) {
  if (!assignments || typeof assignments !== 'object' || Array.isArray(assignments)) {
    throw toError('assignments must be an object with assignment1-assignment5');
  }

  const normalized = {};
  for (const key of ASSIGNMENT_KEYS) {
    const value = assignments[key] || {};
    const completed = Boolean(value.completed);
    const date = typeof value.date === 'string' ? value.date : '';
    normalized[key] = { completed, date };
  }

  return normalized;
}

function normalizeStudentMeta(payload) {
  return {
    className: String(payload.className || '').trim(),
    subject: String(payload.subject || '').trim(),
    semester: String(payload.semester || '').trim(),
  };
}

function validateStudentPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw toError('Invalid request body');
  }

  const rollNo = String(payload.rollNo || '').trim();
  const name = String(payload.name || '').trim();

  if (!rollNo) {
    throw toError('rollNo is required');
  }

  if (!name) {
    throw toError('name is required');
  }

  const assignments = normalizeAssignments(payload.assignments);
  const meta = normalizeStudentMeta(payload);

  return {
    rollNo,
    name,
    assignments,
    ...meta,
  };
}

function collectAssignmentStatusChanges(beforeAssignments, afterAssignments) {
  const changes = [];
  for (const key of ASSIGNMENT_KEYS) {
    const beforeCompleted = Boolean(beforeAssignments?.[key]?.completed);
    const afterCompleted = Boolean(afterAssignments?.[key]?.completed);
    if (beforeCompleted !== afterCompleted) {
      changes.push({
        assignment: key,
        before: beforeCompleted,
        after: afterCompleted,
      });
    }
  }
  return changes;
}

async function writeAuditLog(action, req, details) {
  await appendAuditLog({
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
    actor: {
      sub: req.user?.sub || '',
      role: req.user?.role || 'unknown',
      email: req.user?.email || '',
      name: req.user?.name || '',
    },
    action,
    details,
  });
}

function toCsvValue(value) {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function studentsToCsv(students) {
  const headers = [
    'rollNo',
    'name',
    'className',
    'subject',
    'semester',
    ...ASSIGNMENT_KEYS.map((key) => `${key}_completed`),
    ...ASSIGNMENT_KEYS.map((key) => `${key}_date`),
  ];

  const rows = students.map((student) => {
    const completedCells = ASSIGNMENT_KEYS.map((key) =>
      student.assignments?.[key]?.completed ? 'true' : 'false'
    );
    const dateCells = ASSIGNMENT_KEYS.map((key) => student.assignments?.[key]?.date || '');

    return [
      student.rollNo,
      student.name,
      student.className || '',
      student.subject || '',
      student.semester || '',
      ...completedCells,
      ...dateCells,
    ]
      .map(toCsvValue)
      .join(',');
  });

  return `${headers.join(',')}\n${rows.join('\n')}`;
}

app.get('/api/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    uptimeMs: Date.now() - monitoringState.startedAt,
    totalRequests: monitoringState.totalRequests,
    totalErrors: monitoringState.totalErrors,
  });
});

app.get('/api/auth/config', (_req, res) => {
  const { password, adminEmails, facultyEmails, studentEmails } = getAuthConfig();
  res.status(200).json({
    enabled: isAuthEnabled(),
    passwordEnabled: Boolean(password),
    ssoEnabled: Boolean(adminEmails.length || facultyEmails.length || studentEmails.length),
  });
});

app.post('/api/auth/login', (req, res, next) => {
  try {
    const { password } = getAuthConfig();
    if (!password) {
      throw toError('Authentication is not configured on server', 503);
    }

    const incomingPassword = String(req.body?.password || '');
    if (!incomingPassword) {
      throw toError('password is required');
    }

    if (incomingPassword !== password) {
      throw toError('Invalid credentials', 401);
    }

    const user = {
      sub: 'admin-password-user',
      role: 'admin',
      name: 'Admin',
      email: 'admin@local',
      rollNo: '',
    };

    const token = createAuthToken(user);
    res.status(200).json({ token, expiresInMs: TOKEN_TTL_MS, user });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/sso/mock', (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const name = String(req.body?.name || '').trim() || 'User';
    const requestedRole = String(req.body?.role || '').trim().toLowerCase();
    const rollNo = String(req.body?.rollNo || '').trim();

    if (!email) {
      throw toError('email is required');
    }

    const role = resolveRole(email, requestedRole);
    if (role === 'student' && !rollNo) {
      throw toError('rollNo is required for student role');
    }

    const user = {
      sub: email,
      role,
      name,
      email,
      rollNo: role === 'student' ? rollNo : '',
    };

    const token = createAuthToken(user);
    res.status(200).json({ token, expiresInMs: TOKEN_TTL_MS, user });
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/session', (req, res) => {
  const token = getTokenFromRequest(req);
  const user = verifyAuthToken(token);
  res.status(200).json({ authenticated: Boolean(user), user: user || null });
});

app.get('/api/students', requireAuth, async (_req, res, next) => {
  try {
    const students = await getStudents();

    if (_req.user?.role === 'student') {
      const ownRecords = students.filter((entry) => entry.rollNo === _req.user.rollNo);
      res.status(200).json(ownRecords);
      return;
    }

    res.status(200).json(students);
  } catch (error) {
    next(error);
  }
});

app.post('/api/students', requireAuth, requireRole(['admin', 'faculty']), async (req, res, next) => {
  try {
    const student = validateStudentPayload(req.body);
    const students = await getStudents();
    const alreadyExists = students.some((entry) => entry.rollNo === student.rollNo);
    if (alreadyExists) {
      throw toError('Student with this rollNo already exists', 409);
    }

    students.push(student);
    await saveStudents(students);
    await writeAuditLog('student_created', req, {
      rollNo: student.rollNo,
      name: student.name,
    });
    res.status(201).json(student);
  } catch (error) {
    next(error);
  }
});

app.put('/api/students/:rollNo', requireAuth, async (req, res, next) => {
  try {
    const rollNo = String(req.params.rollNo || '').trim();
    if (!rollNo) {
      throw toError('rollNo is required in path');
    }

    const updatedStudent = validateStudentPayload({ ...req.body, rollNo });
    const students = await getStudents();
    const index = students.findIndex((entry) => entry.rollNo === rollNo);
    if (index === -1) {
      throw toError('Student not found', 404);
    }

    const existingStudent = students[index];

    if (req.user.role === 'student') {
      if (req.user.rollNo !== rollNo) {
        throw toError('Forbidden', 403);
      }

      const sanitized = {
        ...updatedStudent,
        name: existingStudent.name,
        className: existingStudent.className || '',
        subject: existingStudent.subject || '',
        semester: existingStudent.semester || '',
      };

      const changes = collectAssignmentStatusChanges(
        existingStudent.assignments,
        sanitized.assignments
      );

      students[index] = sanitized;
      await saveStudents(students);

      if (changes.length) {
        await writeAuditLog('assignment_status_changed', req, {
          rollNo,
          changes,
        });
      }

      res.status(200).json(sanitized);
      return;
    }

    if (!['admin', 'faculty'].includes(req.user.role)) {
      throw toError('Forbidden', 403);
    }

    const changes = collectAssignmentStatusChanges(
      existingStudent.assignments,
      updatedStudent.assignments
    );

    students[index] = updatedStudent;
    await saveStudents(students);

    if (changes.length) {
      await writeAuditLog('assignment_status_changed', req, {
        rollNo,
        changes,
      });
    }

    res.status(200).json(updatedStudent);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/students/:rollNo', requireAuth, requireRole(['admin']), async (req, res, next) => {
  try {
    const rollNo = String(req.params.rollNo || '').trim();
    if (!rollNo) {
      throw toError('rollNo is required in path');
    }

    const students = await getStudents();
    const nextStudents = students.filter((entry) => entry.rollNo !== rollNo);
    if (nextStudents.length === students.length) {
      throw toError('Student not found', 404);
    }

    await saveStudents(nextStudents);
    await writeAuditLog('student_deleted', req, { rollNo });
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/audit-logs', requireAuth, requireRole(['admin', 'faculty']), async (_req, res, next) => {
  try {
    const logs = await getAuditLogs();
    res.status(200).json(logs);
  } catch (error) {
    next(error);
  }
});

app.get('/api/reports/summary', requireAuth, requireRole(['admin', 'faculty']), async (_req, res, next) => {
  try {
    const students = await getStudents();

    const assignmentCompletion = ASSIGNMENT_KEYS.reduce((accumulator, key) => {
      const completedCount = students.filter((student) =>
        Boolean(student.assignments?.[key]?.completed)
      ).length;

      accumulator[key] = {
        completed: completedCount,
        pending: Math.max(0, students.length - completedCount),
      };
      return accumulator;
    }, {});

    const bySemester = {};
    const byClassName = {};
    const bySubject = {};

    for (const student of students) {
      const semester = student.semester || 'Unassigned';
      const className = student.className || 'Unassigned';
      const subject = student.subject || 'Unassigned';

      bySemester[semester] = (bySemester[semester] || 0) + 1;
      byClassName[className] = (byClassName[className] || 0) + 1;
      bySubject[subject] = (bySubject[subject] || 0) + 1;
    }

    res.status(200).json({
      totalStudents: students.length,
      assignmentCompletion,
      bySemester,
      byClassName,
      bySubject,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/reports/export.csv', requireAuth, requireRole(['admin', 'faculty']), async (_req, res, next) => {
  try {
    const students = await getStudents();
    const csv = studentsToCsv(students);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="students-report.csv"');
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
});

app.get('/api/backup', requireAuth, requireRole(['admin']), async (_req, res, next) => {
  try {
    const [students, auditLogs] = await Promise.all([getStudents(), getAuditLogs()]);
    res.status(200).json({
      exportedAt: new Date().toISOString(),
      students,
      auditLogs,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/metrics', requireAuth, requireRole(['admin']), (_req, res) => {
  res.status(200).json({
    uptimeMs: Date.now() - monitoringState.startedAt,
    totalRequests: monitoringState.totalRequests,
    totalErrors: monitoringState.totalErrors,
    rateLimit: {
      windowMs: RATE_LIMIT_WINDOW_MS,
      max: RATE_LIMIT_MAX,
    },
  });
});

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  const message = status >= 500 ? 'Internal server error' : error.message;
  if (status >= 500) {
    monitoringState.totalErrors += 1;
  }
  if (status >= 500) {
    console.error(error);
  }
  res.status(status).json({ error: message });
});

module.exports = app;
