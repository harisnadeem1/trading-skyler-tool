import { api } from './api.js';

const signupForm = document.getElementById('signup-form');
const signupSubtitle = document.getElementById('signup-subtitle');
const signupEmail = document.getElementById('signup-email');
const signupPassword = document.getElementById('signup-password');
const signupConfirmPassword = document.getElementById('signup-confirm-password');
const signupMessage = document.getElementById('signup-message');
const signupSubmit = document.getElementById('signup-submit');

function getTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('token');
}

function setMessage(message, type = 'error') {
  if (!signupMessage) return;

  signupMessage.textContent = message || '';
  signupMessage.classList.remove('signup-success');

  if (type === 'success') {
    signupMessage.classList.add('signup-success');
  }
}

function setLoading(isLoading) {
  if (!signupSubmit) return;

  signupSubmit.classList.toggle('is-loading', isLoading);
  signupSubmit.disabled = isLoading;
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

async function validateInvite(token) {
  try {
    const result = await api.get(`/auth/invite/${token}`);

    if (!result?.invite?.email) {
      throw new Error('Invalid invite response.');
    }

    signupEmail.value = result.invite.email;
    signupSubtitle.innerHTML = `<span class="signup-email">${result.invite.email}</span> set password to activate account.`;
    signupForm.style.display = 'block';
  } catch (error) {
    signupSubtitle.textContent = error.message || 'This invite is invalid or expired.';
    signupForm.style.display = 'none';
  }
}

async function handleSignupSubmit(event) {
  event.preventDefault();

  const token = getTokenFromUrl();
  const password = signupPassword?.value || '';
  const confirmPassword = signupConfirmPassword?.value || '';

  setMessage('');
  setLoading(true);

  if (!token) {
    setMessage('Missing invite token.');
    setLoading(false);
    return;
  }

  if (password.length < 8) {
    setMessage('Password must be at least 8 characters.');
    setLoading(false);
    return;
  }

  if (password !== confirmPassword) {
    setMessage('Passwords do not match.');
    setLoading(false);
    return;
  }

  try {
    await api.post('/auth/signup', { token, password });
    setMessage('Account created successfully. Redirecting...', 'success');

    setTimeout(() => {
      window.location.href = './index.html';
    }, 1200);
  } catch (error) {
    setMessage(error.message || 'Signup failed.');
  } finally {
    setLoading(false);
  }
}

async function initSignupPage() {
  const token = getTokenFromUrl();

  setupPasswordToggles();

  if (!token) {
    signupSubtitle.textContent = 'Missing invite token.';
    if (signupForm) signupForm.style.display = 'none';
    return;
  }

  await validateInvite(token);

  if (signupForm) {
    signupForm.addEventListener('submit', handleSignupSubmit);
  }
}

initSignupPage();