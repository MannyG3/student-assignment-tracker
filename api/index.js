// api/index.js
const serverless = require('serverless-http');
const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const DATA_FILE = path.join(__dirname, '..', 'students.json'); // Ensure this file is in your repository root

// Enable CORS and JSON body parsing
app.use(cors());
app.use(bodyParser.json());

// API endpoint: GET all students (asynchronous version)
app.get('/api/students', (req, res) => {
  fs.readFile(DATA_FILE, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading file:', err);
      return res.status(500).json({ error: 'Error reading student data' });
    }
    let students = [];
    try {
      students = data ? JSON.parse(data) : [];
    } catch (parseErr) {
      console.error('Error parsing JSON:', parseErr);
      return res.status(500).json({ error: 'Error parsing student data' });
    }
    res.json(students);
  });
});

// API endpoint: POST add a new student (synchronous for now, but consider converting to async)
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

// API endpoint: PUT update a student by rollNo (synchronous for now)
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
