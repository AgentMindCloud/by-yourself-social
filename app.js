/* by-yourself-social
   Pure client-side anti-social media
   Data never leaves the browser.
*/

(function () {
  'use strict';

  // ---------- Constants ----------
  const STORAGE = {
    posts: 'bys_posts',
    settings: 'bys_settings',
    stats: 'bys_stats',
    session: 'bys_session'
  };

  const DEFAULT_SETTINGS = {
    dailyLimit: 3,
    sessionMinutes: 10,
    lastPostDate: null,
    postsToday: 0
  };

  const REFLECTION_PROMPTS = [
    'What would you say if no one could ever reply?',
    'Is this thought for now, or for a future version of you?',
    'What are you avoiding by writing this?',
    'Can this stay between you and the quiet?',
    'Would this still matter if it stayed private forever?',
    'What does this silence need from you right now?'
  ];

  // ---------- State ----------
  let posts = [];
  let settings = { ...DEFAULT_SETTINGS };
  let stats = {
    totalPosts: 0,
    firstUse: null,
    daysActive: 0,
    solitudeStreak: 0,
    totalPeaceMinutes: 0,
    lastActiveDate: null
  };
  let sessionStart = null;
  let timerInterval = null;
  let writingStart = null;

  // ---------- DOM ----------
  const $ = (sel) => document.querySelector(sel);
  const feedEl = $('#feed');
  const emptyEl = $('#empty-state');
  const timerBar = $('#timer-bar');
  const timerProgress = $('#timer-progress');
  const timerText = $('#timer-text');
  const limitNote = $('#limit-note');
  const composerModal = $('#composer-modal');
  const statsModal = $('#stats-modal');
  const aboutModal = $('#about-modal');
  const logoffOverlay = $('#logoff-overlay');
  const contentInput = $('#post-content');
  const moodSelect = $('#post-mood');
  const capsuleSelect = $('#post-capsule');
  const reflectionPrompt = $('#reflection-prompt');
  const capsuleHelper = $('#capsule-helper');

  // ---------- Storage helpers ----------
  function load() {
    try {
      posts = JSON.parse(localStorage.getItem(STORAGE.posts) || '[]');
      settings = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(STORAGE.settings) || '{}') };
      stats = { ...stats, ...JSON.parse(localStorage.getItem(STORAGE.stats) || '{}') };
      const savedSession = localStorage.getItem(STORAGE.session);
      if (savedSession) sessionStart = parseInt(savedSession, 10);
    } catch (e) {
      console.warn('Storage load failed', e);
      posts = [];
    }
  }

  function savePosts() {
    localStorage.setItem(STORAGE.posts, JSON.stringify(posts));
  }
  function saveSettings() {
    localStorage.setItem(STORAGE.settings, JSON.stringify(settings));
  }
  function saveStats() {
    localStorage.setItem(STORAGE.stats, JSON.stringify(stats));
  }

  // ---------- Utils ----------
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function isRevealed(post) {
    if (!post.revealAt) return true;
    return new Date(post.revealAt) <= new Date();
  }

  function resetDailyIfNeeded() {
    const today = todayStr();
    if (settings.lastPostDate !== today) {
      settings.postsToday = 0;
      settings.lastPostDate = today;
      saveSettings();
    }
  }

  function canPost() {
    resetDailyIfNeeded();
    return settings.postsToday < settings.dailyLimit;
  }

  function updateLimitNote() {
    resetDailyIfNeeded();
    const remaining = settings.dailyLimit - settings.postsToday;
    if (remaining <= 0) {
      limitNote.textContent = "You've already spoken enough today. Silence is also a conversation.";
      $('#btn-whisper').disabled = true;
    } else {
      limitNote.textContent = remaining + ' whisper' + (remaining === 1 ? '' : 's') + ' remaining today.';
      $('#btn-whisper').disabled = false;
    }
  }

  // ---------- Stats ----------
  function recordActivity() {
    const today = todayStr();
    if (!stats.firstUse) stats.firstUse = new Date().toISOString();
    if (stats.lastActiveDate !== today) {
      stats.daysActive = (stats.daysActive || 0) + 1;
      // simple streak: consecutive days
      if (stats.lastActiveDate) {
        const last = new Date(stats.lastActiveDate);
        const diff = (new Date(today) - last) / (1000 * 60 * 60 * 24);
        stats.solitudeStreak = diff === 1 ? (stats.solitudeStreak || 0) + 1 : 1;
      } else {
        stats.solitudeStreak = 1;
      }
      stats.lastActiveDate = today;
    }
    saveStats();
  }

  function renderStats() {
    const grid = $('#stats-grid');
    grid.innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${stats.daysActive || 0}</div>
        <div class="stat-label">Days of Quiet</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.totalPosts || 0}</div>
        <div class="stat-label">Whispers Kept</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.solitudeStreak || 0}</div>
        <div class="stat-label">Solitude Streak</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${Math.round(stats.totalPeaceMinutes || 0)}</div>
        <div class="stat-label">Minutes Reclaimed</div>
      </div>
    `;
  }

  // ---------- Feed ----------
  function renderFeed() {
    const visible = posts
      .filter(isRevealed)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    feedEl.innerHTML = '';
    if (visible.length === 0) {
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;

    visible.forEach((post) => {
      const card = document.createElement('article');
      card.className = 'post-card';
      card.innerHTML = `
        <div class="post-meta">
          <span>${formatDate(post.createdAt)}</span>
          ${post.mood ? `<span class="post-mood">${post.mood}</span>` : ''}
        </div>
        <div class="post-content">${escapeHtml(post.content)}</div>
        <div class="post-depth">Depth ${post.depthScore || 0}</div>
        <div class="post-actions">
          <button class="btn ghost btn-delete" data-id="${post.id}">Delete Forever</button>
        </div>
      `;
      feedEl.appendChild(card);
    });

    // bind deletes
    feedEl.querySelectorAll('.btn-delete').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (confirm('This cannot be undone. The void will forget this whisper.')) {
          posts = posts.filter((p) => p.id !== btn.dataset.id);
          savePosts();
          renderFeed();
        }
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- Composer ----------
  function openComposer() {
    if (!canPost()) {
      alert("You've already spoken enough today. Silence is also a conversation.");
      return;
    }
    reflectionPrompt.textContent = REFLECTION_PROMPTS[Math.floor(Math.random() * REFLECTION_PROMPTS.length)];
    contentInput.value = '';
    moodSelect.value = '';
    capsuleSelect.value = '';
    writingStart = Date.now();
    composerModal.hidden = false;
    contentInput.focus();
  }

  function closeComposer() {
    composerModal.hidden = true;
    writingStart = null;
  }

  function submitPost() {
    const content = contentInput.value.trim();
    if (!content) {
      contentInput.focus();
      return;
    }
    if (!canPost()) {
      closeComposer();
      updateLimitNote();
      return;
    }

    const writingSeconds = writingStart ? Math.round((Date.now() - writingStart) / 1000) : 0;
    const depth = Math.min(100, Math.floor(content.length / 5) + (writingSeconds > 30 ? 20 : 0));

    let revealAt = null;
    const days = parseInt(capsuleSelect.value, 10);
    if (days) {
      const d = new Date();
      d.setDate(d.getDate() + days);
      revealAt = d.toISOString();
    }

    const post = {
      id: uid(),
      content,
      mood: moodSelect.value || null,
      createdAt: new Date().toISOString(),
      revealAt,
      depthScore: depth
    };

    posts.push(post);
    settings.postsToday += 1;
    stats.totalPosts = (stats.totalPosts || 0) + 1;
    recordActivity();
    savePosts();
    saveSettings();
    saveStats();

    closeComposer();
    updateLimitNote();
    renderFeed();

    // subtle confirmation
    const note = document.createElement('p');
    note.className = 'limit-note';
    note.style.color = 'var(--accent)';
    note.textContent = 'Heard by exactly one person. You.';
    $('.composer-trigger').appendChild(note);
    setTimeout(() => note.remove(), 3500);
  }

  // ---------- Session Timer ----------
  function startSession() {
    if (!sessionStart) {
      sessionStart = Date.now();
      localStorage.setItem(STORAGE.session, sessionStart);
    }
    timerBar.hidden = false;
    updateTimer();
    timerInterval = setInterval(updateTimer, 1000);
  }

  function updateTimer() {
    if (!sessionStart) return;
    const elapsedMin = (Date.now() - sessionStart) / 1000 / 60;
    const total = settings.sessionMinutes;
    const pct = Math.min(100, (elapsedMin / total) * 100);
    timerProgress.style.setProperty('--progress', pct + '%');

    const mins = Math.floor(elapsedMin);
    const secs = Math.floor((elapsedMin % 1) * 60);
    timerText.textContent = `Session: ${mins}:${secs.toString().padStart(2, '0')} / ${total} min`;

    if (elapsedMin >= total * 0.8) {
      timerBar.classList.add('warning');
    }
    if (elapsedMin >= total) {
      forceLogOff();
    }

    // accumulate peace minutes roughly
    stats.totalPeaceMinutes = (stats.totalPeaceMinutes || 0) + 1 / 60;
    if (Math.floor(elapsedMin * 60) % 30 === 0) saveStats(); // occasional save
  }

  function forceLogOff() {
    clearInterval(timerInterval);
    logoffOverlay.hidden = false;
  }

  function leave() {
    // try to close, otherwise clear session and show message
    localStorage.removeItem(STORAGE.session);
    sessionStart = null;
    if (window.opener || history.length <= 1) {
      window.close();
    }
    // fallback: still show overlay or navigate away feel
    document.body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0d1117;color:#e6edf3;font-family:system-ui;text-align:center;padding:2rem;">
        <div>
          <h1 style="font-family:Georgia,serif;font-weight:400;margin-bottom:1rem;">You left.</h1>
          <p style="color:#8b949e;">The quiet remains. Touch grass.</p>
          <p style="margin-top:2rem;font-size:0.85rem;color:#8b949e;">Refresh if you truly need to return.</p>
        </div>
      </div>`;
  }

  // ---------- Export / Import / Clear ----------
  function exportData() {
    const data = {
      posts,
      settings,
      stats,
      exportedAt: new Date().toISOString(),
      version: 1
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `by-yourself-social-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (Array.isArray(data.posts)) posts = data.posts;
        if (data.settings) settings = { ...DEFAULT_SETTINGS, ...data.settings };
        if (data.stats) stats = { ...stats, ...data.stats };
        savePosts();
        saveSettings();
        saveStats();
        renderFeed();
        updateLimitNote();
        renderStats();
        alert('Your past self has returned.');
      } catch (err) {
        alert('Could not read that file.');
      }
    };
    reader.readAsText(file);
  }

  function clearAll() {
    if (!confirm('This cannot be undone. The void will be empty again.')) return;
    posts = [];
    settings = { ...DEFAULT_SETTINGS };
    stats = {
      totalPosts: 0,
      firstUse: null,
      daysActive: 0,
      solitudeStreak: 0,
      totalPeaceMinutes: 0,
      lastActiveDate: null
    };
    localStorage.removeItem(STORAGE.posts);
    localStorage.removeItem(STORAGE.settings);
    localStorage.removeItem(STORAGE.stats);
    localStorage.removeItem(STORAGE.session);
    renderFeed();
    updateLimitNote();
    renderStats();
    statsModal.hidden = true;
  }

  // ---------- Events ----------
  function bind() {
    $('#btn-whisper').addEventListener('click', openComposer);
    $('#btn-cancel').addEventListener('click', closeComposer);
    $('#btn-post').addEventListener('click', submitPost);
    $('#btn-stats').addEventListener('click', () => {
      renderStats();
      statsModal.hidden = false;
    });
    $('#btn-close-stats').addEventListener('click', () => (statsModal.hidden = true));
    $('#btn-about').addEventListener('click', () => (aboutModal.hidden = false));
    $('#btn-close-about').addEventListener('click', () => (aboutModal.hidden = true));
    $('#btn-leave').addEventListener('click', leave);
    $('#btn-force-leave').addEventListener('click', leave);
    $('#btn-export').addEventListener('click', exportData);
    $('#btn-clear').addEventListener('click', clearAll);
    $('#btn-import').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', (e) => {
      if (e.target.files[0]) importData(e.target.files[0]);
    });

    // close modals on backdrop click
    [composerModal, statsModal, aboutModal].forEach((m) => {
      m.addEventListener('click', (e) => {
        if (e.target === m) m.hidden = true;
      });
    });

    capsuleSelect.addEventListener('change', () => {
      capsuleHelper.style.opacity = capsuleSelect.value ? '1' : '0.5';
    });
  }

  // ---------- Init ----------
  function init() {
    load();
    recordActivity();
    renderFeed();
    updateLimitNote();
    bind();
    startSession();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
