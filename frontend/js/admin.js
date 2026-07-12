import { authManager } from './auth.js';
import { api } from './api.js';

const adminGuard = document.getElementById('admin-guard');
const adminApp = document.getElementById('admin-app');
const inviteForm = document.getElementById('invite-form');
const inviteEmail = document.getElementById('invite-email');
const inviteMessage = document.getElementById('invite-message');
const inviteResult = document.getElementById('invite-result');
const inviteSubmit = document.getElementById('invite-submit');
const adminLogoutBtn = document.getElementById('admin-logout-btn');
const goToAppLoginBtn = document.getElementById('go-to-app-login');
const refreshInvitesBtn = document.getElementById('refresh-invites-btn');
const invitesTbody = document.getElementById('invites-tbody');

const statTotalInvites = document.getElementById('stat-total-invites');
const statPendingInvites = document.getElementById('stat-pending-invites');
const statAcceptedInvites = document.getElementById('stat-accepted-invites');
const statExpiredInvites = document.getElementById('stat-expired-invites');

function showGuard() {
  if (adminGuard) adminGuard.style.display = 'flex';
  if (adminApp) adminApp.style.display = 'none';
}

function showAdminApp() {
  if (adminGuard) adminGuard.style.display = 'none';
  if (adminApp) adminApp.style.display = 'block';
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setInviteMessage(message = '', type = '') {
  if (!inviteMessage) return;

  inviteMessage.textContent = message;
  inviteMessage.classList.remove('is-error', 'is-success');

  if (type) {
    inviteMessage.classList.add(type === 'error' ? 'is-error' : 'is-success');
  }
}

function setInviteLoading(isLoading) {
  if (!inviteSubmit) return;

  inviteSubmit.classList.toggle('is-loading', isLoading);
  inviteSubmit.disabled = isLoading;
}

function formatDate(dateValue) {
  if (!dateValue) return '—';

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getDisplayStatus(invite) {
  if (invite.used_at) return 'accepted';

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return 'expired';
  }

  return 'pending';
}

function formatTimeRemaining(expiresAt, usedAt) {
  if (usedAt) return 'Accepted';

  if (!expiresAt) return '—';

  const now = new Date();
  const expiry = new Date(expiresAt);
  const diff = expiry.getTime() - now.getTime();

  if (diff <= 0) return 'Expired';

  const totalMinutes = Math.floor(diff / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

function renderInviteResult(invite) {
  const tokenSafe = escapeHtml(invite.token);
  const emailSafe = escapeHtml(invite.email);
  const statusSafe = escapeHtml(getDisplayStatus(invite));
  const signupUrl = `${window.location.origin}/signup.html?token=${tokenSafe}`;

  inviteResult.style.display = 'block';
  inviteResult.innerHTML = `
    <div class="invite-result__row"><strong>Email:</strong> ${emailSafe}</div>
    <div class="invite-result__row"><strong>Status:</strong> ${statusSafe}</div>
    <div class="invite-result__row"><strong>Expires:</strong> ${escapeHtml(formatDate(invite.expires_at))}</div>
    <div class="invite-result__row">
      <strong>Signup link:</strong>
      <div class="copy-link-box">
        <input
          type="text"
          class="copy-link-box__input"
          value="${signupUrl}"
          readonly
          aria-label="Signup link for ${emailSafe}"
        />
        <button
          type="button"
          class="copy-btn"
          data-copy-text="${signupUrl}"
          aria-label="Copy signup link"
        >
          Copy link
        </button>
      </div>
    </div>
  `;
}

function updateStats(invites = []) {
  const total = invites.length;
  const pending = invites.filter((invite) => getDisplayStatus(invite) === 'pending').length;
  const accepted = invites.filter((invite) => getDisplayStatus(invite) === 'accepted').length;
  const expired = invites.filter((invite) => getDisplayStatus(invite) === 'expired').length;

  if (statTotalInvites) statTotalInvites.textContent = total;
  if (statPendingInvites) statPendingInvites.textContent = pending;
  if (statAcceptedInvites) statAcceptedInvites.textContent = accepted;
  if (statExpiredInvites) statExpiredInvites.textContent = expired;
}

function renderInvitesTable(invites = []) {
  if (!invitesTbody) return;

  if (!invites.length) {
    invitesTbody.innerHTML = `
      <tr>
        <td colspan="7" class="admin-table__empty">No invites found yet.</td>
      </tr>
    `;
    updateStats([]);
    return;
  }

  invitesTbody.innerHTML = invites.map((invite) => {
    const status = getDisplayStatus(invite);
    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
    const signupUrl = `${window.location.origin}/signup.html?token=${invite.token}`;

    return `
      <tr>
        <td>${escapeHtml(invite.email)}</td>
        <td><span class="status-badge status-badge--${status}">${statusLabel}</span></td>
        <td>${escapeHtml(formatDate(invite.created_at))}</td>
        <td>${escapeHtml(formatDate(invite.used_at))}</td>
        <td>${escapeHtml(formatDate(invite.expires_at))}</td>
        <td>${escapeHtml(formatTimeRemaining(invite.expires_at, invite.used_at))}</td>
        <td>
          <button
            type="button"
            class="copy-btn copy-btn--table"
            data-copy-text="${escapeHtml(signupUrl)}"
            aria-label="Copy invite link for ${escapeHtml(invite.email)}"
          >
            Copy
          </button>
        </td>
      </tr>
    `;
  }).join('');

  updateStats(invites);
}

async function loadInvites() {
  try {
    const result = await api.get('/admin/invites');
    const invites = Array.isArray(result.invites) ? result.invites : [];
    renderInvitesTable(invites);
  } catch (error) {
    renderInvitesTable([]);
    setInviteMessage(error.message || 'Failed to load invites.', 'error');
  }
}

async function checkAdminAccess() {
  const user = await authManager.checkAuth();

  if (!user || user.role !== 'admin') {
    showGuard();
    return false;
  }

  showAdminApp();
  return true;
}

async function handleInviteSubmit(event) {
  event.preventDefault();

  const email = inviteEmail?.value.trim() || '';

  setInviteMessage('');
  if (inviteResult) {
    inviteResult.style.display = 'none';
    inviteResult.innerHTML = '';
  }

  if (!email) {
    setInviteMessage('Please enter an email address.', 'error');
    return;
  }

  try {
    setInviteLoading(true);

    const result = await api.post('/admin/invites', { email });

    setInviteMessage('Invite created successfully.', 'success');

    if (result?.invite) {
      renderInviteResult(result.invite);
    }

    if (inviteForm) inviteForm.reset();
    await loadInvites();
  } catch (error) {
    setInviteMessage(error.message || 'Failed to create invite.', 'error');
  } finally {
    setInviteLoading(false);
  }
}

async function handleLogout() {
  await authManager.logout();
  window.location.href = './index.html';
}
async function copyToClipboard(text) {
  await navigator.clipboard.writeText(text);
}

async function handleCopyButtonClick(button) {
  const textToCopy = button.getAttribute('data-copy-text');

  if (!textToCopy) return;

  const originalText = button.textContent;

  try {
    await copyToClipboard(textToCopy);
    button.textContent = 'Copied!';
    button.classList.add('is-copied');

    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove('is-copied');
    }, 1400);
  } catch (error) {
    button.textContent = 'Failed';
    setTimeout(() => {
      button.textContent = originalText;
    }, 1400);
  }
}

function bindEvents() {
  if (inviteForm) {
    inviteForm.addEventListener('submit', handleInviteSubmit);
  }

  if (adminLogoutBtn) {
    adminLogoutBtn.addEventListener('click', handleLogout);
  }

  if (goToAppLoginBtn) {
    goToAppLoginBtn.addEventListener('click', () => {
      window.location.href = './index.html';
    });
  }

  if (refreshInvitesBtn) {
    refreshInvitesBtn.addEventListener('click', loadInvites);
  }

  document.addEventListener('click', (event) => {
    const copyButton = event.target.closest('.copy-btn');
    if (!copyButton) return;

    handleCopyButtonClick(copyButton);
  });
}
async function initAdminPage() {
  bindEvents();

  const hasAccess = await checkAdminAccess();

  if (!hasAccess) return;

  await loadInvites();
}

initAdminPage();