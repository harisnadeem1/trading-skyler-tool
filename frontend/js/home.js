import { authManager } from './auth.js';

async function redirectIfAuthed() {
  try {
    const user = await authManager.checkAuth();
    if (!user) return;

    if (user.role === 'admin') {
      window.location.replace('./admin.html');
      return;
    }

    window.location.replace('./index.html');
  } catch (error) {
    console.error('Auth check failed:', error);
  }
}

function setupHeaderScroll() {
  const header = document.querySelector('[data-header]');
  if (!header) return;

  let ticking = false;

  const update = () => {
    header.classList.toggle('is-scrolled', window.scrollY > 10);
    ticking = false;
  };

  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    },
    { passive: true }
  );

  update();
}

function setupMobileNav() {
  const button = document.querySelector('[data-menu-button]');
  const nav = document.querySelector('[data-nav]');

  if (!button || !nav) return;

  const closeNav = () => {
    nav.classList.remove('is-open');
    button.setAttribute('aria-expanded', 'false');
  };

  button.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('is-open');
    button.setAttribute('aria-expanded', String(isOpen));
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeNav);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeNav();
  });
}

function setupYear() {
  const yearEl = document.querySelector('[data-year]');
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }
}

async function start() {
  await redirectIfAuthed();
  setupMobileNav();
  setupHeaderScroll();
  setupYear();
}

document.addEventListener('DOMContentLoaded', start);