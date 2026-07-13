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

const adminTabs = Array.from(document.querySelectorAll('[data-admin-tab]'));
const adminPanels = {
  invites: document.getElementById('admin-panel-invites'),
  users: document.getElementById('admin-panel-users'),
};

const refreshUsersBtn = document.getElementById('refresh-users-btn');
const userSearch = document.getElementById('user-search');
const usersPrevBtn = document.getElementById('users-prev-btn');
const usersNextBtn = document.getElementById('users-next-btn');
const usersPageLabel = document.getElementById('users-page-label');

const usersList = document.getElementById('users-list');
const userHero = document.getElementById('user-detail-hero');
const userAccountCard = document.getElementById('user-account-card');
const userStatsCard = document.getElementById('user-stats-card');
const userPositionsCard = document.getElementById('user-positions-card');
const userJournalCard = document.getElementById('user-journal-card');
const userExitsCard = document.getElementById('user-exits-card');

const statTotalUsers = document.getElementById('stat-total-users');
const statActiveUsers = document.getElementById('stat-active-users');
const statTotalTrades = document.getElementById('stat-total-trades');
const statOpenPositions = document.getElementById('stat-open-positions');

const usersState = {
  page: 1,
  limit: 20,
  total: 0,
  pages: 1,
  search: '',
  items: [],
  selectedUserId: null,
  currentTab: 'invites',
};

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

function formatShortDate(dateValue) {
  if (!dateValue) return '—';

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(date);
}

function formatNumber(value) {
  const num = Number(value || 0);
  return new Intl.NumberFormat().format(num);
}

