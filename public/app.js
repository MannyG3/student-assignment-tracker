const API_BASE = '/api/students';
const ASSIGNMENT_KEYS = ['assignment1', 'assignment2', 'assignment3', 'assignment4', 'assignment5'];
const AUTH_TOKEN_KEY = 'student_tracker_auth_token';
const AUTH_CONFIG_URL = '/api/auth/config';
const AUTH_LOGIN_URL = '/api/auth/login';
const AUTH_SSO_URL = '/api/auth/sso/mock';
const AUTH_SESSION_URL = '/api/auth/session';
const SUMMARY_URL = '/api/reports/summary';
const EXPORT_CSV_URL = '/api/reports/export.csv';
const BACKUP_URL = '/api/backup';

const form = document.getElementById('studentForm');
const studentsTableBody = document.getElementById('studentsTableBody');
const toast = document.getElementById('toast');
const loginForm = document.getElementById('loginForm');
const logoutButton = document.getElementById('logoutButton');
const authStatus = document.getElementById('authStatus');
const appContent = document.getElementById('appContent');
const authPanel = document.getElementById('authPanel');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const viewSummaryBtn = document.getElementById('viewSummaryBtn');
const downloadBackupBtn = document.getElementById('downloadBackupBtn');
const summaryPanel = document.getElementById('summaryPanel');

let students = [];
let editingRollNo = null;
let authEnabled = false;
let authConfig = {
  passwordEnabled: false,
  ssoEnabled: false,
};
let currentUser = null;

function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || '';
}

