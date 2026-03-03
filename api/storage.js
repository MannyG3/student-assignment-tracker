const fs = require('node:fs/promises');
const path = require('node:path');
const { Redis } = require('@upstash/redis');

const STUDENTS_KEY = 'students';
const AUDIT_LOGS_KEY = 'auditLogs';
const LOCAL_DATA_FILE = path.join(process.cwd(), 'students.json');
const LOCAL_AUDIT_FILE = path.join(process.cwd(), 'auditLogs.json');

let memoryStudents = [];
let memoryAuditLogs = [];

function hasUpstashConfig() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

function getRedisClient() {
  if (!hasUpstashConfig()) {
    return null;
  }

  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

async function readLocalFile() {
  try {
    const content = await fs.readFile(LOCAL_DATA_FILE, 'utf8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeLocalFile(students) {
  await fs.writeFile(LOCAL_DATA_FILE, JSON.stringify(students, null, 2));
}

async function readLocalAuditFile() {
  try {
    const content = await fs.readFile(LOCAL_AUDIT_FILE, 'utf8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeLocalAuditFile(logs) {
  await fs.writeFile(LOCAL_AUDIT_FILE, JSON.stringify(logs, null, 2));
}

async function getStudents() {
  const redis = getRedisClient();
  if (redis) {
    const data = await redis.get(STUDENTS_KEY);
    return Array.isArray(data) ? data : [];
  }

  if (process.env.NODE_ENV !== 'production') {
    return readLocalFile();
  }

  return memoryStudents;
}

async function saveStudents(students) {
  const redis = getRedisClient();
  if (redis) {
    await redis.set(STUDENTS_KEY, students);
    return;
  }

  if (process.env.NODE_ENV !== 'production') {
    await writeLocalFile(students);
    return;
  }

  memoryStudents = students;
}

async function getAuditLogs() {
  const redis = getRedisClient();
  if (redis) {
    const data = await redis.get(AUDIT_LOGS_KEY);
    return Array.isArray(data) ? data : [];
  }

  if (process.env.NODE_ENV !== 'production') {
    return readLocalAuditFile();
  }

  return memoryAuditLogs;
}

async function saveAuditLogs(logs) {
  const redis = getRedisClient();
  if (redis) {
    await redis.set(AUDIT_LOGS_KEY, logs);
    return;
  }

  if (process.env.NODE_ENV !== 'production') {
    await writeLocalAuditFile(logs);
    return;
  }

  memoryAuditLogs = logs;
}

async function appendAuditLog(entry) {
  const logs = await getAuditLogs();
  logs.unshift(entry);
  await saveAuditLogs(logs.slice(0, 1000));
}

module.exports = {
  getStudents,
  saveStudents,
  getAuditLogs,
  saveAuditLogs,
  appendAuditLog,
};