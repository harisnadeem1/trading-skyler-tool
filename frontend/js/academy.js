'use strict';

import { api } from './api.js';
import { authManager } from './auth.js';

(() => {
  const els = {
    loading: document.querySelector('[data-loading]'),
    error: document.querySelector('[data-academy-error]'),
    errorTitle: document.querySelector('[data-academy-error-title]'),
    errorMessage: document.querySelector('[data-academy-error-message]'),
    errorPrimaryAction: document.querySelector('[data-academy-primary-action]'),
    errorSecondaryAction: document.querySelector('[data-academy-secondary-action]'),
    lesson: document.querySelector('[data-lesson]'),
    masteryDashboard: document.querySelector('[data-mastery-dashboard]'),
    levelGrid: document.querySelector('[data-level-grid]'),
    overallPercent: document.querySelector('[data-overall-percent]'),
    overallBar: document.querySelector('[data-overall-bar]'),
    certificationStatus: document.querySelector('[data-certification-status]'),
    masteryMessage: document.querySelector('[data-mastery-message]'),
    resumeCourse: document.querySelector('[data-resume-course]'),
    nav: document.querySelector('[data-course-nav]'),
    sidebar: document.querySelector('[data-course-sidebar]'),
    menuButton: document.querySelector('[data-course-menu]'),
    search: document.querySelector('[data-course-search]'),
    searchResults: document.querySelector('[data-search-results]'),
    completedCount: document.querySelector('[data-completed-count]'),
    totalCount: document.querySelector('[data-total-count]'),
    progressBar: document.querySelector('[data-progress-bar]'),
    courseVersion: document.querySelector('[data-course-version]'),
    userButton: document.querySelector('[data-user-button]'),
    userMenu: document.querySelector('[data-user-menu]'),
    userName: document.querySelector('[data-user-name]'),
    userInitial: document.querySelector('[data-user-initial]'),
    logout: document.querySelector('[data-logout]'),
    breadcrumb: document.querySelector('[data-lesson-breadcrumb]'),
    module: document.querySelector('[data-lesson-module]'),
    title: document.querySelector('[data-lesson-title]'),
    summary: document.querySelector('[data-lesson-summary]'),
    duration: document.querySelector('[data-lesson-duration]'),
    content: document.querySelector('[data-lesson-content]'),
    lessonLevel: document.querySelector('[data-lesson-level]'),
    lessonType: document.querySelector('[data-lesson-type]'),
    lessonStatus: document.querySelector('[data-lesson-status]'),
    complete: document.querySelector('[data-complete-lesson]'),
    moduleObjectivesCard: document.querySelector('[data-module-objectives-card]'),
    moduleObjectivesTitle: document.querySelector('[data-module-objectives-title]'),
    moduleObjectives: document.querySelector('[data-module-objectives]'),
    notes: document.querySelector('[data-lesson-notes]'),
    saveNotes: document.querySelector('[data-save-notes]'),
    notesStatus: document.querySelector('[data-notes-status]'),
    practiceSection: document.querySelector('[data-practice-section]'),
    practiceCheckbox: document.querySelector('[data-practice-checkbox]'),
    reflection: document.querySelector('[data-lesson-reflection]'),
    savePractice: document.querySelector('[data-save-practice]'),
    practiceStatus: document.querySelector('[data-practice-status]'),
    quizSection: document.querySelector('[data-quiz-section]'),
    quizLabel: document.querySelector('[data-quiz-label]'),
    quizTitle: document.querySelector('[data-quiz-title]'),
    quizRequirement: document.querySelector('[data-quiz-requirement]'),
    quizForm: document.querySelector('[data-quiz-form]'),
    quizResult: document.querySelector('[data-quiz-result]'),
    previous: document.querySelector('[data-previous-lesson]'),
    next: document.querySelector('[data-next-lesson]'),
    currentLevelLabel: document.querySelector('[data-current-level-label]'),
    currentLevelTitle: document.querySelector('[data-current-level-title]'),
    currentLevelBar: document.querySelector('[data-current-level-bar]'),
    currentLevelPercent: document.querySelector('[data-current-level-percent]'),
    currentLevelMessage: document.querySelector('[data-current-level-message]'),
    tabs: document.querySelector('[data-academy-tabs]'),
    tabButtons: [...document.querySelectorAll('[data-view-tab]')],
    viewPanels: [...document.querySelectorAll('[data-view-panel]')],
    openViewButtons: [...document.querySelectorAll('[data-open-view]')],
    openLessonButtons: [...document.querySelectorAll('[data-open-lesson]')],
    copyColorButtons: [...document.querySelectorAll('[data-copy-color]')],
    copyStatus: document.querySelector('[data-copy-status]'),
    discordTitle: document.querySelector('[data-discord-title]'),
    discordMessage: document.querySelector('[data-discord-message]'),
    discordDetails: document.querySelector('[data-discord-details]'),
    discordUser: document.querySelector('[data-discord-user]'),
    discordRole: document.querySelector('[data-discord-role]'),
    discordState: document.querySelector('[data-discord-state]'),
    discordConnect: document.querySelector('[data-discord-connect]'),
    discordSync: document.querySelector('[data-discord-sync]'),
    discordOpen: document.querySelector('[data-discord-open]'),
    discordDisconnect: document.querySelector('[data-discord-disconnect]'),
    discordFeedback: document.querySelector('[data-discord-feedback]'),
resourceActions: document.querySelector('[data-resource-actions-button]'),
paletteImage: document.querySelector('[data-palette-image]'),

  };

  const state = {
    user: null,
    outline: null,
    mastery: null,
    progress: new Map(),
    current: null,
    currentView: 'course',
    lessonButtons: new Map(),
    moduleGroups: new Map(),
    resumeLessonId: null,
    lessonOpenedAt: null,
    discordLoaded: false,
    discord: null
  };

  async function fetchJson(url, options = {}) {
    const { headers: extraHeaders = {}, ...requestOptions } = options;
    let response;
    try {
      response = await fetch(url, {
        credentials: 'same-origin',
        ...requestOptions,
        headers: {
          Accept: 'application/json',
          ...(requestOptions.body ? { 'Content-Type': 'application/json' } : {}),
          ...extraHeaders
        }
      });
    } catch {
      const error = new Error(
        window.location.protocol === 'file:'
          ? 'The Academy must run through the Ronin server, not from a file URL.'
          : 'Unable to reach the Ronin course API. Confirm that the Node server and PostgreSQL database are available.'
      );
      error.code = 'API_UNREACHABLE';
      throw error;
    }

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => ({}))
      : {};

    if (!response.ok) {
      const error = new Error(payload.error || 'The request failed.');
      error.status = response.status;
      error.code = payload.code;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

const assetBase =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : '';

const resourceActions = `
  <div class="data-resource-actions-button">
    <a class="academy-button" href="${assetBase}/api/course/asset/ronin-tradingview-palette.png" target="_blank" rel="noopener">Open palette image</a>
  </div>
`;

if (els.resourceActions) {
  els.resourceActions.innerHTML = resourceActions;
}
if (els.paletteImage) {
  els.paletteImage.src = `${assetBase}/api/course/asset/ronin-tradingview-palette.png`;
}

  function text(node, value) {
    if (node) node.textContent = value ?? '';
  }

  function bool(value) {
    return value === true || value === 1 || value === '1';
  }

  function progressId(row) {
    return row?.lesson_id || row?.lessonId || '';
  }

  function normalizeProgressRow(row = {}, fallbackId = '') {
    const lessonId = progressId(row) || fallbackId;
    return {
      ...row,
      lesson_id: lessonId,
      lessonId,
      status: row.status || 'not_started',
      completed: bool(row.completed),
      practice_completed: bool(row.practice_completed ?? row.practiceCompleted),
      practiceCompleted: bool(row.practiceCompleted ?? row.practice_completed),
      quiz_score: row.quiz_score ?? row.quizScore ?? null,
      quizScore: row.quizScore ?? row.quiz_score ?? null,
      notes: row.notes || '',
      reflection: row.reflection || '',
      time_spent_seconds: Number(row.time_spent_seconds ?? row.timeSpentSeconds ?? 0),
      timeSpentSeconds: Number(row.timeSpentSeconds ?? row.time_spent_seconds ?? 0),
      updated_at: row.updated_at ?? row.updatedAt ?? null,
      updatedAt: row.updatedAt ?? row.updated_at ?? null
    };
  }

  function normalizeProgress(rows = []) {
    state.progress.clear();
    rows.forEach((row) => {
      const normalized = normalizeProgressRow(row);
      if (normalized.lesson_id) state.progress.set(normalized.lesson_id, normalized);
    });
  }

  function requestedView() {
    const view = new URL(window.location.href).searchParams.get('tab');
    return ['course', 'tradingview', 'discord'].includes(view) ? view : 'course';
  }

  function updateViewUrl(view) {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', view);
    if (view !== 'course') url.hash = '';
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function showView(view, { updateUrl = true, scroll = true } = {}) {
    const valid = ['course', 'tradingview', 'discord'].includes(view) ? view : 'course';
    state.currentView = valid;
    els.viewPanels.forEach((panel) => { panel.hidden = panel.dataset.viewPanel !== valid; });
    els.tabButtons.forEach((button) => {
      const active = button.dataset.viewTab === valid;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
    if (updateUrl) updateViewUrl(valid);
    if (valid === 'discord' && !state.discordLoaded) loadDiscordStatus();
    document.title = {
      course: 'Ronin Academy — Ronin Trading System',
      tradingview: 'TradingView Setup — Ronin Academy',
      discord: 'Discord Community — Ronin Academy'
    }[valid];
    if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showError(message, status = 500, code = '') {
    els.loading.hidden = true;
    els.tabs.hidden = true;
    els.masteryDashboard.hidden = true;
    els.lesson.hidden = true;
    els.viewPanels.forEach((panel) => { panel.hidden = true; });
    els.error.hidden = false;
    text(els.errorMessage, message);

    if (status === 401) {
      text(els.errorTitle, 'Log in to continue');
      text(els.errorPrimaryAction, 'Log in');
      els.errorPrimaryAction.href = `/login.html?return=${encodeURIComponent('/academy.html')}`;
      text(els.errorSecondaryAction, 'View the course');
      els.errorSecondaryAction.href = '/ronin-trading-system.html';
      return;
    }
    if (status === 403 || code === 'COURSE_LOCKED') {
      text(els.errorTitle, 'Course access is locked');
      text(els.errorPrimaryAction, 'Unlock the system');
      els.errorPrimaryAction.href = '/ronin-trading-system.html#join';
      text(els.errorSecondaryAction, 'Log in with another account');
      els.errorSecondaryAction.href = `/login.html?return=${encodeURIComponent('/academy.html')}`;
      return;
    }
    text(els.errorTitle, code === 'API_UNREACHABLE' ? 'Course server unavailable' : 'The course could not load');
    text(els.errorPrimaryAction, 'Run health check');
    els.errorPrimaryAction.href = '/api/health';
    text(els.errorSecondaryAction, 'Return to course overview');
    els.errorSecondaryAction.href = '/ronin-trading-system.html';
  }

  function allLessons() {
    if (!state.outline?.modules) return [];
    return state.outline.modules.flatMap((module) =>
      module.lessons.map((lesson) => ({ ...lesson, module }))
    );
  }

  function moduleById(id) {
    return state.outline?.modules.find((module) => module.id === id) || null;
  }

  function levelById(id) {
    return state.outline?.levels.find((level) => level.id === id) || null;
  }

  function levelState(id) {
    return state.mastery?.levels?.[id] || levelById(id)?.state || null;
  }

  function lessonAccessible(lesson) {
    return Boolean(levelState(lesson.module?.levelId || lesson.levelId)?.unlocked);
  }

  function coreLessonIds() {
    const coreLevels = new Set(['beginner', 'intermediate', 'advanced']);
    return allLessons().filter((lesson) => coreLevels.has(lesson.module.levelId)).map((lesson) => lesson.id);
  }

  function moduleProgress(module) {
    const complete = module.lessons.filter((lesson) => state.progress.get(lesson.id)?.completed).length;
    return { complete, total: module.lessons.length, percent: module.lessons.length ? Math.round((complete / module.lessons.length) * 100) : 0 };
  }

  function levelStatusText(level) {
    const ls = levelState(level.id);
    if (!ls?.unlocked) return 'Locked';
    if (ls.passed) return level.id === 'advanced' ? 'Certified' : 'Passed';
    if (ls.percent > 0) return 'In progress';
    return level.id === 'resources' ? 'Available after mastery' : 'Ready';
  }

  function applyMastery(mastery) {
    if (!mastery) return;
    state.mastery = mastery;
    if (state.outline?.levels) {
      state.outline.levels = state.outline.levels.map((level) => ({
        ...level,
        state: mastery.levels?.[level.id] || level.state
      }));
    }
    renderMasteryDashboard();
    renderOutline();
    updateProgressUI();
    if (state.current?.lesson) {
      setActiveLesson(state.current.lesson.id, state.current.lesson.moduleId);
      updateCurrentLevelCard(state.current.lesson.levelId);
    }
  }

  function updateProgressUI() {
    const ids = coreLessonIds();
    const completed = ids.filter((id) => state.progress.get(id)?.completed).length;
    const total = ids.length;
    const percent = state.mastery?.overall?.percent ?? (total ? Math.round((completed / total) * 100) : 0);
    text(els.completedCount, completed);
    text(els.totalCount, total);
    if (els.progressBar) els.progressBar.style.width = `${percent}%`;

    state.lessonButtons.forEach((button, lessonId) => {
      const row = state.progress.get(lessonId);
      button.classList.toggle('is-complete', Boolean(row?.completed));
      button.classList.toggle('is-in-progress', Boolean(row && !row.completed));
      const status = button.querySelector('[data-lesson-nav-status]');
      if (status) status.textContent = row?.completed ? '✓' : button.disabled ? '⌁' : row ? '•' : '';
    });

    state.moduleGroups.forEach((group, moduleId) => {
      const module = moduleById(moduleId);
      if (!module) return;
      const summary = group.querySelector('[data-module-progress]');
      const p = moduleProgress(module);
      if (summary) summary.textContent = `${p.complete}/${p.total}`;
      group.classList.toggle('is-complete', p.complete === p.total && p.total > 0);
    });
  }


  function rewriteAssetUrls(html) {
  const base =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
      ? 'http://localhost:3000'
      : '';

  return html
    .replace(/src="\/api\/course\/asset\//g, `src="${base}/api/course/asset/`)
    .replace(/href="\/api\/course\/asset\//g, `href="${base}/api/course/asset/`);
}
  function renderMasteryDashboard() {
    if (!state.outline || !state.mastery) return;
    const overall = state.mastery.overall || {};
    text(els.overallPercent, `${overall.percent || 0}%`);
    if (els.overallBar) els.overallBar.style.width = `${overall.percent || 0}%`;
    text(els.certificationStatus, overall.certified
      ? 'Ronin core mastery completed'
      : `${overall.completedLessons || 0} of ${overall.totalLessons || 0} core lessons mastered`);

    els.levelGrid.replaceChildren();
    state.outline.levels.forEach((level) => {
      const ls = levelState(level.id) || {};
      const card = document.createElement('article');
      card.className = 'mastery-level-card';
      card.classList.toggle('is-locked', !ls.unlocked);
      card.classList.toggle('is-passed', Boolean(ls.passed));
      card.dataset.levelId = level.id;

      const badge = document.createElement('span');
      badge.className = 'mastery-level-badge';
      badge.textContent = ls.passed ? '✓' : !ls.unlocked ? '⌁' : String(level.order).padStart(2, '0');

      const copy = document.createElement('div');
      const label = document.createElement('p');
      label.textContent = level.shortTitle || level.title;
      const heading = document.createElement('h2');
      heading.textContent = level.title;
      const description = document.createElement('span');
      description.textContent = level.description;
      copy.append(label, heading, description);

      const meter = document.createElement('div');
      meter.className = 'mastery-level-progress';
      const bar = document.createElement('i');
      bar.style.width = `${ls.percent || 0}%`;
      meter.appendChild(bar);

      const footer = document.createElement('div');
      footer.className = 'mastery-level-footer';
      const progress = document.createElement('strong');
      progress.textContent = `${ls.completedLessons || 0}/${ls.totalLessons || 0} lessons`;
      const status = document.createElement('span');
      status.textContent = levelStatusText(level);
      footer.append(progress, status);

      card.append(badge, copy, meter, footer);
      if (ls.unlocked) {
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.addEventListener('click', () => openFirstLessonInLevel(level.id));
        card.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openFirstLessonInLevel(level.id);
          }
        });
      }
      els.levelGrid.appendChild(card);
    });

    els.masteryDashboard.hidden = false;
  }

  function firstIncompleteLessonInLevel(levelId) {
    const lessons = allLessons().filter((lesson) => lesson.module.levelId === levelId && lessonAccessible(lesson));
    return lessons.find((lesson) => !state.progress.get(lesson.id)?.completed) || lessons[0] || null;
  }

  function openFirstLessonInLevel(levelId) {
    const lesson = firstIncompleteLessonInLevel(levelId);
    if (lesson) loadLesson(lesson.id);
  }

  function createModuleNav(module) {
    const ls = levelState(module.levelId) || {};
    const group = document.createElement('section');
    group.className = 'module-group';
    group.dataset.moduleId = module.id;
    group.classList.toggle('is-locked', !ls.unlocked);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'module-toggle';
    toggle.disabled = !ls.unlocked;
    toggle.innerHTML = `
      <span class="module-number">${module.number}</span>
      <span class="module-toggle-copy"><strong></strong><small></small></span>
      <span class="module-progress-count" data-module-progress>0/${module.lessons.length}</span>
      <span class="module-chevron">›</span>`;
    toggle.querySelector('strong').textContent = module.title;
    toggle.querySelector('small').textContent = module.description;
    toggle.addEventListener('click', () => group.classList.toggle('is-open'));

    const list = document.createElement('div');
    list.className = 'lesson-list';
    module.lessons.forEach((lesson) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lesson-link';
      button.disabled = !ls.unlocked;
      button.title = ls.unlocked ? lesson.summary : `Complete the previous mastery level to unlock ${module.title}.`;

      const status = document.createElement('span');
      status.className = 'lesson-nav-status';
      status.dataset.lessonNavStatus = '';
      const copy = document.createElement('span');
      copy.className = 'lesson-nav-copy';
      const title = document.createElement('strong');
      title.textContent = lesson.title;
      const meta = document.createElement('small');
      const type = lesson.isCheckpoint ? 'Milestone' : lesson.lessonType === 'psychology' ? 'Psychology' : lesson.hasQuiz ? 'Quiz' : 'Lesson';
      meta.textContent = `${type} · ${lesson.duration}`;
      copy.append(title, meta);
      button.append(status, copy);
      if (ls.unlocked) button.addEventListener('click', () => loadLesson(lesson.id));
      state.lessonButtons.set(lesson.id, button);
      list.appendChild(button);
    });

    group.append(toggle, list);
    state.moduleGroups.set(module.id, group);
    return group;
  }

  function createLevelNav(level) {
    const wrapper = document.createElement('section');
    wrapper.className = 'level-nav-group';
    const ls = levelState(level.id) || {};
    wrapper.classList.toggle('is-locked', !ls.unlocked);

    const heading = document.createElement('div');
    heading.className = 'level-nav-heading';
    const seal = document.createElement('span');
    seal.textContent = ls.passed ? '✓' : !ls.unlocked ? '⌁' : String(level.order).padStart(2, '0');
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = level.shortTitle || level.title;
    const status = document.createElement('small');
    status.textContent = `${ls.percent || 0}% · ${levelStatusText(level)}`;
    copy.append(title, status);
    heading.append(seal, copy);
    wrapper.appendChild(heading);

    level.moduleIds.forEach((moduleId) => {
      const module = moduleById(moduleId);
      if (module) wrapper.appendChild(createModuleNav(module));
    });
    return wrapper;
  }

  function renderOutline() {
    if (!state.outline) return;
    els.nav.replaceChildren();
    state.lessonButtons.clear();
    state.moduleGroups.clear();
    state.outline.levels.forEach((level) => els.nav.appendChild(createLevelNav(level)));
    text(els.courseVersion, `Version ${state.outline.course.version}`);
    if (els.search) els.search.placeholder = `Search all ${state.outline.course.lessonCount} lessons…`;
    updateProgressUI();
  }

  function setActiveLesson(lessonId, moduleId) {
    state.lessonButtons.forEach((button, id) => button.classList.toggle('is-active', id === lessonId));
    const group = state.moduleGroups.get(moduleId);
    group?.classList.add('is-open');
    state.lessonButtons.get(lessonId)?.scrollIntoView({ block: 'nearest' });
  }

  function lessonHash(lessonId) {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', 'course');
    url.hash = `lesson=${encodeURIComponent(lessonId)}`;
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function getLessonFromHash() {
    const match = window.location.hash.match(/lesson=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function renderModuleObjectives(module) {
    text(els.moduleObjectivesTitle, `Module ${module.number} · ${module.title}`);
    els.moduleObjectives.replaceChildren();
    (module.objectives || []).forEach((objective) => {
      const li = document.createElement('li');
      li.textContent = objective;
      els.moduleObjectives.appendChild(li);
    });
    els.moduleObjectivesCard.hidden = !(module.objectives || []).length;
  }

  function quizHeading(lesson) {
    if (lesson.id === '14-05-final-mastery') return { label: 'Final certification', title: 'Ronin Mastery Assessment' };
    if (lesson.isCheckpoint) return { label: 'Level checkpoint', title: 'Mastery Milestone' };
    return { label: 'Module checkpoint', title: 'Knowledge Quiz' };
  }

  function renderQuiz(questions, lesson) {
    els.quizForm.replaceChildren();
    els.quizResult.hidden = true;
    els.quizResult.className = 'quiz-result';
    els.quizResult.replaceChildren();

    if (!questions?.length) {
      els.quizSection.hidden = true;
      return;
    }
    const heading = quizHeading(lesson);
    text(els.quizLabel, heading.label);
    text(els.quizTitle, heading.title);
    text(els.quizRequirement, `Required score: ${lesson.requiredScore || 80}%. Complete the practice before the assessment can complete this lesson.`);
    els.quizSection.hidden = false;

    questions.forEach((item, questionIndex) => {
      const fieldset = document.createElement('fieldset');
      fieldset.className = 'quiz-question';
      const legend = document.createElement('legend');
      legend.textContent = `${questionIndex + 1}. ${item.question}`;
      fieldset.appendChild(legend);
      item.options.forEach((option, optionIndex) => {
        const label = document.createElement('label');
        label.className = 'quiz-option';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = `question-${questionIndex}`;
        input.value = String(optionIndex);
        const span = document.createElement('span');
        span.textContent = option;
        label.append(input, span);
        fieldset.appendChild(label);
      });
      els.quizForm.appendChild(fieldset);
    });

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'quiz-submit';
    submit.textContent = 'Submit assessment';
    els.quizForm.appendChild(submit);
  }

  function renderQuizResult(payload) {
    els.quizResult.hidden = false;
    els.quizResult.className = `quiz-result ${payload.passed ? 'is-pass' : 'is-fail'}`;
    els.quizResult.replaceChildren();

    const heading = document.createElement('h3');
    heading.textContent = payload.passed
      ? `Passed — ${payload.score}%`
      : `Review and try again — ${payload.score}%`;
    const summary = document.createElement('p');
    summary.textContent = `${payload.correct} of ${payload.total} answers were correct. Required: ${payload.requiredScore || 80}%.`;
    els.quizResult.append(heading, summary);

    if (payload.practiceStillRequired) {
      const warning = document.createElement('p');
      warning.className = 'quiz-practice-warning';
      warning.textContent = 'The assessment passed. Complete and save the required practice to finish this lesson.';
      els.quizResult.appendChild(warning);
    }

    (payload.feedback || []).forEach((item) => {
      const feedback = document.createElement('div');
      feedback.className = 'quiz-feedback';
      const title = document.createElement('strong');
      title.textContent = item.isCorrect ? `✓ ${item.question}` : `✕ ${item.question}`;
      const explanation = document.createElement('p');
      explanation.textContent = item.explanation;
      feedback.append(title, explanation);
      els.quizResult.appendChild(feedback);
    });
  }

  function updateCurrentLevelCard(levelId) {
    const level = levelById(levelId);
    const ls = levelState(levelId) || {};
    if (!level) return;
    text(els.currentLevelLabel, ls.passed ? 'Level completed' : 'Current level');
    text(els.currentLevelTitle, level.title);
    text(els.currentLevelPercent, `${ls.percent || 0}%`);
    if (els.currentLevelBar) els.currentLevelBar.style.width = `${ls.percent || 0}%`;
    text(els.currentLevelMessage, ls.passed
      ? `${level.badge || 'Level'} milestone passed.`
      : !ls.unlocked
        ? 'Complete the previous level to unlock this material.'
        : `${ls.completedLessons || 0} of ${ls.totalLessons || 0} lessons complete${ls.requiredScore ? ` · checkpoint ${ls.requiredScore}% required` : ''}.`);
  }

  function lessonStatusText(progress, lesson) {
    if (progress.completed && lesson.hasQuiz) return 'Mastered';
    if (progress.completed) return 'Completed';
    if (progress.quiz_score != null) return `Quiz ${progress.quiz_score}%`;
    if (progress.practice_completed) return 'Practice saved';
    if (progress.updated_at) return 'In progress';
    return 'Not started';
  }

  function applyLesson(payload) {
    state.current = payload;
    state.lessonOpenedAt = Date.now();
    if (payload.mastery) state.mastery = payload.mastery;
    const { lesson, module } = payload;
    const progress = normalizeProgressRow(payload.progress || {}, lesson.id);
    state.progress.set(lesson.id, progress);

    text(els.breadcrumb, `${lesson.levelTitle} / Module ${lesson.moduleNumber} / ${lesson.moduleTitle}`);
    text(els.module, `Module ${lesson.moduleNumber} · ${lesson.moduleTitle}`);
    text(els.title, lesson.title);
    text(els.summary, lesson.summary);
    text(els.duration, lesson.duration);
    text(els.lessonLevel, lesson.levelTitle);
    text(els.lessonType, lesson.isCheckpoint ? 'Mastery checkpoint' : lesson.lessonType === 'psychology' ? 'Trading psychology' : lesson.hasQuiz ? 'Module assessment' : 'Lesson');
    text(els.lessonStatus, lessonStatusText(progress, lesson));
    els.content.innerHTML = rewriteAssetUrls(lesson.html);
    els.notes.value = progress.notes || '';
    els.reflection.value = progress.reflection || '';
    els.practiceCheckbox.checked = progress.practice_completed;
    els.practiceSection.hidden = !lesson.practiceRequired;
    els.notesStatus.textContent = progress.updated_at ? 'Progress loaded.' : '';
    els.practiceStatus.textContent = progress.practice_completed ? 'Practice saved.' : '';

    const complete = Boolean(progress.completed);
    els.complete.classList.toggle('is-complete', complete);
    els.complete.textContent = complete ? 'Completed ✓' : 'Mark complete';

    els.previous.disabled = !payload.previousLessonId;
    els.next.disabled = !payload.nextLessonId;
    els.previous.dataset.lessonId = payload.previousLessonId || '';
    els.next.dataset.lessonId = payload.nextLessonId || '';

    renderModuleObjectives(module);
    renderQuiz(payload.quiz, lesson);
    setActiveLesson(lesson.id, lesson.moduleId);
    renderMasteryDashboard();
    updateCurrentLevelCard(lesson.levelId);
    updateProgressUI();

    els.loading.hidden = true;
    els.error.hidden = true;
    els.masteryDashboard.hidden = false;
    els.lesson.hidden = false;
    els.sidebar.classList.remove('is-open');
    els.menuButton?.setAttribute('aria-expanded', 'false');
  }

  function showLevelLock(error) {
    showView('course', { updateUrl: true, scroll: true });
    els.loading.hidden = true;
    els.lesson.hidden = true;
    els.masteryDashboard.hidden = false;
    text(els.masteryMessage, error.message || 'Complete the previous mastery level before opening this lesson.');
    els.masteryMessage.classList.add('is-warning');
    window.setTimeout(() => els.masteryMessage.classList.remove('is-warning'), 5000);
  }

 async function loadLesson(lessonId, { switchView = true } = {}) {
  if (!lessonId) return;
  if (switchView) showView('course', { scroll: false });
  els.lesson.hidden = true;
  els.loading.hidden = false;

  try {
    const payload = await api.get(`/course/lesson/${encodeURIComponent(lessonId)}`);
    console.log('Lesson payload:', payload);
    applyLesson(payload);
    lessonHash(lessonId);

    if (switchView) {
      window.scrollTo({
        top: els.masteryDashboard.offsetHeight > 0 ? els.masteryDashboard.offsetHeight - 20 : 0,
        behavior: 'smooth',
      });
    }
  } catch (error) {
    if (error.status === 423 || error.code === 'COURSE_LEVEL_LOCKED') {
      showLevelLock(error);
    } else {
      const err = error || {};
showError(err.message || 'The course could not load.', err.status ?? 500, err.code || '');
    }
  }
}

  function elapsedSeconds() {
    if (!state.lessonOpenedAt) return 0;
    return Math.max(0, Math.round((Date.now() - state.lessonOpenedAt) / 1000));
  }

  async function saveCurrentProgress(overrides = {}) {
    if (!state.current) return null;
    const lessonId = state.current.lesson.id;
    const existing = state.progress.get(lessonId) || normalizeProgressRow({}, lessonId);
    const completed = overrides.completed ?? existing.completed;
    const practiceCompleted = overrides.practiceCompleted ?? els.practiceCheckbox.checked;
  const payload = await api.post('/course/progress', {
  lessonId,
  completed,
  practiceCompleted,
  notes: els.notes.value,
  reflection: els.reflection.value,
  timeSpentSeconds: existing.time_spent_seconds + elapsedSeconds()
});

    const progress = normalizeProgressRow(payload.progress || {}, lessonId);
    state.progress.set(lessonId, progress);
    state.current.progress = progress;
    state.lessonOpenedAt = Date.now();
    if (payload.mastery) applyMastery(payload.mastery);
    else updateProgressUI();
    text(els.lessonStatus, lessonStatusText(progress, state.current.lesson));
    return progress;
  }

  function discordStatusLabel(status) {
    const labels = {
      active: 'Active',
      pending_screening: 'Pending Discord screening',
      left_server: 'Left the server',
      access_revoked: 'Premium access revoked',
      revoked: 'Role revoked',
      role_removal_failed: 'Role removal needs review',
      configuration_required: 'Server configuration required'
    };
    return labels[status] || status || 'Not connected';
  }

  function renderDiscordStatus(payload) {
    state.discord = payload;
    state.discordLoaded = true;
    const connection = payload.connection;
    const configured = Boolean(payload.configured);

    els.discordConnect.hidden = false;
    els.discordConnect.disabled = !configured;
    els.discordSync.hidden = true;
    els.discordOpen.hidden = true;
    els.discordDisconnect.hidden = true;
    els.discordDetails.hidden = true;

    if (!configured) {
      text(els.discordTitle, 'Discord connection is not configured');
      text(els.discordMessage, 'Premium Discord is included, but the developer must add the Discord application, bot, server, and role environment variables before this button can work.');
      text(els.discordConnect, 'Discord setup pending');
      return;
    }
    if (!connection) {
      text(els.discordTitle, 'Ready to connect');
      text(els.discordMessage, `Link your Discord account to join ${payload.communityName || 'the private Ronin community'} and receive the premium role.`);
      text(els.discordConnect, 'Connect Discord');
      return;
    }

    const displayName = connection.globalName || connection.global_name || connection.username || 'Connected member';
    text(els.discordUser, `${displayName} (@${connection.username || 'discord'})`);
    text(els.discordRole, connection.roleGrantedAt || connection.role_granted_at ? 'Ronin Premium assigned' : 'Needs synchronization');
    text(els.discordState, discordStatusLabel(connection.status));
    els.discordDetails.hidden = false;
    els.discordDisconnect.hidden = false;

    if (['left_server', 'access_revoked', 'revoked'].includes(connection.status)) {
      text(els.discordTitle, 'Reconnect to restore access');
      text(els.discordMessage, 'Your account link is recorded, but the Discord membership or premium role is no longer active. Connect again with the correct Discord account.');
      text(els.discordConnect, 'Reconnect Discord');
      return;
    }

    els.discordConnect.hidden = true;
    els.discordSync.hidden = false;
    if (payload.inviteUrl) {
      els.discordOpen.href = payload.inviteUrl;
      els.discordOpen.hidden = false;
    }
    if (connection.status === 'pending_screening') {
      text(els.discordTitle, 'Complete Discord membership screening');
      text(els.discordMessage, 'The account and premium role are connected. Open Discord, accept the server rules, and then select Sync Premium Role.');
    } else {
      text(els.discordTitle, 'Premium Discord connected');
      text(els.discordMessage, `Your Ronin Charts account is linked to ${displayName}. Use the community for chart study, course questions, and process review—not signals.`);
    }
  }

  async function loadDiscordStatus({ force = false } = {}) {
    if (state.discordLoaded && !force) return;
    text(els.discordTitle, 'Checking Discord access…');
    text(els.discordMessage, 'The Academy is checking whether your Discord account is linked.');
    try {
      renderDiscordStatus(await fetchJson('/api/discord/status'));
    } catch (error) {
      state.discordLoaded = true;
      text(els.discordTitle, 'Discord status unavailable');
      text(els.discordMessage, error.message);
      els.discordConnect.disabled = true;
    }
  }

  async function discordPost(endpoint, busyLabel) {
    const button = endpoint.endsWith('connect') ? els.discordConnect : endpoint.endsWith('sync') ? els.discordSync : els.discordDisconnect;
    const original = button?.textContent;
    if (button) { button.disabled = true; button.textContent = busyLabel; }
    text(els.discordFeedback, '');
    try {
     const payload = await fetchJson(endpoint, {
  method: 'POST',
  body: JSON.stringify({})
});
      if (payload.url) return window.location.assign(payload.url);
      text(els.discordFeedback, payload.message || payload.warning || 'Discord account updated.');
      state.discordLoaded = false;
      await loadDiscordStatus({ force: true });
    } catch (error) {
      text(els.discordFeedback, error.message);
      if (error.payload?.connection) renderDiscordStatus({ ...state.discord, connection: error.payload.connection });
    } finally {
      if (button && original) { button.disabled = false; button.textContent = original; }
    }
  }

  async function copyColor(value) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    text(els.copyStatus, `${value} copied.`);
  }

  async function initialize() {
    try {
      const user = await authManager.checkAuth();
if (!user) return showError('Log in with the account that purchased the Ronin Trading System.', 401);

state.user = user;
text(els.userName, user.displayName || user.display_name || user.email);
text(els.userInitial, (user.displayName || user.display_name || user.email || 'R').charAt(0).toUpperCase());


      const outline = await api.get('/course/outline');
      state.outline = outline;
      state.mastery = outline.mastery;
      state.resumeLessonId = outline.resumeLessonId;
      normalizeProgress(outline.progress || []);
      renderMasteryDashboard();
      renderOutline();
      els.tabs.hidden = false;
      els.loading.hidden = true;
      els.error.hidden = true;
      els.masteryDashboard.hidden = false;

      const view = requestedView();
      showView(view, { updateUrl: false, scroll: false });
      const requestedLesson = getLessonFromHash();
      const requested = allLessons().find((lesson) => lesson.id === requestedLesson && lessonAccessible(lesson));
      const resume = allLessons().find((lesson) => lesson.id === outline.resumeLessonId && lessonAccessible(lesson));
      const first = firstIncompleteLessonInLevel('beginner') || allLessons().find(lessonAccessible);
      if (view === 'course') await loadLesson((requested || resume || first)?.id, { switchView: false });

      const params = new URL(window.location.href).searchParams;
      if (params.get('message')) text(els.discordFeedback, params.get('message'));
      if (view === 'discord') await loadDiscordStatus({ force: true });
   } catch (error) {
  const err = error || {};
  showError(err.message || 'The course could not load.', err.status, err.code);
}
  }

  els.menuButton?.addEventListener('click', () => {
    const open = els.menuButton.getAttribute('aria-expanded') === 'true';
    els.menuButton.setAttribute('aria-expanded', String(!open));
    els.sidebar.classList.toggle('is-open', !open);
  });

  els.userButton?.addEventListener('click', () => {
    const open = !els.userMenu.hidden;
    els.userMenu.hidden = open;
    els.userButton.setAttribute('aria-expanded', String(!open));
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.academy-user')) {
      els.userMenu.hidden = true;
      els.userButton?.setAttribute('aria-expanded', 'false');
    }
    if (!event.target.closest('.academy-search-wrap')) els.searchResults.hidden = true;
  });

  els.tabButtons.forEach((button) => button.addEventListener('click', () => showView(button.dataset.viewTab)));
  els.openViewButtons.forEach((button) => button.addEventListener('click', () => {
    els.userMenu.hidden = true;
    showView(button.dataset.openView);
  }));
  els.openLessonButtons.forEach((button) => button.addEventListener('click', () => loadLesson(button.dataset.openLesson)));
  els.copyColorButtons.forEach((button) => button.addEventListener('click', () => copyColor(button.dataset.copyColor)));

  els.resumeCourse?.addEventListener('click', () => {
    const resume = allLessons().find((lesson) => lesson.id === state.resumeLessonId && lessonAccessible(lesson));
    const current = state.current?.lesson ? allLessons().find((lesson) => lesson.id === state.current.lesson.id) : null;
    const first = firstIncompleteLessonInLevel('beginner') || allLessons().find(lessonAccessible);
    loadLesson((current || resume || first)?.id);
  });

  els.search?.addEventListener('input', () => {
    const query = els.search.value.trim().toLowerCase();
    els.searchResults.replaceChildren();
    if (query.length < 2) { els.searchResults.hidden = true; return; }

    const matches = allLessons().filter((lesson) =>
      `${lesson.title} ${lesson.summary} ${lesson.module.title} ${(lesson.module.objectives || []).join(' ')}`.toLowerCase().includes(query)
    ).slice(0, 12);

    matches.forEach((lesson) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.disabled = !lessonAccessible(lesson);
      const title = document.createElement('strong');
      title.textContent = lesson.title;
      const meta = document.createElement('span');
      meta.textContent = `${levelById(lesson.module.levelId)?.shortTitle || lesson.module.levelId} · Module ${lesson.module.number}${button.disabled ? ' · Locked' : ''}`;
      button.append(title, meta);
      if (!button.disabled) button.addEventListener('click', () => {
        els.search.value = '';
        els.searchResults.hidden = true;
        loadLesson(lesson.id);
      });
      els.searchResults.appendChild(button);
    });

    if (!matches.length) {
      const empty = document.createElement('button');
      empty.type = 'button';
      empty.disabled = true;
      empty.textContent = 'No matching lessons.';
      els.searchResults.appendChild(empty);
    }
    els.searchResults.hidden = false;
  });

 els.complete?.addEventListener('click', async () => {
  if (!state.current) return;

  const lesson = state.current.lesson;
  const existing = state.progress.get(lesson.id) || {};
  const practiceDone = Boolean(existing.practice_completed || existing.practiceCompleted);
  const quizScore = Number(existing.quiz_score ?? existing.quizScore ?? -1);
  const quizPassed = !lesson.hasQuiz || quizScore >= Number(lesson.requiredScore || 80);

  if (lesson.practiceRequired && !practiceDone) {
    els.practiceSection?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    els.practiceCheckbox?.focus();
    els.practiceStatus.textContent = 'Please complete the practice first.';
    els.notesStatus.textContent = 'Practice is required before marking this lesson complete.';
    return;
  }

  if (lesson.hasQuiz && !quizPassed) {
    els.quizSection?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    els.quizResult?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    els.notesStatus.textContent = 'Pass the quiz before marking this lesson complete.';
    return;
  }

  const nextCompleted = !Boolean(existing.completed);
  els.complete.disabled = true;
  els.notesStatus.textContent = nextCompleted
    ? 'Checking completion requirements…'
    : 'Updating progress…';

  try {
    const progress = await saveCurrentProgress({ completed: nextCompleted });
    els.complete.classList.toggle('is-complete', progress.completed);
    els.complete.textContent = progress.completed ? 'Completed ✓' : 'Mark complete';
    els.notesStatus.textContent = progress.completed
      ? 'Lesson completed.'
      : 'Lesson returned to in progress.';
  } catch (error) {
    els.notesStatus.textContent = error.message;
  } finally {
    els.complete.disabled = false;
  }
});

  els.saveNotes?.addEventListener('click', async () => {
    els.saveNotes.disabled = true;
    els.notesStatus.textContent = 'Saving…';
    try {
      await saveCurrentProgress();
      els.notesStatus.textContent = 'Notes saved.';
    } catch (error) {
      els.notesStatus.textContent = error.message;
    } finally {
      els.saveNotes.disabled = false;
    }
  });

  els.savePractice?.addEventListener('click', async () => {
    els.savePractice.disabled = true;
    els.practiceStatus.textContent = 'Saving…';
    try {
      const currentProgress = state.progress.get(state.current?.lesson?.id) || {};
      const quizPassed = state.current?.lesson?.hasQuiz && Number(currentProgress.quiz_score ?? currentProgress.quizScore ?? -1) >= Number(state.current.lesson.requiredScore || 80);
      const progress = await saveCurrentProgress({
        practiceCompleted: els.practiceCheckbox.checked,
        completed: Boolean(els.practiceCheckbox.checked && quizPassed) || Boolean(currentProgress.completed)
      });
      els.practiceStatus.textContent = progress.practice_completed
        ? 'Practice and reflection saved.'
        : 'Reflection saved. Check the practice confirmation when the exercise is complete.';
    } catch (error) {
      els.practiceStatus.textContent = error.message;
    } finally {
      els.savePractice.disabled = false;
    }
  });

  els.quizForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.current?.quiz) return;
    const answers = state.current.quiz.map((_, index) => {
      const selected = els.quizForm.querySelector(`input[name="question-${index}"]:checked`);
      return selected ? Number(selected.value) : -1;
    });
    if (answers.some((answer) => answer < 0)) {
      els.quizResult.hidden = false;
      els.quizResult.className = 'quiz-result is-fail';
      els.quizResult.textContent = 'Answer every question before submitting the assessment.';
      return;
    }

    const submit = els.quizForm.querySelector('.quiz-submit');
    submit.disabled = true;
    submit.textContent = 'Checking answers…';
    try {
   const payload = await api.post(`/course/quiz/${encodeURIComponent(state.current.lesson.id)}`, {
  answers
});
      const progress = normalizeProgressRow(payload.progress || {}, state.current.lesson.id);
      state.progress.set(state.current.lesson.id, progress);
      state.current.progress = progress;
      renderQuizResult(payload);
      if (payload.mastery) applyMastery(payload.mastery);
      if (payload.passed && !payload.practiceStillRequired) {
        els.complete.classList.add('is-complete');
        els.complete.textContent = 'Completed ✓';
      }
      text(els.lessonStatus, lessonStatusText(progress, state.current.lesson));
    } catch (error) {
      els.quizResult.hidden = false;
      els.quizResult.className = 'quiz-result is-fail';
      els.quizResult.textContent = error.message;
    } finally {
      submit.disabled = false;
      submit.textContent = 'Submit assessment';
    }
  });

  els.previous?.addEventListener('click', () => loadLesson(els.previous.dataset.lessonId));
  els.next?.addEventListener('click', () => loadLesson(els.next.dataset.lessonId));
  els.discordConnect?.addEventListener('click', () => discordPost('/api/discord/connect', 'Opening Discord…'));
  els.discordSync?.addEventListener('click', () => discordPost('/api/discord/sync', 'Synchronizing…'));
  els.discordDisconnect?.addEventListener('click', () => discordPost('/api/discord/disconnect', 'Disconnecting…'));

 els.logout?.addEventListener('click', async () => {
  try {
    await authManager.logout();
    window.location.assign('/');
  } catch (error) {
    window.alert(error.message);
  }
});

  window.addEventListener('hashchange', () => {
    const lessonId = getLessonFromHash();
    if (lessonId && lessonId !== state.current?.lesson?.id) loadLesson(lessonId);
  });

  if (window.location.protocol === 'file:') {
    showError('The Academy must be opened through the deployed Ronin server. Use npm run dev locally and open the HTTP address shown in the terminal.', 0, 'API_UNREACHABLE');
  } else {
    initialize();
  }
})();
