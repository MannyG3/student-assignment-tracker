const fs = require('node:fs/promises');
const path = require('node:path');
const { Redis } = require('@upstash/redis');

const STUDENTS_KEY = 'students';
const LOCAL_DATA_FILE = path.join(process.cwd(), 'students.json');

let memoryStudents = [];

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

module.exports = {
  getStudents,
  saveStudents,
};