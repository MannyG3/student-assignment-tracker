// server.js
const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = 'students.json';

// Serve static files from the "public" directory
app.use(express.static('public'));

// Fallback route for the root URL to serve index.html
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Enable CORS and JSON body parsing
app.use(cors());
app.use(bodyParser.json());

// Helper function to load student data from file
function loadStudents() {
  if (!fs.existsSync(DATA_FILE)) {
    return [];
  }
  const data = fs.readFileSync(DATA_FILE, 'utf8');
  return data ? JSON.parse(data) : [];
}

// Helper function to save student data to file
function saveStudents(students) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(students, null, 2));
}

// GET all students
app.get('/api/students', (req, res) => {
  const students = loadStudents();
  res.json(students);
});

// POST add a new student
app.post('/api/students', (req, res) => {
  const newStudent = req.body;
  const students = loadStudents();
  students.push(newStudent);
  saveStudents(students);
  res.status(201).json(newStudent);
});

// PUT update a student by rollNo
app.put('/api/students/:rollNo', (req, res) => {
  const rollNo = req.params.rollNo;
  const updatedStudent = req.body;
  let students = loadStudents();
  const index = students.findIndex(s => s.rollNo == rollNo);
  if (index !== -1) {
    students[index] = updatedStudent;
    saveStudents(students);
    res.json(updatedStudent);
  } else {
    res.status(404).json({ error: 'Student not found' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
