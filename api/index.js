// api/index.js
const serverless = require('serverless-http');
const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const DATA_FILE = path.join(__dirname, '..', 'students.json'); // students.json in the root folder

// Enable CORS and JSON body parsing
app.use(cors());
app.use(bodyParser.json());

// Optionally, you can serve static files from /public if needed—but Vercel can serve them via vercel.json
// app.use(express.static(path.join(__dirname, '..', 'public')));

// API endpoint: GET all students
app.get('/api/students', (req, res) => {
  let students = [];
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      students = data ? JSON.parse(data) : [];
    }
  } catch (err) {
    console.error(err);
  }
  res.json(students);
});

// API endpoint: POST add a new student
app.post('/api/students', (req, res) => {
  const newStudent = req.body;
  let students = [];
  try {
    if (fs.existsSync(DATA_FILE)) {
      students = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
    students.push(newStudent);
    fs.writeFileSync(DATA_FILE, JSON.stringify(students, null, 2));
    res.status(201).json(newStudent);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error saving student data' });
  }
});

// API endpoint: PUT update a student by rollNo
app.put('/api/students/:rollNo', (req, res) => {
  const rollNo = req.params.rollNo;
  const updatedStudent = req.body;
  let students = [];
  try {
    if (fs.existsSync(DATA_FILE)) {
      students = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
    const index = students.findIndex(s => s.rollNo == rollNo);
    if (index !== -1) {
      students[index] = updatedStudent;
      fs.writeFileSync(DATA_FILE, JSON.stringify(students, null, 2));
      res.json(updatedStudent);
    } else {
      res.status(404).json({ error: 'Student not found' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error updating student data' });
  }
});

// Export the app wrapped in serverless-http
module.exports = serverless(app);
