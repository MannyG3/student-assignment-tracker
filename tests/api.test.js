const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.NODE_ENV = 'production';
process.env.ADMIN_PASSWORD = 'test-admin-password';
process.env.AUTH_SECRET = 'test-auth-secret';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const app = require('../api/index');

function buildAssignments(overrides = {}) {
  const base = {
    assignment1: { completed: false, date: '' },
    assignment2: { completed: false, date: '' },
    assignment3: { completed: false, date: '' },
    assignment4: { completed: false, date: '' },
    assignment5: { completed: false, date: '' },
  };
  return { ...base, ...overrides };
}

async function loginWithPassword() {
  const response = await request(app).post('/api/auth/login').send({
    password: process.env.ADMIN_PASSWORD,
  });
  assert.equal(response.status, 200);
  return response.body.token;
}

async function loginWithMockSso(role, rollNo = '') {
  const response = await request(app).post('/api/auth/sso/mock').send({
    email: `${role}-${Date.now()}@college.edu`,
    name: `${role} user`,
    role,
    rollNo,
  });
  assert.equal(response.status, 200);
  return response.body.token;
}

test('health endpoint responds', async () => {
  const response = await request(app).get('/api/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
});

test('students endpoint is protected without token', async () => {
  const response = await request(app).get('/api/students');
  assert.equal(response.status, 401);
});

test('admin password login returns token and allows students access', async () => {
  const token = await loginWithPassword();
  const response = await request(app)
    .get('/api/students')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body));
});

test('faculty can create and update student; audit/report endpoints respond', async () => {
  const token = await loginWithMockSso('faculty');
  const rollNo = `T-${Date.now()}`;

  const createResponse = await request(app)
    .post('/api/students')
    .set('Authorization', `Bearer ${token}`)
    .send({
      rollNo,
      name: 'Faculty Added Student',
      className: 'FY BSc CS A',
      subject: 'Data Structures',
      semester: 'Sem 2',
      assignments: buildAssignments(),
    });

  assert.equal(createResponse.status, 201);

  const updateResponse = await request(app)
    .put(`/api/students/${encodeURIComponent(rollNo)}`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      rollNo,
      name: 'Faculty Added Student',
      className: 'FY BSc CS A',
      subject: 'Data Structures',
      semester: 'Sem 2',
      assignments: buildAssignments({
        assignment1: {
          completed: true,
          date: '03/03/2026',
        },
      }),
    });

  assert.equal(updateResponse.status, 200);
  assert.equal(updateResponse.body.assignments.assignment1.completed, true);

  const auditResponse = await request(app)
    .get('/api/audit-logs')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(auditResponse.status, 200);
  assert.ok(Array.isArray(auditResponse.body));

  const summaryResponse = await request(app)
    .get('/api/reports/summary')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(summaryResponse.status, 200);
  assert.ok(typeof summaryResponse.body.totalStudents === 'number');

  const exportResponse = await request(app)
    .get('/api/reports/export.csv')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(exportResponse.status, 200);
  assert.match(String(exportResponse.headers['content-type']), /text\/csv/);
});

test('student role cannot create records and only views own roll number', async () => {
  const studentRollNo = `S-${Date.now()}`;
  const token = await loginWithMockSso('student', studentRollNo);

  const createResponse = await request(app)
    .post('/api/students')
    .set('Authorization', `Bearer ${token}`)
    .send({
      rollNo: `X-${Date.now()}`,
      name: 'Blocked Student Create',
      className: '',
      subject: '',
      semester: '',
      assignments: buildAssignments(),
    });

  assert.equal(createResponse.status, 403);

  const listResponse = await request(app)
    .get('/api/students')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(listResponse.status, 200);
  assert.ok(Array.isArray(listResponse.body));
  assert.ok(listResponse.body.every((entry) => entry.rollNo === studentRollNo));
});

test('admin can access backup and metrics', async () => {
  const token = await loginWithMockSso('admin');

  const backupResponse = await request(app)
    .get('/api/backup')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(backupResponse.status, 200);
  assert.ok(Array.isArray(backupResponse.body.students));
  assert.ok(Array.isArray(backupResponse.body.auditLogs));

  const metricsResponse = await request(app)
    .get('/api/metrics')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(metricsResponse.status, 200);
  assert.ok(typeof metricsResponse.body.totalRequests === 'number');
});
