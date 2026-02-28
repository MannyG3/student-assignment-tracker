const express = require('express');
const cors = require('cors');
const { getStudents, saveStudents } = require('./storage');

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

  return {
    rollNo,
    name,
    assignments,
  };
}

app.get('/api/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get('/api/students', async (_req, res, next) => {
  try {
    const students = await getStudents();
    res.status(200).json(students);
  } catch (error) {
    next(error);
  }
});

app.post('/api/students', async (req, res, next) => {
  try {
    const student = validateStudentPayload(req.body);
    const students = await getStudents();
    const alreadyExists = students.some((entry) => entry.rollNo === student.rollNo);
    if (alreadyExists) {
      throw toError('Student with this rollNo already exists', 409);
    }

    students.push(student);
    await saveStudents(students);
    res.status(201).json(student);
  } catch (error) {
    next(error);
  }
});

app.put('/api/students/:rollNo', async (req, res, next) => {
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

    students[index] = updatedStudent;
    await saveStudents(students);
    res.status(200).json(updatedStudent);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/students/:rollNo', async (req, res, next) => {
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
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  const message = status >= 500 ? 'Internal server error' : error.message;
  if (status >= 500) {
    console.error(error);
  }
  res.status(status).json({ error: message });
});

module.exports = app;