function formatMoney(value) {
  const num = Number(value || 0);
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
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

function updateInviteStats(invites = []) {
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
    updateInviteStats([]);
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

  updateInviteStats(invites);
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

function updateUserStats(users = []) {
  const totalUsers = users.length;
  const activeUsers = users.filter((user) => user.is_active).length;
  const totalTrades = users.reduce((sum, user) => sum + Number(user.total_trades || 0), 0);
  const openPositions = users.reduce((sum, user) => sum + Number(user.open_trades || 0), 0);

  if (statTotalUsers) statTotalUsers.textContent = formatNumber(totalUsers);
  if (statActiveUsers) statActiveUsers.textContent = formatNumber(activeUsers);
  if (statTotalTrades) statTotalTrades.textContent = formatNumber(totalTrades);
  if (statOpenPositions) statOpenPositions.textContent = formatNumber(openPositions);
}

function renderUsersList(users = []) {
  if (!usersList) return;

  if (!users.length) {
    usersList.innerHTML = `<div class="admin-empty-state">No users found.</div>`;
    updateUserStats([]);
    return;
  }

  usersList.innerHTML = users.map((user) => `
    <button
      type="button"
      class="admin-user-list-item ${usersState.selectedUserId === user.id ? 'is-active' : ''}"
      data-view-user="${escapeHtml(user.id)}"
    >
      <div class="admin-user-list-item__top">
        <div class="admin-user-list-item__email">${escapeHtml(user.email)}</div>
        <span class="status-badge status-badge--${user.is_active ? 'accepted' : 'expired'}">
          ${user.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>

      <div class="admin-user-list-item__meta">
        <span class="admin-chip">${escapeHtml(user.role || 'user')}</span>
        <span class="admin-chip">${escapeHtml(formatShortDate(user.created_at))}</span>
      </div>

      <div class="admin-user-list-item__stats">
        <div class="admin-user-list-stat">
          <span class="admin-user-list-stat__label">PnL</span>
          <span class="admin-user-list-stat__value">${escapeHtml(formatMoney(user.realized_pnl || 0))}</span>
        </div>
        <div class="admin-user-list-stat">
          <span class="admin-user-list-stat__label">Trades</span>
          <span class="admin-user-list-stat__value">${escapeHtml(formatNumber(user.total_trades || 0))}</span>
        </div>
        <div class="admin-user-list-stat">
          <span class="admin-user-list-stat__label">Open</span>
          <span class="admin-user-list-stat__value">${escapeHtml(formatNumber(user.open_trades || 0))}</span>
        </div>
        <div class="admin-user-list-stat">
          <span class="admin-user-list-stat__label">Last trade</span>
          <span class="admin-user-list-stat__value">${escapeHtml(formatShortDate(user.last_trade_at))}</span>
        </div>
      </div>
    </button>
  `).join('');

  updateUserStats(users);
}

function renderEmptyUserWorkspace(message = 'Select a user from the left side.') {
  if (userHero) {
    userHero.innerHTML = `<div class="admin-empty-state">${escapeHtml(message)}</div>`;
  }
  if (userAccountCard) {
    userAccountCard.innerHTML = `
      <div class="admin-card__header">
        <div><h2>Account</h2><p>Profile and risk settings.</p></div>
      </div>
      <div class="admin-empty-state">${escapeHtml(message)}</div>
    `;
  }
  if (userStatsCard) {
    userStatsCard.innerHTML = `
      <div class="admin-card__header">
        <div><h2>Trading stats</h2><p>Journal and performance summary.</p></div>
      </div>
      <div class="admin-empty-state">${escapeHtml(message)}</div>
    `;
  }
  if (userPositionsCard) {
    userPositionsCard.innerHTML = `
      <div class="admin-card__header">
        <div><h2>Open positions</h2><p>Currently active trades for the selected user.</p></div>
      </div>
      <div class="admin-empty-state">${escapeHtml(message)}</div>
    `;
  }
  if (userJournalCard) {
    userJournalCard.innerHTML = `
      <div class="admin-card__header">
        <div><h2>Recent journal</h2><p>Latest journal entries and trade lifecycle activity.</p></div>
      </div>
      <div class="admin-empty-state">${escapeHtml(message)}</div>
    `;
  }
  if (userExitsCard) {
    userExitsCard.innerHTML = `
      <div class="admin-card__header">
        <div><h2>Recent exits</h2><p>Latest trims and closes.</p></div>
      </div>
      <div class="admin-empty-state">${escapeHtml(message)}</div>
    `;
  }
  
}

function renderUserHero(user, stats = {}) {
  if (!userHero) return;

  userHero.innerHTML = `
    <div class="admin-user-hero__top">
      <div class="admin-user-hero__title">
        <h2>${escapeHtml(user.email)}</h2>
        <p>Joined ${escapeHtml(formatDate(user.created_at))}</p>
      </div>

      <div class="admin-user-hero__chips">
        <span class="admin-chip">${escapeHtml(user.role || 'user')}</span>
        <span class="admin-chip">${user.is_active ? 'Active' : 'Inactive'}</span>
        <span class="admin-chip">${escapeHtml(user.theme || '—')}</span>
      </div>
    </div>

    <div class="admin-user-hero__metrics">
      <div class="admin-hero-metric">
        <span class="admin-hero-metric__label">Current account</span>
        <strong class="admin-hero-metric__value">${escapeHtml(formatMoney(user.current_account_size || 0))}</strong>
      </div>
      <div class="admin-hero-metric">
        <span class="admin-hero-metric__label">Realized PnL</span>
        <strong class="admin-hero-metric__value">${escapeHtml(formatMoney(user.realized_pnl || 0))}</strong>
      </div>
      <div class="admin-hero-metric">
        <span class="admin-hero-metric__label">Open positions</span>
        <strong class="admin-hero-metric__value">${escapeHtml(formatNumber(stats.open_trades || 0))}</strong>
      </div>
      <div class="admin-hero-metric">
        <span class="admin-hero-metric__label">Total trades</span>
        <strong class="admin-hero-metric__value">${escapeHtml(formatNumber(stats.total_trades || 0))}</strong>
      </div>
    </div>
  `;
}

function renderAccountCard(user) {
  if (!userAccountCard) return;

  userAccountCard.innerHTML = `
    <div class="admin-card__header">
      <div>
        <h2>Account</h2>
        <p>Profile and risk settings.</p>
      </div>
    </div>

    <div class="admin-detail-grid">
      <div class="admin-detail-item">
        <span class="admin-detail-item__label">Email</span>
        <span class="admin-detail-item__value">${escapeHtml(user.email)}</span>
      </div>
      <div class="admin-detail-item">
        <span class="admin-detail-item__label">Role</span>
        <span class="admin-detail-item__value">${escapeHtml(user.role || 'user')}</span>
      </div>
      <div class="admin-detail-item">
        <span class="admin-detail-item__label">Status</span>
        <span class="admin-detail-item__value">${user.is_active ? 'Active' : 'Inactive'}</span>
      </div>
      <div class="admin-detail-item">
        <span class="admin-detail-item__label">Created</span>
        <span class="admin-detail-item__value">${escapeHtml(formatDate(user.created_at))}</span>
      </div>
      <div class="admin-detail-item">
        <span class="admin-detail-item__label">Starting account</span>
        <span class="admin-detail-item__value">${escapeHtml(formatMoney(user.starting_account_size || 0))}</span>
      </div>
      <div class="admin-detail-item">
        <span class="admin-detail-item__label">Current account</span>
        <span class="admin-detail-item__value">${escapeHtml(formatMoney(user.current_account_size || 0))}</span>
      </div>
      <div class="admin-detail-item">
        <span class="admin-detail-item__label">Realized PnL</span>
        <span class="admin-detail-item__value">${escapeHtml(formatMoney(user.realized_pnl || 0))}</span>
      </div>
      <div class="admin-detail-item">
        <span class="admin-detail-item__label">Default risk %</span>
        <span class="admin-detail-item__value">${escapeHtml(String(user.default_risk_percent ?? '—'))}</span>
      </div>
      <div class="admin-detail-item">
        <span class="admin-detail-item__label">Default max position %</span>
        <span class="admin-detail-item__value">${escapeHtml(String(user.default_max_position_percent ?? '—'))}</span>
      </div>
      <div class="admin-detail-item">
        <span class="admin-detail-item__label">Theme</span>
        <span class="admin-detail-item__value">${escapeHtml(user.theme || '—')}</span>
      </div>
      <div class="admin-detail-item">
        <span class="admin-detail-item__label">Wizard enabled</span>
        <span class="admin-detail-item__value">${user.wizard_enabled ? 'Yes' : 'No'}</span>
      </div>
      <div class="admin-detail-item">
        <span class="admin-detail-item__label">Sound enabled</span>
        <span class="admin-detail-item__value">${user.sound_enabled ? 'Yes' : 'No'}</span>
      </div>
    </div>
  `;
}

function renderStatsCard(user, stats = []) {
  if (!userStatsCard) return;

  userStatsCard.innerHTML = `
    <div class="admin-card__header">
      <div>
        <h2>Trading stats</h2>
        <p>Journal and performance summary.</p>
      </div>
    </div>

    <div class="admin-detail-grid">
      <div class="admin-detail-item">
        <span class="admin-detail-item__label">Total trades</span>
        <span class="admin-detail-item__value">${escapeHtml(formatNumber(stats.total_trades || 0))}</span>
      </div>
      <div class="admin-detail-item">
        <span class="admin-detail-item__label">Open</span>
        <span class="admin-detail-item__value">${escapeHtml(formatNumber(stats.open_trades || 0))}</span>
      </div>
      <div class="admin-detail-item">
        <span class="admin-detail-item__label">Trimmed</span>
        <span class="admin-detail-item__value">${escapeHtml(formatNumber(stats.trimmed_trades || 0))}</span>
      </div>
      <div class="admin-detail-item">
        <span class="admin-detail-item__label">Closed</span>
        <span class="admin-detail-item__value">${escapeHtml(formatNumber(stats.closed_trades || 0))}</span>
      </div>
    </div>
  `;
}

function renderPositionsCard(openPositions = []) {
  if (!userPositionsCard) return;

  userPositionsCard.innerHTML = `
    <div class="admin-card__header">
      <div>
        <h2>Open positions</h2>
        <p>Currently active trades for the selected user.</p>
      </div>
    </div>
    ${
      openPositions.length
        ? `
        <div class="admin-table-wrap">
          <table class="admin-table-compact">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Status</th>
                <th>Shares</th>
                <th>Entry</th>
                <th>Stop</th>
                <th>Risk $</th>
                <th>Opened</th>
              </tr>
            </thead>
            <tbody>
              ${openPositions.map((trade) => `
                <tr>
                  <td>${escapeHtml(trade.ticker || '—')}</td>
                  <td><span class="status-badge status-badge--pending">${escapeHtml(trade.status || 'open')}</span></td>
                  <td>${escapeHtml(formatNumber(trade.remaining_shares ?? trade.shares ?? 0))}</td>
                  <td>${escapeHtml(String(trade.entry_price ?? '—'))}</td>
                  <td>${escapeHtml(String(trade.current_stop ?? trade.stop_price ?? '—'))}</td>
                  <td>${escapeHtml(formatMoney(trade.risk_dollars || 0))}</td>
                  <td>${escapeHtml(formatShortDate(trade.opened_at))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `
        : `<div class="admin-empty-state">No open positions.</div>`
    }
  `;
}

function renderJournalCard(recentTrades = []) {
  if (!userJournalCard) return;

  userJournalCard.innerHTML = `
    <div class="admin-card__header">
      <div>
        <h2>Recent journal</h2>
        <p>Latest journal entries and trade lifecycle activity.</p>
      </div>
    </div>
    ${
      recentTrades.length
        ? `
        <div class="admin-table-wrap">
          <table class="admin-table-compact">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Status</th>
                <th>Shares</th>
                <th>Risk $</th>
                <th>PnL</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              ${recentTrades.map((trade) => `
                <tr>
                  <td>
                    <div>${escapeHtml(trade.ticker || '—')}</div>
                    <div class="admin-subtle">Entry ${escapeHtml(String(trade.entry_price ?? '—'))}</div>
                  </td>
                  <td>${escapeHtml(trade.status || '—')}</td>
                  <td>${escapeHtml(formatNumber(trade.shares || 0))}</td>
                  <td>${escapeHtml(formatMoney(trade.risk_dollars || 0))}</td>
                  <td>${escapeHtml(formatMoney(trade.total_realized_pnl ?? trade.pnl ?? 0))}</td>
                  <td>${escapeHtml(formatDate(trade.updated_at))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `
        : `<div class="admin-empty-state">No journal entries found.</div>`
    }
  `;
}

function renderExitsCard(recentExits = []) {
  if (!userExitsCard) return;

  userExitsCard.innerHTML = `
    <div class="admin-card__header">
      <div>
        <h2>Recent exits</h2>
        <p>Latest trims and closes.</p>
      </div>
    </div>
    ${
      recentExits.length
        ? `
        <div class="admin-mini-stack">
          ${recentExits.map((exit) => `
            <div class="admin-mini-card">
              <h3 class="admin-mini-card__title">
                ${escapeHtml(exit.event_type || 'exit')} · ${escapeHtml(formatMoney(exit.pnl || 0))}
              </h3>
              <div class="admin-mini-card__meta">
                Exit price: ${escapeHtml(String(exit.exit_price ?? '—'))}<br>
                Shares closed: ${escapeHtml(formatNumber(exit.shares_closed || 0))}<br>
                Date: ${escapeHtml(formatDate(exit.exit_date))}
              </div>
            </div>
          `).join('')}
        </div>
      `
        : `<div class="admin-empty-state">No exits found.</div>`
    }
  `;
}



function renderUserDetail(data) {
  const user = data?.user;
  const stats = data?.stats || {};
  const recentTrades = Array.isArray(data?.recent_trades) ? data.recent_trades : [];
  const recentExits = Array.isArray(data?.recent_exits) ? data.recent_exits : [];

  const openPositions = Array.isArray(data?.open_positions)
    ? data.open_positions
    : recentTrades.filter((trade) => ['open', 'trimmed'].includes(trade.status));

  if (!user) {
    renderEmptyUserWorkspace('User details could not be loaded.');
    return;
  }

  renderUserHero(user, stats);
  renderAccountCard(user);
  renderStatsCard(user, stats);
  renderPositionsCard(openPositions);
  renderJournalCard(recentTrades);
  renderExitsCard(recentExits);
}

function renderUserDetailLoading() {
  renderEmptyUserWorkspace('Loading user details...');
}

function updateUsersPagination() {
  if (usersPageLabel) {
    usersPageLabel.textContent = `Page ${usersState.page} of ${Math.max(usersState.pages, 1)}`;
  }

  if (usersPrevBtn) {
    usersPrevBtn.disabled = usersState.page <= 1;
  }

  if (usersNextBtn) {
    usersNextBtn.disabled = usersState.page >= usersState.pages;
  }
}

async function loadUsers() {
  try {
    const params = new URLSearchParams({
      page: String(usersState.page),
      limit: String(usersState.limit),
    });

    if (usersState.search) {
      params.set('search', usersState.search);
    }

    const result = await api.get(`/admin/users?${params.toString()}`);
    const users = Array.isArray(result.users) ? result.users : [];

    usersState.items = users;
    usersState.total = Number(result?.pagination?.total || 0);
    usersState.pages = Number(result?.pagination?.pages || 1);

    renderUsersList(users);
    updateUsersPagination();

    if (!users.length) {
      renderEmptyUserWorkspace('No users found.');
      return;
    }

    const selectedStillExists = users.some((user) => user.id === usersState.selectedUserId);
    if (!usersState.selectedUserId || !selectedStillExists) {
      usersState.selectedUserId = users[0].id;
      renderUsersList(users);
      await loadUserDetail(users[0].id);
    }
  } catch (error) {
    usersState.items = [];
    usersState.total = 0;
    usersState.pages = 1;
    renderUsersList([]);
    updateUsersPagination();
    renderEmptyUserWorkspace(error.message || 'Failed to load users.');
  }
}

async function loadUserDetail(userId) {
  if (!userId) return;

  usersState.selectedUserId = userId;
  renderUsersList(usersState.items);
  renderUserDetailLoading();

  try {
    const result = await api.get(`/admin/users/${encodeURIComponent(userId)}`);
    renderUserDetail(result);
  } catch (error) {
    renderEmptyUserWorkspace(error.message || 'Failed to load user details.');
  }
}

function setActiveTab(tabName) {
  usersState.currentTab = tabName;

  adminTabs.forEach((tab) => {
    const isActive = tab.dataset.adminTab === tabName;
    tab.classList.toggle('is-active', isActive);
  });

  Object.entries(adminPanels).forEach(([name, panel]) => {
    if (!panel) return;
    const isActive = name === tabName;
    panel.hidden = !isActive;
    panel.classList.toggle('is-active', isActive);
  });
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

  if (refreshUsersBtn) {
    refreshUsersBtn.addEventListener('click', loadUsers);
  }

  if (usersPrevBtn) {
    usersPrevBtn.addEventListener('click', async () => {
      if (usersState.page <= 1) return;
      usersState.page -= 1;
      await loadUsers();
    });
  }

  if (usersNextBtn) {
    usersNextBtn.addEventListener('click', async () => {
      if (usersState.page >= usersState.pages) return;
      usersState.page += 1;
      await loadUsers();
    });
  }

  if (userSearch) {
    let searchTimer = null;

    userSearch.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(async () => {
        usersState.search = userSearch.value.trim();
        usersState.page = 1;
        await loadUsers();
      }, 300);
    });
  }

  adminTabs.forEach((tab) => {
    tab.addEventListener('click', async () => {
      const nextTab = tab.dataset.adminTab;
      if (!nextTab || nextTab === usersState.currentTab) return;

      setActiveTab(nextTab);

      if (nextTab === 'users' && !usersState.items.length) {
        await loadUsers();
      }
    });
  });

  document.addEventListener('click', (event) => {
    const copyButton = event.target.closest('.copy-btn');
    if (copyButton) {
      handleCopyButtonClick(copyButton);
      return;
    }

    const viewUserButton = event.target.closest('[data-view-user]');
    if (viewUserButton) {
      const userId = viewUserButton.getAttribute('data-view-user');
      loadUserDetail(userId);
    }
  });
}

async function initAdminPage() {
  bindEvents();

  const hasAccess = await checkAdminAccess();
  if (!hasAccess) return;

  setActiveTab('invites');
  renderEmptyUserWorkspace();
  await loadInvites();
}

initAdminPage();