// Admin panel logic — loaded by admin.html

(async () => {
  const data = await requireAuth();
  if (data.user.role !== 'instructor') {
    window.location.href = '/dashboard';
    return;
  }
  document.getElementById('navUser').textContent = data.user.username;
  await loadStats();
  await loadQuestions();
})();

// ── Tab navigation ──────────────────────────────────────────────
function openTab(name) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + name).classList.remove('hidden');
  event.currentTarget.classList.add('active');

  if (name === 'sessions') loadSessions();
  if (name === 'users')    loadUsers();
  if (name === 'questions') loadQuestions();
}

// ── Stats ───────────────────────────────────────────────────────
async function loadStats() {
  const res = await fetch('/api/admin/stats');
  if (!res.ok) return;
  const d = await res.json();
  document.getElementById('statStudents').textContent  = d.totalStudents;
  document.getElementById('statQuestions').textContent = d.totalQuestions;
  document.getElementById('statSessions').textContent  = d.totalSessions;
  document.getElementById('statAnswers').textContent   = d.totalAnswers;
}

// ── Questions ───────────────────────────────────────────────────
async function loadQuestions() {
  const res = await fetch('/api/admin/questions');
  if (!res.ok) return;
  const { questions } = await res.json();

  const wrap = document.getElementById('questionsList');
  if (!questions.length) { wrap.innerHTML = '<p class="hint-text">No questions found.</p>'; return; }

  wrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>ID</th><th>Question</th><th>Difficulty</th>
          <th>Category</th><th>Points</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>${questions.map(q => `
        <tr>
          <td>${q.id}</td>
          <td style="max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
              title="${escHtml(q.question_text)}">${escHtml(q.question_text)}</td>
          <td><span class="badge badge-${q.difficulty}">${q.difficulty}</span></td>
          <td>${escHtml(q.category)}</td>
          <td>${q.points}</td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick="deleteQuestion(${q.id})">Delete</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function showAddQuestion() {
  document.getElementById('addQuestionForm').classList.toggle('hidden');
}

async function addQuestion() {
  const fields = { question_text: 'qText', code_snippet: 'qCode', option_a: 'qA', option_b: 'qB',
                   option_c: 'qC', option_d: 'qD', correct_answer: 'qCorrect', difficulty: 'qDiff',
                   category: 'qCat', points: 'qPoints', explanation: 'qExplain' };
  const body = {};
  for (const [key, id] of Object.entries(fields)) {
    body[key] = document.getElementById(id).value.trim();
  }

  if (!body.question_text || !body.option_a || !body.option_b || !body.option_c ||
      !body.option_d || !body.explanation || !body.category) {
    showAlert('Please fill in all required fields.', 'error');
    return;
  }

  const res = await fetch('/api/questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) { showAlert(data.error || 'Failed to add question', 'error'); return; }

  showAlert('Question added successfully!', 'success');
  document.getElementById('addQuestionForm').classList.add('hidden');
  loadStats();
  loadQuestions();
}

async function deleteQuestion(id) {
  if (!confirm('Delete this question? This cannot be undone.')) return;
  const res = await fetch(`/api/questions/${id}`, { method: 'DELETE' });
  if (!res.ok) { showAlert('Failed to delete question', 'error'); return; }
  showAlert('Question deleted.', 'success');
  loadStats();
  loadQuestions();
}

// ── Sessions ────────────────────────────────────────────────────
async function loadSessions() {
  const res = await fetch('/api/admin/sessions');
  if (!res.ok) return;
  const { sessions } = await res.json();

  const wrap = document.getElementById('sessionsList');
  if (!sessions.length) { wrap.innerHTML = '<p class="hint-text">No sessions found.</p>'; return; }

  wrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr><th>Code</th><th>Host</th><th>Difficulty</th><th>Status</th><th>Players</th><th>Rounds</th><th>Created</th><th>Actions</th></tr>
      </thead>
      <tbody>${sessions.map(s => `
        <tr>
          <td><strong>${s.session_code}</strong></td>
          <td>${escHtml(s.host_name)}</td>
          <td>${s.difficulty}</td>
          <td><span class="badge badge-${s.status}">${s.status}</span></td>
          <td>${s.player_count}/${s.max_players}</td>
          <td>${s.current_round}/${s.total_rounds}</td>
          <td>${new Date(s.created_at).toLocaleDateString()}</td>
          <td><button class="btn btn-danger btn-sm" onclick="deleteSession(${s.id})">Delete</button></td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

async function deleteSession(id) {
  if (!confirm('Delete this session?')) return;
  const res = await fetch(`/api/admin/sessions/${id}`, { method: 'DELETE' });
  if (!res.ok) { showAlert('Failed to delete session', 'error'); return; }
  showAlert('Session deleted.', 'success');
  loadStats();
  loadSessions();
}

// ── Users ───────────────────────────────────────────────────────
async function loadUsers() {
  const res = await fetch('/api/admin/users');
  if (!res.ok) return;
  const { users } = await res.json();

  const wrap = document.getElementById('usersList');
  if (!users.length) { wrap.innerHTML = '<p class="hint-text">No users found.</p>'; return; }

  wrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr><th>ID</th><th>Username</th><th>Email</th><th>Role</th><th>Joined</th><th>Actions</th></tr>
      </thead>
      <tbody>${users.map(u => `
        <tr>
          <td>${u.id}</td>
          <td>${escHtml(u.username)}</td>
          <td>${escHtml(u.email)}</td>
          <td><span class="badge badge-${u.role === 'instructor' ? 'hard' : 'easy'}">${u.role}</span></td>
          <td>${new Date(u.created_at).toLocaleDateString()}</td>
          <td>${u.role !== 'instructor'
            ? `<button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id}, '${escHtml(u.username)}')">Delete</button>`
            : '<span class="hint-text">—</span>'
          }</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

async function deleteUser(id, username) {
  if (!confirm(`Delete user "${username}" (ID: ${id})? This cannot be undone.`)) return;
  const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) { showAlert(data.error || 'Failed to delete user.', 'error'); return; }
  showAlert(`User "${username}" deleted.`, 'success');
  loadStats();
  loadUsers();
}

// ── QR Code generation ──────────────────────────────────────────
async function generateQR() {
  const id = document.getElementById('qrId').value.trim();
  if (!id || isNaN(id) || parseInt(id) < 1) {
    showAlert('Please enter a valid question ID (a positive number).', 'error');
    return;
  }

  document.getElementById('qrResult').classList.add('hidden');

  const res = await fetch(`/api/admin/qr/${id}`);
  const data = await res.json();

  if (res.status === 404) {
    showAlert(`Question #${id} does not exist. Check the Questions tab for valid IDs.`, 'error');
    return;
  }
  if (!res.ok) {
    showAlert(data.error || 'Failed to generate QR code.', 'error');
    return;
  }

  document.getElementById('qrImage').src = data.qrCode;
  document.getElementById('qrUrl').textContent = data.url;
  document.getElementById('qrResult').classList.remove('hidden');
  showAlert(`QR code generated for Question #${id} (${data.question.difficulty})`, 'success');
}

async function loadAllQRs() {
  const res = await fetch('/api/admin/questions');
  if (!res.ok) return;
  const { questions } = await res.json();

  const grid = document.getElementById('allQRs');
  grid.innerHTML = '<p class="hint-text">Generating QR codes…</p>';

  const items = await Promise.all(questions.map(async (q) => {
    const r = await fetch(`/api/admin/qr/${q.id}`);
    if (!r.ok) return '';
    const d = await r.json();
    return `<div class="qr-item">
      <img src="${d.qrCode}" alt="Q${q.id}" />
      <p>Q${q.id}: ${escHtml(q.question_text.substring(0, 40))}…</p>
      <span class="badge badge-${q.difficulty}">${q.difficulty}</span>
    </div>`;
  }));
  grid.innerHTML = items.join('');
}

// ── Util ────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
