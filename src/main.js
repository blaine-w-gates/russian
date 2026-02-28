// Genitive Lab — Main Application
import './style.css';
import { seedIfEmpty, getAllWords, getUnsortedWords, getWordsByBucket, markWordSorted, addWords, logException, getStats, exportData, saveWord, getDB, reseedFromSource, getWordSets, deleteWordSet, migrateToLevel2, bulkAction, getYearlyActivity, getStreakStats } from './db.js';
import { ANIMACY_BUCKETS, GENDER_BUCKETS, NUMBER_BUCKETS, getEndingBuckets, validateChoice, shouldSkipStage, isIndeclinable, getSpellingHint, formatBucketPath, STAGE_LABELS_EN } from './bucket-map.js';
import { extractNounsFromText, extractNounsFromImage, getErrorMessage } from './gemini.js';

// ═══════════════════════════════════════════
// GLOBAL STATE & UTILITIES
// ═══════════════════════════════════════════
import { AppState, showToast } from './state.js';
import { renderDashboard, setupDashboardInteractions } from './view-dashboard.js';

// ═══════════════════════════════════════════
// ROUTING
// ═══════════════════════════════════════════
function navigate(page) {
  AppState.currentPage = page;
  location.hash = `#/${page === 'dashboard' ? '' : page}`;
  renderPage();
}

function getPageFromHash() {
  const hash = location.hash.slice(2) || '';
  return hash || 'dashboard';
}

// ═══════════════════════════════════════════
// PAGE RENDERING & VIEW LIFECYCLE
// ═══════════════════════════════════════════
let currentTeardown = null;

export function setTeardown(fn) {
  currentTeardown = fn;
}

export async function renderPage() {
  const page = AppState.currentPage;
  const main = document.getElementById('main-content');

  // Execute and clear previous teardown functions to prevent ghost listeners
  if (currentTeardown && typeof currentTeardown === 'function') {
    currentTeardown();
    currentTeardown = null;
  }

  // Update nav active states (Global Nav)
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('nav-item--active', el.dataset.page === page);
  });

  switch (page) {
    case 'dashboard': main.innerHTML = await renderDashboard(); setupDashboardInteractions(); break;
    case 'words': main.innerHTML = await renderWordList(); setupWordList(); break;
    case 'reference': main.innerHTML = renderReference(); setupReference(); break;
    case 'settings': main.innerHTML = await renderSettings(); setupSettings(); break;
    case 'drill':
      // Logic handled strictly by view-drill.js, which assigns the teardown natively
      break;
    default: main.innerHTML = await renderDashboard(); setupDashboardInteractions(); break;
  }
}

// ═══════════════════════════════════════════
// API KEY MODAL
// ═══════════════════════════════════════════
export function showApiKeyModal(retryCallback = null) {
  let overlay = document.getElementById('api-modal-overlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'api-modal-overlay';
    overlay.className = 'modal-overlay modal-overlay--active';
    overlay.innerHTML = `
          <div class="modal modal--light">
            <button class="modal__close" id="api-modal-close">✕</button>
            <h2 class="modal__title">Switch Out Your API Key</h2>
            <input type="password" id="api-modal-input" class="text-input text-input--light" style="width: 100%; margin-bottom: 24px;" placeholder="AIzaSy...">
              <button class="btn btn--dark btn--full" id="api-modal-save" style="margin-bottom: 16px;">Save Key</button>
              <p style="text-align: center; color: #666; font-size: 0.9rem;">
                Get a key from <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color: #4285f4; text-decoration: underline;">Google AI Studio</a>
              </p>
              <div class="modal__divider"></div>
              <button class="btn btn--outline btn--full" id="api-modal-disconnect">
                <span style="margin-right: 8px;">↪</span> Disconnect Session
              </button>
          </div>
          `;
    document.body.appendChild(overlay);

    document.getElementById('api-modal-close').addEventListener('click', () => {
      overlay.classList.remove('modal-overlay--active');
    });

    document.getElementById('api-modal-save').addEventListener('click', () => {
      const newKey = document.getElementById('api-modal-input').value.trim();
      if (newKey) {
        AppState.apiKey = newKey;
        localStorage.setItem('gemini_api_key', newKey);
        overlay.classList.remove('modal-overlay--active');
        showToast('API Key updated successfully', 'success');
        if (retryCallback) retryCallback();
      }
    });

    document.getElementById('api-modal-disconnect').addEventListener('click', () => {
      AppState.apiKey = '';
      localStorage.removeItem('gemini_api_key');
      document.getElementById('api-modal-input').value = '';
      overlay.classList.remove('modal-overlay--active');
      showToast('Session disconnected', 'info');
      if (AppState.currentPage === 'dashboard') renderPage();
    });
  } else {
    document.getElementById('api-modal-input').value = '';
    overlay.classList.remove('modal-overlay--active'); // force reflow
    void overlay.offsetWidth;
    overlay.classList.add('modal-overlay--active');
  }
}


// ═══════════════════════════════════════════
// SORTING GAME
// ═══════════════════════════════════════════
function assignTargetNumber(word, session) {
  if (word.flags.hasSingular && word.flags.hasPlural) {
    session.targetNumber = Math.random() < 0.5 ? 'singular' : 'plural';
  } else if (word.flags.hasSingular) {
    session.targetNumber = 'singular';
  } else if (word.flags.hasPlural) {
    session.targetNumber = 'plural';
  } else {
    session.targetNumber = 'singular'; // fallback
  }
}

export function startSortSession(words) {
  AppState.sortSession = {
    active: true,
    wordQueue: [...words],
    currentIndex: 0,
    currentStage: 0,
    currentWord: words[0],
    targetNumber: 'singular',
    selectedBubble: false,
    animacyChoice: null,
    genderChoice: null,
    isProcessing: false
  };

  if (words.length > 0) {
    assignTargetNumber(words[0], AppState.sortSession);
  }

  renderSortScreen();
}