function setAuthToken(token) {
  if (!token) {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    return;
  }
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

function showToast(message, type = 'success') {
  toast.textContent = message;
  toast.className = `toast visible ${type}`;
  setTimeout(() => {
    toast.className = 'toast';
  }, 2500);
}

function getRole() {
  return currentUser?.role || 'guest';
}

function isAdmin() {
  return getRole() === 'admin';
}

function isFaculty() {
  return getRole() === 'faculty';
}

function isStudent() {
  return getRole() === 'student';
}

function canManageStudentRecords() {
  return isAdmin() || isFaculty();
}

function canDeleteStudents() {
  return isAdmin();
}

function canViewReports() {
  return isAdmin() || isFaculty();
}

function canDownloadBackup() {
  return isAdmin();
}

function setAuthenticatedUiState(authenticated) {
  if (!authEnabled) {
    authStatus.textContent = 'Auth disabled (demo mode)';
    authPanel.classList.add('hidden');
    appContent.classList.remove('hidden');
    return;
  }

  if (authenticated) {
    authStatus.textContent = `Logged in as ${currentUser?.name || 'User'} (${currentUser?.role || 'unknown'})`;
    appContent.classList.remove('hidden');
    logoutButton.classList.remove('hidden');
    return;
  }

  authStatus.textContent = 'Please sign in';
  appContent.classList.add('hidden');
  logoutButton.classList.add('hidden');
}

function updatePermissionUi() {
  const studentFormButton = form.querySelector('button[type="submit"]');
  const canAdd = canManageStudentRecords();
  Array.from(form.elements).forEach((element) => {
    if (element.tagName === 'BUTTON') {
      return;
    }
    if (element.name !== '') {
      element.disabled = !canAdd;
    }
  });
  studentFormButton.disabled = !canAdd;

  viewSummaryBtn.classList.toggle('hidden', !canViewReports());
  exportCsvBtn.classList.toggle('hidden', !canViewReports());
  downloadBackupBtn.classList.toggle('hidden', !canDownloadBackup());
  if (!canViewReports()) {
    summaryPanel.classList.add('hidden');
  }
}

async function request(url, options = {}) {
  const token = getAuthToken();

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    if (response.status === 401) {
      setAuthToken('');
      currentUser = null;
      setAuthenticatedUiState(false);
    }
    const message = isJson ? payload?.error : payload;
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return payload;
}

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

function canEditRow(student) {
  if (isAdmin() || isFaculty()) {
    return true;
  }
  return isStudent() && currentUser?.rollNo === student.rollNo;
}

function renderTable() {
  if (!students.length) {
    studentsTableBody.innerHTML = '<tr><td colspan="11" class="empty">No students yet.</td></tr>';
    return;
  }

  studentsTableBody.innerHTML = students
    .map((student) => {
      const rowEditable = editingRollNo === student.rollNo;
      const canEdit = canEditRow(student);
      const disableNameEdit = !rowEditable || isStudent();

      let actionHtml = '';
      if (canEdit) {
        actionHtml += rowEditable
          ? '<button class="secondary" data-action="save">Save</button>'
          : '<button class="secondary" data-action="edit">Edit</button>';
      }
      if (canDeleteStudents()) {
        actionHtml += '<button class="danger" data-action="delete">Delete</button>';
      }

      return `
      <tr data-roll="${student.rollNo}">
        <td>${student.rollNo}</td>
        <td><input class="table-input" data-field="name" value="${student.name}" ${disableNameEdit ? 'disabled' : ''} /></td>
        <td><input class="table-input" data-field="className" value="${student.className || ''}" ${disableNameEdit ? 'disabled' : ''} /></td>
        <td><input class="table-input" data-field="subject" value="${student.subject || ''}" ${disableNameEdit ? 'disabled' : ''} /></td>
        <td><input class="table-input" data-field="semester" value="${student.semester || ''}" ${disableNameEdit ? 'disabled' : ''} /></td>
        ${ASSIGNMENT_KEYS.map(
          (key) => `
          <td>
            <label class="toggle-wrap">
              <input type="checkbox" data-field="${key}" ${
                student.assignments?.[key]?.completed ? 'checked' : ''
              } ${rowEditable && canEdit ? '' : 'disabled'} />
            </label>
            ${getStatusCell(student.assignments, key)}
          </td>
        `
        ).join('')}
        <td class="actions">${actionHtml || '<span class="muted">No actions</span>'}</td>
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

  const rollNo = form.elements.rollNo.value;
  const name = form.elements.name.value;
  const className = form.elements.className.value;
  const subject = form.elements.subject.value;
  const semester = form.elements.semester.value;

  try {
    validateStudentInput(rollNo, name);
    const payload = {
      rollNo: rollNo.trim(),
      name: name.trim(),
      className: className.trim(),
      subject: subject.trim(),
      semester: semester.trim(),
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

async function loadAuthConfig() {
  const config = await request(AUTH_CONFIG_URL, {
    headers: {},
  });

  authEnabled = Boolean(config?.enabled);
  authConfig = {
    passwordEnabled: Boolean(config?.passwordEnabled),
    ssoEnabled: Boolean(config?.ssoEnabled),
  };

  const passwordButton = loginForm.querySelector('[data-mode="password"]');
  const ssoButton = loginForm.querySelector('[data-mode="sso"]');
  passwordButton.classList.toggle('hidden', !authConfig.passwordEnabled);
  ssoButton.classList.toggle('hidden', !authConfig.ssoEnabled);

  setAuthenticatedUiState(!authEnabled);
}

async function validateSession() {
  if (!authEnabled) {
    currentUser = {
      role: 'admin',
      name: 'Demo Admin',
      rollNo: '',
    };
    updatePermissionUi();
    return true;
  }

  const token = getAuthToken();
  if (!token) {
    setAuthenticatedUiState(false);
    updatePermissionUi();
    return false;
  }

  try {
    const session = await request(AUTH_SESSION_URL);
    const authenticated = Boolean(session?.authenticated);
    currentUser = authenticated ? session.user : null;
    setAuthenticatedUiState(authenticated);
    updatePermissionUi();
    if (!authenticated) {
      setAuthToken('');
    }
    return authenticated;
  } catch {
    setAuthToken('');
    currentUser = null;
    setAuthenticatedUiState(false);
    updatePermissionUi();
    return false;
  }
}

async function handleLogin(event) {
  event.preventDefault();

  const mode = event.submitter?.dataset?.mode || 'password';

  try {
    let payload;

    if (mode === 'password') {
      const password = String(loginForm.elements.password?.value || '').trim();
      if (!password) {
        throw new Error('Password is required for password login.');
      }

      payload = await request(AUTH_LOGIN_URL, {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
    } else {
      const email = String(loginForm.elements.email?.value || '').trim();
      const name = String(loginForm.elements.displayName?.value || '').trim() || 'User';
      const role = String(loginForm.elements.role?.value || 'faculty').trim();
      const rollNo = String(loginForm.elements.studentRollNo?.value || '').trim();

      if (!email) {
        throw new Error('Email is required for SSO login.');
      }

      payload = await request(AUTH_SSO_URL, {
        method: 'POST',
        body: JSON.stringify({ email, name, role, rollNo }),
      });
    }

    setAuthToken(payload?.token || '');
    currentUser = payload?.user || null;
    loginForm.elements.password.value = '';
    setAuthenticatedUiState(true);
    updatePermissionUi();
    await loadStudents();
    showToast('Logged in successfully.');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function handleLogout() {
  setAuthToken('');
  currentUser = null;
  setAuthenticatedUiState(false);
  updatePermissionUi();
  students = [];
  renderTable();
  showToast('Logged out successfully.');
}

function getRowData(rowElement) {
  const rollNo = rowElement.dataset.roll;
  const name = rowElement.querySelector('[data-field="name"]').value;
  const className = rowElement.querySelector('[data-field="className"]').value;
  const subject = rowElement.querySelector('[data-field="subject"]').value;
  const semester = rowElement.querySelector('[data-field="semester"]').value;
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
    className: className.trim(),
    subject: subject.trim(),
    semester: semester.trim(),
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

function renderSummary(summary) {
  const assignmentLines = ASSIGNMENT_KEYS.map((key) => {
    const value = summary.assignmentCompletion?.[key] || { completed: 0, pending: 0 };
    return `<li>${key.toUpperCase()}: Completed ${value.completed}, Pending ${value.pending}</li>`;
  }).join('');

  summaryPanel.innerHTML = `
    <h3>Summary</h3>
    <p>Total students: <strong>${summary.totalStudents || 0}</strong></p>
    <ul>${assignmentLines}</ul>
  `;
  summaryPanel.classList.remove('hidden');
}

async function handleViewSummary() {
  try {
    const summary = await request(SUMMARY_URL);
    renderSummary(summary);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function downloadBlob(url, fileName) {
  try {
    const token = getAuthToken();
    const response = await fetch(url, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      let message = `Request failed with status ${response.status}`;
      try {
        const payload = await response.json();
        message = payload.error || message;
      } catch {
        // no-op
      }
      throw new Error(message);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

form.addEventListener('submit', createStudent);
studentsTableBody.addEventListener('click', handleTableAction);
loginForm.addEventListener('submit', handleLogin);
logoutButton.addEventListener('click', handleLogout);
viewSummaryBtn.addEventListener('click', handleViewSummary);
exportCsvBtn.addEventListener('click', () => downloadBlob(EXPORT_CSV_URL, 'students-report.csv'));
downloadBackupBtn.addEventListener('click', () =>
  downloadBlob(BACKUP_URL, `students-backup-${new Date().toISOString().slice(0, 10)}.json`)
);

async function bootstrap() {
  try {
    await loadAuthConfig();
    const authenticated = await validateSession();
    if (authenticated || !authEnabled) {
      await loadStudents();
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

bootstrap();
