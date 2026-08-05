import { authManager } from './auth.js';


class RoninSystemView {
  constructor() {
    this.root = null;
    this.page = null;
    this.hero = null;
    this.stickyCta = null;
    this.checkoutButtons = [];
    this.subnavLinks = [];
    this.observer = null;
    this.initialized = false;
    this.currentView = null;
    this.hasAcademyAccess = false;
  }

 async init() {
    this.root = document.getElementById('roninSystemView');
    if (!this.root) return;

    this.page = this.root.querySelector('.ronin-system-page');
    this.hero = this.root.querySelector('.system-hero');
    this.stickyCta = this.root.querySelector('[data-sticky-course-cta]');
    this.checkoutButtons = Array.from(this.root.querySelectorAll('[data-checkout-button]'));
    this.subnavLinks = Array.from(this.root.querySelectorAll('.system-subnav a'));

     try {
    await authManager.checkAuth();
    this.hasAcademyAccess = Boolean(authManager.getUser()?.hasAcademyAccess);
  } catch {
    this.hasAcademyAccess = false;
  }

    this.bindCheckoutButtons();
    this.setCheckoutButtonState();
    this.bindSubnavLinks();
    this.setupStickyCTA();

    this.initialized = true;
  }

  activate() {
    this.currentView = 'ronin-system';
    document.body.classList.add('route-ronin-system');
    this.updateStickyCTA(true);
  }

   setCheckoutButtonState() {
  const label = this.hasAcademyAccess
    ? 'Open the Ronin Academy'
    : 'Unlock the Ronin Trading System';

  const href = this.hasAcademyAccess ? '/academy.html' : '#';

  this.checkoutButtons.forEach((button) => {
    button.textContent = label;

    if (button.tagName === 'A') {
      button.href = href;
    } else {
      button.dataset.href = href;
    }
  });
}

  deactivate() {
    this.currentView = null;
    document.body.classList.remove('route-ronin-system');
    this.updateStickyCTA(false);
  }

  
bindCheckoutButtons() {
  this.checkoutButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      if (this.hasAcademyAccess) {
        window.location.assign('/academy.html');
        return;
      }

      event.preventDefault();
      window.location.hash = '#';
    });
  });
}

 

  bindSubnavLinks() {
    this.subnavLinks.forEach((link) => {
      link.addEventListener('click', (event) => {
        const href = link.getAttribute('href');
        if (!href || !href.startsWith('#')) return;

        const target = this.root.querySelector(href);
        if (!target) return;

        event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  setupStickyCTA() {
    if (!this.hero || !this.stickyCta) return;

    this.observer = new IntersectionObserver(
      ([entry]) => {
        const isRoninActive = document.body.classList.contains('route-ronin-system');
        this.stickyCta.classList.toggle('is-visible', isRoninActive && !entry.isIntersecting);
      },
      { threshold: 0.15 }
    );

    this.observer.observe(this.hero);
  }

  updateStickyCTA(show) {
    if (!this.stickyCta) return;

    if (!show) {
      this.stickyCta.classList.remove('is-visible');
      return;
    }

    const heroVisible = this.hero && this.isInViewport(this.hero);
    this.stickyCta.classList.toggle('is-visible', !heroVisible);
  }

  isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return rect.top < window.innerHeight && rect.bottom > 0;
  }
}

export const roninSystemView = new RoninSystemView();