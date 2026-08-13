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
  const backdrop = document.querySelector('[data-nav-backdrop]');

  if (!button || !nav || !backdrop) return;

  const openNav = () => {
    nav.classList.add('is-open');
    backdrop.classList.add('is-visible');
    document.body.classList.add('home-nav-open');

    button.setAttribute('aria-expanded', 'true');
    button.querySelector('.home-sr-only').textContent = 'Close navigation';
  };

  const closeNav = () => {
    nav.classList.remove('is-open');
    backdrop.classList.remove('is-visible');
    document.body.classList.remove('home-nav-open');

    button.setAttribute('aria-expanded', 'false');
    button.querySelector('.home-sr-only').textContent = 'Open navigation';
  };

  button.addEventListener('click', () => {
    const isOpen = nav.classList.contains('is-open');

    if (isOpen) {
      closeNav();
    } else {
      openNav();
    }
  });

  backdrop.addEventListener('click', closeNav);

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeNav);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeNav();
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 840) {
      closeNav();
    }
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