function renderSortScreen() {
  const s = AppState.sortSession;
  if (!s.active) {
    document.getElementById('sort-screen').classList.remove('sort-screen--active');
    return;
  }

  const screen = document.getElementById('sort-screen');
  screen.classList.add('sort-screen--active');

  const word = s.currentWord;
  if (!word) { endSortSession(); return; }

  // Check for indeclinable — show golden modal
  if (isIndeclinable(word)) {
    renderGoldenModal(word);
    return;
  }

  // Check if we should skip the current stage
  if (shouldSkipStage(word, s.currentStage)) {
    if (s.currentStage === 2) {
      // Auto-set number to singular and advance
      s.currentStage = 3;
    }
  }

  // Get buckets for current stage
  let buckets;
  let stageTitle;
  switch (s.currentStage) {
    case 0:
      buckets = ANIMACY_BUCKETS;
      stageTitle = 'Одушевлённый или неодушевлённый?';
      break;
    case 1:
      buckets = GENDER_BUCKETS;
      stageTitle = 'Какой род?';
      break;
    case 2:
      buckets = NUMBER_BUCKETS;
      stageTitle = 'Единственное или множественное?';
      break;
    case 3: {
      const gender = s.genderChoice || (Array.isArray(word.gender) ? word.gender[0] : word.gender);
      const number = s.numberChoice || s.targetNumber || 'singular';
      buckets = getEndingBuckets(word, gender, number);
      stageTitle = 'Какое окончание в родительном падеже?';
      break;
    }
  }

  const progress = ((s.currentIndex) / s.wordQueue.length) * 100;

  screen.innerHTML = `
          <div class="sort-header">
            <button class="sort-header__back" id="sort-back">← Back</button>
            <span class="sort-header__progress">Word ${s.currentIndex + 1} of ${s.wordQueue.length}</span>
            <button class="sort-header__report" id="sort-report">⚠ Report</button>
          </div>
          <div class="progress-bar"><div class="progress-bar__fill" style="width: ${progress}%"></div></div>

          <div class="sort-stage-label">
            <div class="sort-stage-label__step">Stage ${s.currentStage + 1} of 4 — ${STAGE_LABELS_EN[s.currentStage]}</div>
            <div class="sort-stage-label__title">${stageTitle}</div>
          </div>

          <div class="sort-body">
            <div class="word-bubble" id="word-bubble" draggable="${!AppState.isMobile}">
              ${(s.targetNumber === 'plural' && word.nominative_pl) ? word.nominative_pl : word.nominative_sg}
              ${AppState.settings.showTranslations ? `<div class="word-bubble__translation">${word.translation_en || ''}</div>` : ''}
              <span class="word-bubble__source">${word.source === 'seed' ? 'from textbook' : 'extracted'}</span>
            </div>

            <div class="buckets-grid" id="buckets-grid">
              ${buckets.map(b => `
          <div class="bucket" data-bucket-id="${b.id}" role="button" tabindex="0"
               aria-label="${b.sublabel || b.label}">
            ${b.emoji ? `<span style="font-size: 1.5rem;">${b.emoji}</span>` : ''}
            <span class="bucket__label">${b.label}</span>
            <span class="bucket__sublabel">${b.sublabel || ''}</span>
            ${b.example ? `<span class="bucket__sublabel" style="font-family: var(--font-russian);">${b.example}</span>` : ''}
            ${b.tooltip ? `<span class="bucket__tooltip">${b.tooltip}</span>` : ''}
          </div>
        `).join('')}
            </div>
          </div>
          `;

  setupSortInteractions();
}

function setupSortInteractions() {
  const wordBubble = document.getElementById('word-bubble');
  const buckets = document.querySelectorAll('.bucket');
  const backBtn = document.getElementById('sort-back');
  const reportBtn = document.getElementById('sort-report');

  // Back button (exits immediately, no confirm needed)
  backBtn?.addEventListener('click', () => {
    AppState.sortSession.active = false;
    renderSortScreen();
    renderPage();
  });

  // Report exception
  reportBtn?.addEventListener('click', () => {
    const s = AppState.sortSession;
    logException({
      wordId: s.currentWord.wordId,
      nominative: s.currentWord.nominative_sg,
      stage: s.currentStage,
      userAnswer: 'reported_by_user',
      expectedAnswer: 'review_needed'
    });
    showToast('Report sent! Thanks for the feedback.', 'success');
  });

  // Click-to-sort works on ALL devices
  buckets.forEach(b => {
    b.addEventListener('click', () => {
      handleDrop(b.dataset.bucketId);
    });
  });

  if (!AppState.isMobile) {
    // Desktop also supports HTML5 DRAG AND DROP as bonus
    wordBubble?.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', 'word');
      wordBubble.classList.add('word-bubble--dragging');
    });

    wordBubble?.addEventListener('dragend', () => {
      wordBubble.classList.remove('word-bubble--dragging');
    });

    buckets.forEach(b => {
      b.addEventListener('dragover', (e) => {
        e.preventDefault();
        b.classList.add('bucket--drag-over');
      });
      b.addEventListener('dragleave', () => {
        b.classList.remove('bucket--drag-over');
      });
      b.addEventListener('drop', (e) => {
        e.preventDefault();
        b.classList.remove('bucket--drag-over');
        handleDrop(b.dataset.bucketId);
      });
    });
  }

  // Keyboard accessibility
  buckets.forEach(b => {
    b.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleDrop(b.dataset.bucketId);
      }
    });
  });
}

