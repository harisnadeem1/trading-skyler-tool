import { api } from './api.js';

const loginTab = document.getElementById('login-tab');
const signupTab = document.getElementById('signup-tab');
const loginPanel = document.getElementById('login-panel');
const signupPanel = document.getElementById('signup-panel');

const loginForm = document.getElementById('login-form');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const loginMessage = document.getElementById('login-message');
const loginSubmit = document.getElementById('login-submit');

const signupForm = document.getElementById('signup-form');
const signupSubtitle = document.getElementById('signup-subtitle');
const inviteBanner = document.getElementById('invite-banner');
const inviteStatus = document.getElementById('invite-status');
const signupEmail = document.getElementById('signup-email');
const signupPassword = document.getElementById('signup-password');
const signupConfirmPassword = document.getElementById('signup-confirm-password');
const signupMessage = document.getElementById('signup-message');
const signupSubmit = document.getElementById('signup-submit');

function getTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('token');
}

function setMessage(el, message, type = 'error') {
  if (!el) return;
  el.textContent = message || '';
  el.classList.remove('auth-success');
  if (type === 'success') {
    el.classList.add('auth-success');
  }
}

function setLoading(button, isLoading) {
  if (!button) return;
  button.classList.toggle('is-loading', isLoading);
  button.disabled = isLoading;
}

function setupPasswordToggles() {
  const toggleButtons = document.querySelectorAll('.password-toggle');

  toggleButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.getAttribute('data-toggle-target');
      const input = document.getElementById(targetId);
      if (!input) return;

      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      button.textContent = isPassword ? 'Hide' : 'Show';
      button.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
      button.setAttribute('aria-pressed', String(isPassword));
    });
  });
}

function setActiveTab(mode) {
  const isLogin = mode === 'login';

  loginTab?.classList.toggle('is-active', isLogin);
  signupTab?.classList.toggle('is-active', !isLogin);

  loginTab?.setAttribute('aria-selected', String(isLogin));
  signupTab?.setAttribute('aria-selected', String(!isLogin));

  loginPanel?.classList.toggle('is-active', isLogin);
  signupPanel?.classList.toggle('is-active', !isLogin);
}

function redirectAfterAuth(user) {
  if (user?.role === 'admin') {
    window.location.replace('./admin.html');
    return;
  }
  window.location.replace('./index.html');
}

async function validateInvite(token) {
  try {
    const result = await api.get(`/auth/invite/${token}`);

    if (!result?.invite?.email) {
      throw new Error('Invalid invite response.');
    }

    if (inviteBanner) inviteBanner.hidden = false;
    if (inviteStatus) {
      inviteStatus.textContent = `Invited email: ${result.invite.email}`;
    }

    if (signupSubtitle) {
      signupSubtitle.innerHTML = `<span class="auth-email">${result.invite.email}</span> complete your invite signup below.`;
    }

    if (signupEmail) {
      signupEmail.value = result.invite.email;
      signupEmail.readOnly = true;
    }

    if (signupForm) signupForm.style.display = 'block';
  } catch (error) {
    if (inviteBanner) inviteBanner.hidden = false;
    if (inviteStatus) {
      inviteStatus.textContent = error.message || 'This invite is invalid or expired.';
    }
    if (signupSubtitle) {
      signupSubtitle.textContent = 'Invite signup unavailable.';
    }
    if (signupForm) signupForm.style.display = 'block';
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  const email = loginEmail?.value.trim() || '';
  const password = loginPassword?.value || '';

  setMessage(loginMessage, '');

  if (!email || !password) {
    setMessage(loginMessage, 'Enter your email and password.');
    return;
  }

  setLoading(loginSubmit, true);

  try {
    const user = await api.post('/auth/login', { email, password });
    setMessage(loginMessage, 'Signed in successfully. Redirecting...', 'success');
    setTimeout(() => redirectAfterAuth(user?.user || user), 700);
  } catch (error) {
    setMessage(loginMessage, error.message || 'Unable to sign in.');
  } finally {
    setLoading(loginSubmit, false);
  }
}

async function handleSignupSubmit(event) {
  event.preventDefault();

  const token = getTokenFromUrl();
  const email = signupEmail?.value.trim() || '';
  const password = signupPassword?.value || '';
  const confirmPassword = signupConfirmPassword?.value || '';
  const isInviteFlow = !!token;

  setMessage(signupMessage, '');

  if (!isInviteFlow && !email) {
    setMessage(signupMessage, 'Enter your email.');
    return;
  }

  if (password.length < 8) {
    setMessage(signupMessage, 'Password must be at least 8 characters.');
    return;
  }

  if (password !== confirmPassword) {
    setMessage(signupMessage, 'Passwords do not match.');
    return;
  }

  setLoading(signupSubmit, true);

  try {
    let result;

    if (isInviteFlow) {
      result = await api.post('/auth/signup', {
        token,
        password,
      });
    } else {
      result = await api.post('/auth/register', {
        email,
        password,
      });
    }

    setMessage(signupMessage, 'Account created successfully. Redirecting...', 'success');
    setTimeout(() => redirectAfterAuth(result?.user || result), 900);
  } catch (error) {
    setMessage(signupMessage, error.message || 'Signup failed.');
  } finally {
    setLoading(signupSubmit, false);
  }
}

function setupTabs() {
  loginTab?.addEventListener('click', () => setActiveTab('login'));
  signupTab?.addEventListener('click', () => setActiveTab('signup'));
}

async function initAuthPage() {
  setupPasswordToggles();
  setupTabs();

  const token = getTokenFromUrl();

  if (token) {
    setActiveTab('signup');
    await validateInvite(token);
  } else {
    setActiveTab('login');
    if (signupForm) signupForm.style.display = 'block';
    if (signupSubtitle) {
      signupSubtitle.textContent = 'Create a new account or sign in to continue.';
    }
    if (signupEmail) {
      signupEmail.removeAttribute('readonly');
      signupEmail.value = '';
    }
    if (inviteBanner) inviteBanner.hidden = true;
  }

  loginForm?.addEventListener('submit', handleLoginSubmit);
  signupForm?.addEventListener('submit', handleSignupSubmit);
}

document.addEventListener('DOMContentLoaded', initAuthPage);