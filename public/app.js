const API_BASE = '/api/students';
const ASSIGNMENT_KEYS = ['assignment1', 'assignment2', 'assignment3', 'assignment4', 'assignment5'];

const form = document.getElementById('studentForm');
const studentsTableBody = document.getElementById('studentsTableBody');
const toast = document.getElementById('toast');

let students = [];
let editingRollNo = null;

function buildEmptyAssignments() {
  return ASSIGNMENT_KEYS.reduce((accumulator, key) => {
    accumulator[key] = { completed: false, date: '' };
    return accumulator;
  }, {});
}

function getAssignmentsFromForm() {
  const assignments = buildEmptyAssignments();
  ASSIGNMENT_KEYS.forEach((key) => {
    const checkbox = form.querySelector(`[data-assignment="${key}"]`);
    if (checkbox?.checked) {
      assignments[key] = {
        completed: true,
        date: new Date().toLocaleDateString(),
      };
    }
  });
  return assignments;
}

function showToast(message, type = 'success') {
  toast.textContent = message;
  toast.className = `toast visible ${type}`;
  setTimeout(() => {
    toast.className = 'toast';
  }, 2500);
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    const message = payload?.error || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function validateStudentInput(rollNo, name) {
  if (!rollNo.trim()) {
    throw new Error('Roll number is required.');
  }
  if (!name.trim()) {
    throw new Error('Student name is required.');
  }
}

function getStatusCell(assignments, key) {
  const item = assignments?.[key] || { completed: false, date: '' };
  if (!item.completed) {
    return '<span class="chip pending">Pending</span>';
  }
  const dateLabel = item.date ? `<span class="date">${item.date}</span>` : '';
  return `<span class="chip done">Done</span>${dateLabel}`;
}

function renderTable() {
  if (!students.length) {
    studentsTableBody.innerHTML = '<tr><td colspan="8" class="empty">No students yet.</td></tr>';
    return;
  }

  studentsTableBody.innerHTML = students
    .map((student) => {
      const actionButton =
        editingRollNo === student.rollNo
          ? '<button class="secondary" data-action="save">Save</button>'
          : '<button class="secondary" data-action="edit">Edit</button>';

      return `
      <tr data-roll="${student.rollNo}">
        <td>${student.rollNo}</td>
        <td><input class="table-input" data-field="name" value="${student.name}" ${
          editingRollNo === student.rollNo ? '' : 'disabled'
        } /></td>
        ${ASSIGNMENT_KEYS.map(
          (key) => `
          <td>
            <label class="toggle-wrap">
              <input type="checkbox" data-field="${key}" ${
                student.assignments?.[key]?.completed ? 'checked' : ''
              } ${editingRollNo === student.rollNo ? '' : 'disabled'} />
            </label>
            ${getStatusCell(student.assignments, key)}
          </td>
        `
        ).join('')}
        <td class="actions">
          ${actionButton}
          <button class="danger" data-action="delete">Delete</button>
        </td>
      </tr>`;
    })
    .join('');
}

async function loadStudents() {
  students = await request(API_BASE);
  renderTable();
}

function resetForm() {
  form.reset();
  editingRollNo = null;
}

async function createStudent(event) {
  event.preventDefault();

  const rollNo = form.rollNo.value;
  const name = form.name.value;

  try {
    validateStudentInput(rollNo, name);
    const payload = {
      rollNo: rollNo.trim(),
      name: name.trim(),
      assignments: getAssignmentsFromForm(),
    };

    await request(API_BASE, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    await loadStudents();
    resetForm();
    showToast('Student added successfully.');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function getRowData(rowElement) {
  const rollNo = rowElement.dataset.roll;
  const name = rowElement.querySelector('[data-field="name"]').value;
  const assignments = buildEmptyAssignments();

  ASSIGNMENT_KEYS.forEach((key) => {
    const checkbox = rowElement.querySelector(`[data-field="${key}"]`);
    const completed = checkbox.checked;
    assignments[key] = {
      completed,
      date: completed ? new Date().toLocaleDateString() : '',
    };
  });

  return {
    rollNo,
    name: name.trim(),
    assignments,
  };
}

async function handleTableAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }

  const row = button.closest('tr[data-roll]');
  const rollNo = row?.dataset.roll;
  if (!rollNo) {
    return;
  }

  const action = button.dataset.action;

  try {
    if (action === 'edit') {
      editingRollNo = rollNo;
      renderTable();
      return;
    }

    if (action === 'save') {
      const payload = getRowData(row);
      validateStudentInput(payload.rollNo, payload.name);
      await request(`${API_BASE}/${encodeURIComponent(rollNo)}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      editingRollNo = null;
      await loadStudents();
      showToast('Student updated successfully.');
      return;
    }

    if (action === 'delete') {
      await request(`${API_BASE}/${encodeURIComponent(rollNo)}`, {
        method: 'DELETE',
      });
      editingRollNo = null;
      await loadStudents();
      showToast('Student removed successfully.');
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

form.addEventListener('submit', createStudent);
studentsTableBody.addEventListener('click', handleTableAction);

loadStudents().catch((error) => {
  showToast(error.message, 'error');
});