function handleDrop(bucketId) {
  const s = AppState.sortSession;
  if (s.isProcessing) return; // Guard against double-clicks
  const word = s.currentWord;
  const isCorrect = validateChoice(word, s.currentStage, bucketId, s.targetNumber);

  const bucket = document.querySelector(`[data-bucket-id="${bucketId}"]`);

  if (isCorrect) {
    bucket?.classList.add('bucket--correct');
    s.isProcessing = true;

    // Check for spelling rule hint
    if (s.currentStage === 3 && word.flags && word.flags.hasSpellingMutation) {
      const hint = getSpellingHint(word);
      if (hint) {
        const toast = document.createElement('div');
        toast.className = 'spelling-toast';
        toast.textContent = `✓ Correct! (${hint})`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
      }
    }

    setTimeout(() => {
      s.isProcessing = false;
      // Record choice for later stages
      if (s.currentStage === 0) s.animacyChoice = bucketId;
      if (s.currentStage === 1) s.genderChoice = bucketId;
      if (s.currentStage === 2) s.numberChoice = bucketId;

      // Advance to next stage or next word
      s.currentStage++;

      // Skip stages if needed
      while (s.currentStage < 4 && shouldSkipStage(word, s.currentStage)) {
        if (s.currentStage === 1) s.genderChoice = Array.isArray(word.gender) ? word.gender[0] : word.gender;
        if (s.currentStage === 2) s.numberChoice = word.flags.hasSingular === false ? 'plural' : 'singular';
        s.currentStage++;
      }

      if (s.currentStage > 3) {
        // Word completed all stages!
        markWordSorted(word.wordId);
        advanceToNextWord();
      } else {
        renderSortScreen();
      }
    }, 800);
  } else {
    // Wrong!
    bucket?.classList.add('bucket--wrong');
    s.isProcessing = true;

    // Track error
    const errKey = `stage_${s.currentStage}`;
    word.mastery.errorsByLevel[errKey] = (word.mastery.errorsByLevel[errKey] || 0) + 1;
    saveWord(word);

    setTimeout(() => {
      bucket?.classList.remove('bucket--wrong');
      s.isProcessing = false;
    }, 600);
  }
}

function advanceToNextWord() {
  const s = AppState.sortSession;
  s.currentIndex++;

  if (s.currentIndex >= s.wordQueue.length) {
    endSortSession();
  } else {
    s.currentWord = s.wordQueue[s.currentIndex];
    const word = s.currentWord;
    s.currentStage = 0;

    assignTargetNumber(word, s);

    s.animacyChoice = null;
    s.genderChoice = null;
    s.numberChoice = null;

    // Skip stages if needed right at the start
    while (s.currentStage < 4 && shouldSkipStage(word, s.currentStage)) {
      if (s.currentStage === 1) s.genderChoice = Array.isArray(word.gender) ? word.gender[0] : word.gender;
      if (s.currentStage === 2) s.numberChoice = word.flags.hasSingular === false ? 'plural' : 'singular';
      s.currentStage++;
    }

    s.selectedBubble = false;
    renderSortScreen();
  }
}

function endSortSession() {
  AppState.sortSession.active = false;
  renderSortSummary();
}

async function renderSortSummary() {
  const screen = document.getElementById('sort-screen');
  screen.classList.add('sort-screen--active');

  const groups = await getWordsByBucket();
  const groupKeys = Object.keys(groups).sort();

  screen.innerHTML = `
          <div class="sort-header">
            <button class="sort-header__back" id="summary-close">← Dashboard</button>
            <span class="sort-header__progress">Complete!</span>
            <span></span>
          </div>

          <div style="padding: var(--spacing-xl); max-width: 600px; margin: 0 auto;">
            <div class="summary">
              <div class="summary__confetti">🎉</div>
              <h2 class="summary__title">All sorted!</h2>

              <div class="summary__groups">
                ${groupKeys.length > 0 ? groupKeys.map(key => `
            <div class="summary__group">
              <div class="summary__group-label">${formatBucketPath(groups[key].path)}</div>
              <div class="summary__words">
                ${groups[key].words.map(w => {
    let wordText = w._displayNumber === 'plural' && w.nominative_pl ? w.nominative_pl : w.nominative_sg;
    let genText = w._displayNumber === 'plural' && w.genitive_pl ? w.genitive_pl : w.genitive_sg;
    return `<span class="summary__word-chip" title="${wordText} (${w.translation_en || ''}) → ${genText}">${wordText}</span>`;
  }).join('')}
              </div>
            </div>
          `).join('') : '<p style="color: var(--text-muted);">No words sorted yet.</p>'}
              </div>

              <div class="summary__actions">
                <button class="btn btn--primary" id="sort-more">Sort More →</button>
                <button class="btn btn--secondary" id="view-words">View Word List</button>
              </div>
            </div>
          </div>
          `;

  document.getElementById('summary-close')?.addEventListener('click', () => {
    screen.classList.remove('sort-screen--active');
    navigate('dashboard');
  });

  document.getElementById('sort-more')?.addEventListener('click', async () => {
    const unsorted = await getUnsortedWords();
    if (unsorted.length > 0) {
      startSortSession(unsorted);
    } else {
      showToast('All words are sorted! Add more via text or image.', 'info');
    }
  });

  document.getElementById('view-words')?.addEventListener('click', () => {
    screen.classList.remove('sort-screen--active');
    navigate('words');
  });
}

// Golden modal for indeclinable words
function renderGoldenModal(word) {
  let overlay = document.getElementById('golden-modal-overlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'golden-modal-overlay';
    overlay.className = 'modal-overlay modal-overlay--active';
    document.body.appendChild(overlay);
  } else {
    overlay.classList.add('modal-overlay--active');
  }

  overlay.innerHTML = `
          <div class="modal modal--golden">
            <div class="modal__icon">✨</div>
            <div class="modal__title">This word never changes!</div>
            <div class="modal__word">${word.nominative_sg}</div>
            <div class="modal__text">
              <strong>${word.nominative_sg}</strong> is indeclinable (несклоняемое).
              It has the same form in all cases, including genitive.
            </div>
            <button class="btn btn--primary" id="golden-ok">Got it! →</button>
          </div>
          `;

  document.getElementById('golden-ok')?.addEventListener('click', () => {
    overlay.classList.remove('modal-overlay--active');
    markWordSorted(word.wordId);
    advanceToNextWord();
  });
}

// ═══════════════════════════════════════════
// WORD LIST PAGE & BULK EDIT STATE
// ═══════════════════════════════════════════
let isBulkMode = false;
let selectedWordIds = new Set();
let currentSearchQuery = "";

