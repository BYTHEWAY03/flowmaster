// Shared auth utilities used by all pages

async function requireAuth() {
  const res = await fetch('/api/auth/me');
  if (!res.ok) {
    window.location.href = '/login';
    return null;
  }
  return res.json();
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}

function showAlert(message, type = 'error') {
  const el = document.getElementById('alert');
  if (!el) return;
  el.textContent = message;
  el.className = `alert alert-${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

function showFieldError(id, message) {
  const el = document.getElementById(id);
  if (el) el.textContent = message;
}

function clearErrors() {
  document.querySelectorAll('.field-error').forEach(el => el.textContent = '');
  const alertEl = document.getElementById('alert');
  if (alertEl) alertEl.classList.add('hidden');
}