async function renderWordList() {
  const groups = await getWordsByBucket();
  const groupKeys = Object.keys(groups).sort();
  const unsorted = await getUnsortedWords();
  const wordSets = await getWordSets();
  const seedUnsorted = unsorted.filter(w => !w.wordSetId || !w.wordSetId.startsWith('set-'));

  if (groupKeys.length === 0 && unsorted.length === 0 && wordSets.length === 0) {
    return `
          <div class="page page--active">
            <h1 style="margin-bottom: var(--spacing-lg);">📚 Word List</h1>
            <div class="word-list__empty">
              <p>No words yet. Extract some from text or images on the Dashboard!</p>
            </div>
          </div>
          `;
  }

  const setOptionsHtml = wordSets.map(s => `<option value="${s.id}">${s.title}</option>`).join('');

  return `
          <div class="page page--active">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-md);">
              <h1>📚 Word List</h1>
            </div>

            <!-- Sticky Search & Bulk Controls -->
            <div class="card" style="position: sticky; top: 0; z-index: 50; margin-bottom: var(--spacing-xl); padding: var(--spacing-md);">
              <div style="display: flex; gap: var(--spacing-sm); align-items: center;">
                 <input type="text" id="word-search" class="text-input" placeholder="Search words in Russian or English..." style="min-height: auto; flex: 1; padding: var(--spacing-sm);" value="${currentSearchQuery}">
                 <button id="toggle-bulk-mode" class="btn ${isBulkMode ? 'btn--primary' : 'btn--secondary'}">
                    ${isBulkMode ? 'Cancel Selection' : 'Select Multiple'}
                 </button>
              </div>
              
              <div id="bulk-action-bar" style="display: ${isBulkMode ? 'flex' : 'none'}; align-items: center; gap: var(--spacing-md); margin-top: var(--spacing-md); background: var(--surface-elevated); padding: var(--spacing-sm) var(--spacing-md); border-radius: var(--radius-sm);">
                 <span id="bulk-count" style="font-weight: 600; font-size: 0.9rem; color: var(--brand-primary);">${selectedWordIds.size} words selected</span>
                 <select id="bulk-move-target" class="text-input" style="min-height: auto; width: 150px; padding: var(--spacing-sm) 8px; font-size: 0.85rem;">
                    <option value="">Move to Set...</option>
                    ${setOptionsHtml}
                 </select>
                 <button id="bulk-move-btn" class="btn btn--secondary btn--sm" disabled>Move</button>
                 <button id="bulk-delete-btn" class="btn btn--secondary btn--sm" style="color: var(--semantic-error); border-color: var(--semantic-error);" disabled>Delete</button>
              </div>
            </div>

            ${seedUnsorted.length > 0 ? `
        <div class="accordion accordion--open" data-group="unsorted">
          <div class="accordion__header" data-toggle="unsorted">
            <span class="accordion__title">⏳ Core Vocabulary (Unsorted)</span>
            <span class="accordion__count">${seedUnsorted.length} words</span>
            <span class="accordion__chevron">▼</span>
          </div>
          <div class="accordion__body">
            <div class="accordion__words">
              ${seedUnsorted.map(w => `
                  <div class="word-chip-wrapper" data-wordid="${w.wordId}">
                     <input type="checkbox" class="bulk-checkbox" style="display: ${isBulkMode ? 'block' : 'none'}" ${selectedWordIds.has(w.wordId) ? 'checked' : ''}>
                     <span class="summary__word-chip" title="${w.translation_en || ''}">${w.nominative_sg}</span>
                  </div>
              `).join('')}
            </div>
          </div>
        </div>
      ` : ''}

            ${wordSets.map(set => `
        <div class="accordion accordion--open" data-group="${set.id}">
          <div class="accordion__header" data-toggle="${set.id}">
            <span class="accordion__title">🗂️ ${set.title}</span>
            <span class="accordion__count">${set.words.length} words</span>
            <span class="accordion__chevron">▼</span>
          </div>
          <div class="accordion__body">
            <div class="accordion__words">
              ${set.words.map(w => {
    let wordText = w.flags.hasPlural && !w.flags.hasSingular ? w.nominative_pl : w.nominative_sg;
    return `
                  <div class="word-chip-wrapper" data-wordid="${w.wordId}">
                     <input type="checkbox" class="bulk-checkbox" style="display: ${isBulkMode ? 'block' : 'none'}" ${selectedWordIds.has(w.wordId) ? 'checked' : ''}>
                     <span class="summary__word-chip" title="${w.translation_en || ''}">${wordText}</span>
                  </div>
              `}).join('')}
            </div>
          </div>
        </div>
      `).join('')}

            <div style="margin: var(--spacing-xl) 0 var(--spacing-md) 0; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; font-size: 0.85rem; letter-spacing: 0.05em;">Grammar Buckets</div>

            ${groupKeys.map(key => `
        <div class="accordion accordion--open" data-group="${key}">
          <div class="accordion__header" data-toggle="${key}">
            <span class="accordion__title">${formatBucketPath(groups[key].path)}</span>
            <span class="accordion__count">${groups[key].words.length} words</span>
            <span class="accordion__chevron">▼</span>
          </div>
          <div class="accordion__body">
            <div class="accordion__words">
              ${groups[key].words.map(w => {
      let wordText = w._displayNumber === 'plural' && w.nominative_pl ? w.nominative_pl : w.nominative_sg;
      let genText = w._displayNumber === 'plural' && w.genitive_pl ? w.genitive_pl : w.genitive_sg;
      return `
                  <div class="word-chip-wrapper" data-wordid="${w.wordId}">
                     <input type="checkbox" class="bulk-checkbox" style="display: ${isBulkMode ? 'block' : 'none'}" ${selectedWordIds.has(w.wordId) ? 'checked' : ''}>
                     <span class="summary__word-chip" title="${wordText} (${w.translation_en || ''}) → ${genText}">${wordText}</span>
                  </div>
              `}).join('')}
            </div>
          </div>
        </div>
      `).join('')}
          </div>
          `;
}

function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

function updateBulkUI() {
  const size = selectedWordIds.size;
  const countEl = document.getElementById('bulk-count');
  const moveBtn = document.getElementById('bulk-move-btn');
  const delBtn = document.getElementById('bulk-delete-btn');

  if (countEl) countEl.textContent = `${size} words selected`;
  if (moveBtn) moveBtn.disabled = size === 0 || !document.getElementById('bulk-move-target').value;
  if (delBtn) delBtn.disabled = size === 0;
}

function setupWordList() {
  // Accordion Toggle Logic
  document.querySelectorAll('.accordion__header').forEach(header => {
    header.addEventListener('click', () => {
      header.closest('.accordion')?.classList.toggle('accordion--open');
    });
  });

  // Bulk Mode Toggle
  document.getElementById('toggle-bulk-mode')?.addEventListener('click', () => {
    isBulkMode = !isBulkMode;
    if (!isBulkMode) {
      selectedWordIds.clear(); // Reset on exit
    }
    renderPage(); // Re-render to show/hide checkboxes
  });

  // Debounced Search Engine (Board Constraint #1 applied: normalizeRussianText on DOM)
  const handleSearch = debounce((e) => {
    currentSearchQuery = e.target.value;
    const query = window.normalizeRussianText ? window.normalizeRussianText(currentSearchQuery) : currentSearchQuery.toLowerCase();

    document.querySelectorAll('.accordion__words .word-chip-wrapper').forEach(wrapper => {
      const chip = wrapper.querySelector('.summary__word-chip');
      const rawText = chip.textContent + " " + (chip.title || "");
      const normalizedText = window.normalizeRussianText ? window.normalizeRussianText(rawText) : rawText.toLowerCase();

      if (normalizedText.includes(query)) {
        wrapper.style.display = 'inline-flex';
      } else {
        wrapper.style.display = 'none';
      }
    });

    // Auto-hide empty accordions during search
    document.querySelectorAll('.accordion').forEach(accordion => {
      const visibleChips = accordion.querySelectorAll('.word-chip-wrapper[style*="inline-flex"], .word-chip-wrapper:not([style*="none"])');
      accordion.style.display = (visibleChips.length > 0 || !query) ? 'block' : 'none';
    });
  }, 250);

  const searchInput = document.getElementById('word-search');
  if (searchInput) {
    searchInput.addEventListener('input', handleSearch);
    if (currentSearchQuery) handleSearch({ target: searchInput }); // Re-apply search on render
  }

  // Intercept Clicks for Bulk Selection (Board Constraint #2 applied)
  document.querySelectorAll('.word-chip-wrapper').forEach(wrapper => {
    wrapper.addEventListener('click', (e) => {
      if (!isBulkMode) return;
      e.preventDefault();

      const wordId = wrapper.dataset.wordid;
      const cb = wrapper.querySelector('.bulk-checkbox');

      if (selectedWordIds.has(wordId)) {
        selectedWordIds.delete(wordId);
        cb.checked = false;
      } else {
        selectedWordIds.add(wordId);
        cb.checked = true;
      }
      updateBulkUI();
    });
  });

  // Target Move Change enabled button
  document.getElementById('bulk-move-target')?.addEventListener('change', updateBulkUI);

  // Execute Bulk Move
  document.getElementById('bulk-move-btn')?.addEventListener('click', async () => {
    const targetSetId = document.getElementById('bulk-move-target').value;
    if (!targetSetId || selectedWordIds.size === 0) return;

    const ids = Array.from(selectedWordIds);
    const processed = await bulkAction(ids, 'move', targetSetId);

    showToast(`Moved ${processed} words. (Seed words protected)`, "success");
    isBulkMode = false;
    selectedWordIds.clear();
    renderPage();
  });

  // Execute Bulk Delete
  document.getElementById('bulk-delete-btn')?.addEventListener('click', async () => {
    if (selectedWordIds.size === 0) return;

    if (confirm(`Are you sure you want to delete ${selectedWordIds.size} words? (Core vocabulary will be ignored).`)) {
      const ids = Array.from(selectedWordIds);
      const processed = await bulkAction(ids, 'delete');
      showToast(`Deleted ${processed} custom words.`, "info");
      isBulkMode = false;
      selectedWordIds.clear();
      renderPage();
    }
  });

}

// ═══════════════════════════════════════════
// GRAMMAR REFERENCE PAGE
// ═══════════════════════════════════════════
function renderReference() {
  return `
          <div class="page page--active">
            <h1 style="margin-bottom: var(--spacing-lg);">📖 Grammar Reference</h1>

            <div class="card">
              <h2 class="card__title">Таблица 13 — Родительный падеж неодушевлённых существительных</h2>
              <p class="card__subtitle" style="margin-bottom: var(--spacing-md);">Genitive case of inanimate nouns (чего?)</p>

              <h3 class="ref-section">Мужской род</h3>
              <table class="ref-table">
                <thead>
                  <tr>
                    <th colspan="2">Единственное число</th>
                    <th colspan="2">Множественное число</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>стол<strong>а</strong></td><td class="ending-col"><strong>-а</strong></td><td>стол<strong>ов</strong></td><td class="ending-col"><strong>-ов</strong></td></tr>
                  <tr><td>словар<strong>я</strong></td><td class="ending-col"><strong>-я</strong></td><td>словар<strong>ей</strong></td><td class="ending-col"><strong>-ей</strong></td></tr>
                  <tr><td>музе<strong>я</strong></td><td class="ending-col"><strong>-я</strong></td><td>музе<strong>ев</strong></td><td class="ending-col"><strong>-ев</strong></td></tr>
                </tbody>
              </table>

              <h3 class="ref-section">Женский род</h3>
              <table class="ref-table">
                <thead>
                  <tr>
                    <th colspan="2">Единственное число</th>
                    <th colspan="2">Множественное число</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>ламп<strong>ы</strong></td><td class="ending-col"><strong>-ы</strong></td><td>ламп∅</td><td class="ending-col"><strong>∅</strong></td></tr>
                  <tr><td>стать<strong>и</strong></td><td class="ending-col"><strong>-и</strong></td><td>стат<strong>ей</strong></td><td class="ending-col"><strong>-ей</strong></td></tr>
                  <tr><td>аудитори<strong>и</strong></td><td class="ending-col"><strong>-и</strong></td><td>аудитор<strong>ий</strong></td><td class="ending-col"><strong>-ий</strong></td></tr>
                  <tr><td>тетрад<strong>и</strong></td><td class="ending-col"><strong>-и</strong></td><td>тетрад<strong>ей</strong></td><td class="ending-col"><strong>-ей</strong></td></tr>
                </tbody>
              </table>

              <h3 class="ref-section">Средний род</h3>
              <table class="ref-table">
                <thead>
                  <tr>
                    <th colspan="2">Единственное число</th>
                    <th colspan="2">Множественное число</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>окн<strong>а</strong></td><td class="ending-col"><strong>-а</strong></td><td>окон∅</td><td class="ending-col"><strong>∅</strong></td></tr>
                  <tr><td>мор<strong>я</strong></td><td class="ending-col"><strong>-я</strong></td><td>мор<strong>ей</strong></td><td class="ending-col"><strong>-ей</strong></td></tr>
                  <tr><td>здани<strong>я</strong></td><td class="ending-col"><strong>-я</strong></td><td>здан<strong>ий</strong></td><td class="ending-col"><strong>-ий</strong></td></tr>
                </tbody>
              </table>
            </div>

            <div class="card">
              <h2 class="card__title">Таблица 14 — Родительный падеж одушевлённых существительных</h2>
              <p class="card__subtitle" style="margin-bottom: var(--spacing-md);">Genitive case of animate nouns (кого?)</p>

              <h3 class="ref-section">Мужской род</h3>
              <table class="ref-table">
                <thead>
                  <tr>
                    <th colspan="2">Единственное число</th>
                    <th colspan="2">Множественное число</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>студент<strong>а</strong></td><td class="ending-col"><strong>-а</strong></td><td>студент<strong>ов</strong></td><td class="ending-col"><strong>-ов</strong></td></tr>
                  <tr><td>преподавател<strong>я</strong></td><td class="ending-col"><strong>-я</strong></td><td>преподавател<strong>ей</strong></td><td class="ending-col"><strong>-ей</strong></td></tr>
                  <tr><td>Алексе<strong>я</strong></td><td class="ending-col"><strong>-я</strong></td><td>Алексе<strong>ев</strong></td><td class="ending-col"><strong>-ев</strong></td></tr>
                  <tr><td>солдат<strong>а</strong></td><td class="ending-col"><strong>-а</strong></td><td>солдат∅</td><td class="ending-col"><strong>∅</strong></td></tr>
                </tbody>
              </table>

              <h3 class="ref-section">Женский род</h3>
              <table class="ref-table">
                <thead>
                  <tr>
                    <th colspan="2">Единственное число</th>
                    <th colspan="2">Множественное число</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>подруг<strong>и</strong></td><td class="ending-col"><strong>-и</strong></td><td>подруг∅</td><td class="ending-col"><strong>∅</strong></td></tr>
                  <tr><td>Тан<strong>и</strong></td><td class="ending-col"><strong>-и</strong></td><td>Тань∅</td><td class="ending-col"><strong>∅</strong></td></tr>
                  <tr><td>Мари<strong>и</strong></td><td class="ending-col"><strong>-и</strong></td><td>Мар<strong>ий</strong></td><td class="ending-col"><strong>-ий</strong></td></tr>
                  <tr><td>матер<strong>и</strong></td><td class="ending-col"><strong>-и</strong></td><td>матер<strong>ей</strong></td><td class="ending-col"><strong>-ей</strong></td></tr>
                  <tr><td>мам<strong>ы</strong></td><td class="ending-col"><strong>-ы</strong></td><td>мам∅</td><td class="ending-col"><strong>∅</strong></td></tr>
                </tbody>
              </table>

              <p style="margin-top: var(--spacing-sm); font-size: 0.9em; font-style: italic; color: var(--text-muted);">
                Note: Masculine nouns ending in -а/-я (папа, мужчина, дядя) take feminine endings (папы, мужчин, дядей).
              </p>
            </div>

            <div class="card">
              <h2 class="card__title">Таблица 15 — Субстантивированные прилагательные</h2>
              <p class="card__subtitle" style="margin-bottom: var(--spacing-md);">Adjectival Nouns</p>
              <table class="ref-table">
                <thead>
                  <tr>
                    <th colspan="2">Единственное число</th>
                    <th colspan="2">Множественное число</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>рабоч<strong>его</strong>, будущ<strong>его</strong></td><td class="ending-col"><strong>-ого/-его</strong></td><td>рабоч<strong>их</strong>, животн<strong>ых</strong></td><td class="ending-col"><strong>-ых/-их</strong></td></tr>
                  <tr><td>столов<strong>ой</strong>, рабоч<strong>ей</strong></td><td class="ending-col"><strong>-ой/-ей</strong></td><td>столов<strong>ых</strong>, рабоч<strong>их</strong></td><td class="ending-col"><strong>-ых/-их</strong></td></tr>
                </tbody>
              </table>
            </div>

            <div class="card">
              <h2 class="card__title">🔑 Особые правила — Special Rules</h2>
              <table class="ref-table">
                <thead>
                  <tr><th>Правило</th><th>Пример</th><th>Пояснение</th></tr>
                </thead>
                <tbody>
                  <tr><td>Правило 7 букв</td><td>книга → книг<strong>и</strong></td><td>После г, к, х, ж, ш, щ, ч → <strong>-и</strong> (не -ы)</td></tr>
                  <tr><td>Беглая гласная (вставка)</td><td>окно → ок<strong>о</strong>н</td><td>Гласная появляется в род. мн.</td></tr>
                  <tr><td>Беглая гласная (выпадение)</td><td>отец → отц<strong>а</strong></td><td>Гласная исчезает в род. ед.</td></tr>
                  <tr><td>Несклоняемое</td><td>кафе → кафе</td><td class="ending-col" data-bucket="indeclinable" style="text-decoration: underline; cursor: pointer;">Форма не меняется</td></tr>
                  <tr><td>Супплетивизм</td><td>ребёнок → дет<strong>ей</strong></td><td>Корень меняется полностью</td></tr>
                  <tr><td>Слова на -мя</td><td>время → времен<strong>и</strong> / врем<strong>ён</strong></td><td>Special neuter declension</td></tr>
                  <tr><td>Суффикс -ер-</td><td>мать → матер<strong>и</strong> / матер<strong>ей</strong></td><td>Stem extension for mother/daughter</td></tr>
                  <tr><td>Особые множественные на -ья</td><td>брат → брать<strong>я</strong> → брать<strong>ев</strong></td><td class="ending-col" data-bucket="y_ev" style="text-decoration: underline; cursor: pointer;">Irregular plural stem taking -ев/-ей</td></tr>
                  <tr><td>Pluralia Tantum</td><td>деньги → ден<strong>ег</strong></td><td>Words that only exist in the plural</td></tr>
                  <tr><td>Нулевое окончание муж. рода</td><td>раз → раз, глаз → глаз</td><td>Masculine nouns that unexpectedly take a zero-ending in plural</td></tr>
                </tbody>
              </table>
            </div>

            <!-- Modal for displaying words -->
            <div id="reference-modal" class="modal-overlay">
                <div class="modal modal--light">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-md);">
                        <h2 class="modal__title" id="reference-modal-title" style="margin: 0;"></h2>
                        <button class="modal__close" id="reference-modal-close" style="position: static;">✕</button>
                    </div>
                    <div id="reference-modal-content" class="buckets-grid" style="max-height: 50vh; overflow-y: auto;">
                        <div class="spinner"></div>
                    </div>
                </div>
            </div>

          </div>
          `;
}

function setupReference() {
  // Make ending columns interactive
  document.querySelectorAll('.ref-table').forEach(table => {
    table.querySelectorAll('.ending-col').forEach(col => {
      col.style.cursor = 'pointer';
      col.title = 'View words with this ending';
      col.classList.add('ending-col--interactive'); // Optional CSS class for hover states

      // Map table endings to our DB buckets
      let bucketId = col.dataset.bucket;
      if (!bucketId) {
        const text = col.textContent.replace('-', '').trim();
        const map = {
          'а': 'hard_a', 'я': 'soft_ya', 'ы': 'hard_y', 'и': 'soft_i',
          'ов': 'hard_ov', 'ев': 'y_ev', 'ей': 'soft_ey', 'ий': 'iy', '∅': 'zero',
          'ого/его': 'adj_ogo', 'ой/ей': 'adj_oy', 'ых/их': 'adj_yh'
        };
        bucketId = map[text] || null;
      }

      if (bucketId) {
        col.addEventListener('click', async () => {
          const modal = document.getElementById('reference-modal');
          const title = document.getElementById('reference-modal-title');
          const content = document.getElementById('reference-modal-content');

          title.textContent = `Words ending in -${col.textContent.replace('-', '')}`;
          content.innerHTML = '<div class="spinner"></div>';
          modal.classList.add('modal-overlay--active');

          // Fetch Words
          const sortedGroups = await getWordsByBucket();
          let matchingWords = [];

          for (const key in sortedGroups) {
            const path = sortedGroups[key].path;
            if (path && path.length >= 4 && path[3] === bucketId) {
              matchingWords = matchingWords.concat(sortedGroups[key].words);
            }
          }

          if (matchingWords.length > 0) {
            content.innerHTML = matchingWords.map(w => {
              const wordText = w._displayNumber === 'plural' && w.nominative_pl ? w.nominative_pl : w.nominative_sg;
              const genText = w._displayNumber === 'plural' && w.genitive_pl ? w.genitive_pl : w.genitive_sg;
              return `<span class="summary__word-chip" title="${wordText} (${w.translation_en || ''}) → ${genText}">${wordText}</span>`;
            }).join('');
          } else {
            content.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 10px;">No sorted words found for this bucket yet.</p>';
          }
        });
      }
    });
  });

  document.getElementById('reference-modal-close')?.addEventListener('click', () => {
    document.getElementById('reference-modal').classList.remove('modal-overlay--active');
  });
}

// ═══════════════════════════════════════════
// SETTINGS PAGE
// ═══════════════════════════════════════════
async function renderSettings() {
  const stats = await getStats();
  const heatmapHtml = await renderHeatmap();

  return `
          <div class="page page--active">
            <h1 style="margin-bottom: var(--spacing-lg);">⚙️ Settings</h1>

            <div class="card">
              <h2 class="card__title">🎛️ Preferences</h2>
              <div class="settings-field" style="display: flex; align-items: center; gap: var(--spacing-sm);">
                <input type="checkbox" id="toggle-translations" ${AppState.settings.showTranslations ? 'checked' : ''}>
                  <label for="toggle-translations" style="cursor: pointer;">Show English Translations on Flashcards (Easy Mode)</label>
              </div>
            </div>

            ${heatmapHtml}

            <div class="card">
              <h2 class="card__title">📊 Statistics</h2>
              <div class="settings__stats">
                <div class="stat-card">
                  <div class="stat-card__value">${stats.total}</div>
                  <div class="stat-card__label">Total Words</div>
                </div>
                <div class="stat-card">
                  <div class="stat-card__value">${stats.sorted}</div>
                  <div class="stat-card__label">Sorted</div>
                </div>
                <div class="stat-card">
                  <div class="stat-card__value">${stats.mastered}</div>
                  <div class="stat-card__label">Mastered</div>
                </div>
              </div>
            </div>

            <div class="card">
              <h2 class="card__title">🔑 Gemini API Key</h2>
              <div class="settings-field">
                <label for="api-key-input" style="display: flex; justify-content: space-between; align-items: baseline;">
                  <span>Your API key (stored locally in browser)</span>
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color: var(--accent-primary); text-decoration: none; font-size: 0.85rem;">Get a key ↗</a>
                </label>
                <input type="password" id="api-key-input" value="${AppState.apiKey}" placeholder="AIza...">
              </div>
              <button class="btn btn--primary btn--sm" id="save-api-key">Save Key</button>
            </div>

            <div class="card">
              <h2 class="card__title">📦 Data</h2>
              <div style="display: flex; gap: var(--spacing-md); flex-wrap: wrap;">
                <button class="btn btn--secondary btn--sm" id="export-data">📥 Export Data (JSON)</button>
                <button class="btn btn--secondary btn--sm" id="reset-mastery" style="border-color: rgba(231,76,60,0.3); color: var(--accent-error);">🔄 Reset All Progress</button>
              </div>
            </div>

            <div class="card">
              <h2 class="card__title">🔗 Exception Webhook (Optional)</h2>
              <div class="settings-field">
                <label for="webhook-input">Webhook URL for exception reports</label>
                <input type="text" id="webhook-input" value="${localStorage.getItem('exception_webhook_url') || ''}" placeholder="https://hook.us1.make.com/...">
              </div>
              <button class="btn btn--secondary btn--sm" id="save-webhook">Save Webhook</button>
            </div>
          </div>
          `;
}

// ═══════════════════════════════════════════
// ACTIVITY HEATMAP RENDERER (LEGACY SPRINT III)
// ═══════════════════════════════════════════
async function renderHeatmap() {
  const activityMap = await getYearlyActivity();
  const { currentStreak, longestStreak } = await getStreakStats();

  const todayStr = new Date().toLocaleDateString('en-CA');
  const today = new Date(todayStr + 'T00:00:00');

  const daysOff = today.getDay();
  const totalDays = 84 + daysOff; // 12 weeks

  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - totalDays + 1);

  let html = `
        <div class="card" style="margin-bottom: var(--spacing-md);">
           <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: var(--spacing-sm);">
               <h2 class="card__title" style="margin-bottom: 0;">🔥 Quarterly Heatmap (12-Week)</h2>
               <div style="font-size: 0.85rem; color: var(--text-secondary); text-align: right;">
                   <span style="display:inline-block; margin-right: 12px;"><strong>Current Streak:</strong> <span style="color: var(--accent-gold); font-weight: bold;">${currentStreak}</span> day${currentStreak === 1 ? '' : 's'}</span>
                   <span style="display:inline-block;"><strong>Longest:</strong> ${longestStreak} day${longestStreak === 1 ? '' : 's'}</span>
               </div>
           </div>
           
           <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: var(--spacing-md);">
              * Streaks are maintained by completing Active Recall Drills.
           </div>

           <div id="heatmap-scroll-container" style="display: flex; flex-direction: column; overflow-x: auto; padding-bottom: var(--spacing-sm);">
             <div class="heatmap-grid" style="display: grid; grid-template-rows: repeat(7, 1fr); grid-auto-flow: column; gap: 3px; min-width: max-content;">
  `;

  for (let i = 0; i < totalDays; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    const log = activityMap.get(dateStr);
    const count = log ? log.count : 0;
    const drills = log && typeof log.drillCount !== 'undefined' ? log.drillCount : 0;
    const sorts = log && typeof log.sortCount !== 'undefined' ? log.sortCount : 0;

    let level = 0;
    if (count > 0) level = 1;
    if (count >= 10) level = 2;
    if (count >= 30) level = 3;
    if (count >= 60) level = 4;

    let tooltipText = `${dateStr}: ${count} total actions`;
    if (count > 0) {
      if (drills > 0 || sorts > 0) {
        tooltipText += `\nDrills: ${drills} | Sorts: ${sorts}`;
      } else {
        tooltipText += `\n(Legacy data)`;
      }
    }

    html += `
             <div class="heatmap-cell" 
                  data-level="${level}" 
                  title="${tooltipText}"
                  style="width: 12px; height: 12px; border-radius: 2px; background-color: var(--heatmap-color-${level}, var(--heatmap-color-0)); cursor: help;">
             </div>
    `;
  }

  html += `
             </div>
           </div>
        </div>
  `;
  return html;
}

function setupSettings() {
  const hmContainer = document.getElementById('heatmap-scroll-container');
  if (hmContainer) {
    requestAnimationFrame(() => {
      hmContainer.scrollLeft = hmContainer.scrollWidth;
    });
  }
  document.getElementById('save-api-key')?.addEventListener('click', () => {
    const key = document.getElementById('api-key-input')?.value?.trim();
    if (key) {
      AppState.apiKey = key;
      localStorage.setItem('gemini_api_key', key);
      showToast('API key saved!', 'success');
    }
  });

  document.getElementById('toggle-translations')?.addEventListener('change', (e) => {
    AppState.settings.showTranslations = e.target.checked;
    localStorage.setItem('show_translations', e.target.checked.toString());
  });

  document.getElementById('export-data')?.addEventListener('click', () => {
    exportData();
    showToast('Data exported!', 'success');
  });

  document.getElementById('reset-mastery')?.addEventListener('click', async (e) => {
    const btn = e.target;
    if (btn.dataset.confirming === 'true') {
      // Flush the old dataset and reseed with the new 500-word list
      const db = await getDB();
      await db.clear('words');
      const { added } = await reseedFromSource();

      showToast(`Database rebuilt with ${added} pristine seed words!`, 'info');
      btn.dataset.confirming = 'false';
      btn.innerHTML = '🔄 Reset All Progress';
      renderPage();
    } else {
      btn.dataset.confirming = 'true';
      btn.innerHTML = '⚠️ Click again to confirm';
      setTimeout(() => {
        if (btn.dataset.confirming === 'true') {
          btn.dataset.confirming = 'false';
          btn.innerHTML = '🔄 Reset All Progress';
        }
      }, 3000);
    }
  });

  document.getElementById('save-webhook')?.addEventListener('click', () => {
    const url = document.getElementById('webhook-input')?.value?.trim();
    if (url) {
      localStorage.setItem('exception_webhook_url', url);
      showToast('Webhook saved!', 'success');
    } else {
      localStorage.removeItem('exception_webhook_url');
      showToast('Webhook removed.', 'info');
    }
  });
}

// ═══════════════════════════════════════════
// BOOT SEQUENCE
// ═══════════════════════════════════════════
async function boot() {
  // 1. Seed database on first launch
  const wasSeeded = await seedIfEmpty();
  if (wasSeeded) {
    showToast('Welcome! 18 seed words loaded from textbook.', 'success');
  }

  // 2. Set initial page from hash
  AppState.currentPage = getPageFromHash();

  // 3. Listen for hash changes
  window.addEventListener('hashchange', () => {
    // If user pushes browser back button during a sorting session, ensure overlay is closed
    if (AppState.sortSession.active) {
      AppState.sortSession.active = false;
      renderSortScreen();
    }
    AppState.currentPage = getPageFromHash();
    renderPage();
  });

  // 4. Listen for resize (mobile toggle)
  window.addEventListener('resize', () => {
    AppState.isMobile = window.innerWidth < 768;
  });

  // 5. Setup nav clicks
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(el.dataset.page);
    });
  });

  // 6. Render initial page
  renderPage();
}

// Launch!
boot();
