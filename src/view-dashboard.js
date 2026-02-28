import { AppState, showToast } from './state.js';
import { getUnsortedWords, getWordSets, deleteWordSet, deleteWord, saveWord, getStats, addWords, getAllWords, getDueReviewCount, getYearlyActivity, getStreakStats, calculateMilestones } from './db.js';
import { extractNounsFromText, extractNounsFromImage, getErrorMessage } from './gemini.js';
import { renderPage, startSortSession, setTeardown } from './main.js';

// Safe HTML display
export function escapeHtml(unsafe) {
  return (unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export async function renderDashboard() {
  const stats = await getStats();
  const unsorted = await getUnsortedWords();
  const wordSets = await getWordSets();

  // Destination options
  let destOptions = `<option value="new">🆕 Create New Extracted Set</option>`;
  destOptions += `<option value="manual-added">✍️ Manually Added Words</option>`;
  wordSets.forEach(set => {
    if (set.id !== 'manual-added') {
      destOptions += `<option value="${set.id}">🗂️ ${escapeHtml(set.title)}</option>`;
    }
  });

  return `
    <div class="page page--active" id="page-dashboard">
      <div class="dashboard-header">
        <h1>🇷🇺 Genitive Lab</h1>
        <p>Master Russian genitive case through bucket sorting</p>
      </div>

      <div id="dashboard-milestone-container" style="margin-bottom: var(--spacing-sm); width: 100%;">
        <!-- Milestones dynamically rendered here -->
      </div>
      
      <div id="dashboard-global-cta-container" style="margin-bottom: var(--spacing-xl);">
        <!-- Global Drill CTA dynamically generated here -->
      </div>
      
      <div id="dashboard-sets-container" style="margin-bottom: var(--spacing-lg);">
        <!-- Rendered dynamically -->
      </div>

      <div style="margin: var(--spacing-xl) 0 var(--spacing-md) 0; border-top: 1px solid var(--border-subtle); padding-top: var(--spacing-xl);">
        <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 4px;">➕ Add Vocabulary</h2>
        <p style="color: var(--text-muted); font-size: 0.95rem;">Create new word sets using AI extraction or add words manually.</p>
      </div>

      <div class="card" style="margin-bottom: var(--spacing-sm);">
        <label for="destination-set" style="font-weight: 600; font-size: 0.9rem; display: block; margin-bottom: var(--spacing-xs);">📥 Routing Destination</label>
        <select id="destination-set" class="text-input" style="width: 100%; border-color: var(--accent-primary);">
            ${destOptions}
        </select>
        <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">New words will be saved to this set.</p>
      </div>

      <div class="card">
        <h2 class="card__title">📝 Paste Russian Text</h2>
        <textarea class="text-input" id="text-input" placeholder="Вставьте русский текст здесь..."></textarea>
        <div class="divider">or upload image</div>
        <div class="drop-zone" id="drop-zone">
          <div class="drop-zone__icon">📷</div>
          <div class="drop-zone__text">Drop image here or click to browse</div>
          <div class="drop-zone__file-name" id="file-name"></div>
          <input type="file" id="file-input" accept="image/*">
        </div>
        <div style="margin-top: var(--spacing-lg);">
          <button class="btn btn--primary btn--full" id="extract-btn" ${!AppState.apiKey ? 'disabled' : ''}>
            ✨ Extract Nouns
          </button>
          ${!AppState.apiKey ? '<p style="text-align:center; margin-top: var(--spacing-sm); font-size: 0.8rem; color: var(--text-muted);">Set your Gemini API key in Settings first</p>' : ''}
        </div>
      </div>
      
      <div class="card" id="extracted-nouns-card" style="display: ${AppState.extractedNouns.length ? 'block' : 'none'};">
        <h2 class="card__title">📋 Extracted Nouns (${AppState.extractedNouns.length})</h2>
        <div id="extracted-list" class="buckets-grid" style="justify-content: flex-start; gap: var(--spacing-xs);">
          ${AppState.extractedNouns.map(n => `<span class="summary__word-chip">${escapeHtml(n.nominative_sg)}</span>`).join('')}
        </div>
        <div style="margin-top: var(--spacing-lg);">
          <button class="btn btn--primary btn--full" id="start-sort-extracted">🎯 Sort These Words</button>
        </div>
      </div>

      <div style="margin-top: var(--spacing-sm);">
         <button id="open-manual-word-modal-btn" class="btn btn--secondary btn--full">Add Custom Word ➕</button>
      </div>

      <!-- Add Word Modal -->
      <div id="manual-word-modal-overlay" class="modal-overlay" style="display: none;">
        <div class="modal card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-md);">
              <h2 class="card__title" style="margin: 0;">✍️ Manual Word Entry</h2>
              <button id="close-manual-modal-btn" class="btn btn--secondary" style="padding: 4px 8px; border: none; font-size: 1.2rem;">✕</button>
          </div>
          <form id="manual-word-form" style="display: flex; flex-direction: column; gap: var(--spacing-sm);">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-sm);">
              <input type="text" id="man-nom-sg" class="text-input" placeholder="Nominative Sg (e.g. брат)">
              <input type="text" id="man-nom-pl" class="text-input" placeholder="Nominative Pl (e.g. братья)">
              <input type="text" id="man-gen-sg" class="text-input" placeholder="Genitive Sg (e.g. брата)">
              <input type="text" id="man-gen-pl" class="text-input" placeholder="Genitive Pl (e.g. братьев)">
              <input type="text" id="man-translation-en" class="text-input" placeholder="English Translation (e.g. brother)" style="grid-column: span 2;">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-sm);">
              <select id="man-gender" class="text-input">
                <option value="masculine">Masculine</option>
                <option value="feminine">Feminine</option>
                <option value="neuter">Neuter</option>
              </select>
              <select id="man-animacy" class="text-input">
                <option value="inanimate">Inanimate</option>
                <option value="animate">Animate</option>
              </select>
            </div>
            <button type="submit" class="btn btn--primary btn--full" style="margin-top: var(--spacing-sm);">➕ Add Word</button>
          </form>
        </div>
      </div>

    </div>
  `;
}

// ═══════════════════════════════════════════
// MILESTONE TRACKER RENDERER (SPRINT II.c Gamification)
// ═══════════════════════════════════════════
async function renderMilestoneTracker() {
  const ms = await calculateMilestones();

  const emptyDaily = "width: 20px; height: 20px; border-radius: 4px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);";
  const fillDaily = "width: 20px; height: 20px; border-radius: 4px; background: var(--brand-primary, #4285f4); box-shadow: 0 0 8px var(--brand-primary, #4285f4); border: 1px solid transparent;";

  const emptyWeek = "width: 20px; height: 20px; border-radius: 4px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); transform: rotate(45deg);";
  const fillWeek = "width: 20px; height: 20px; border-radius: 4px; background: var(--accent-gold, #f1c40f); box-shadow: 0 0 10px var(--accent-gold, #f1c40f); border: 1px solid transparent; transform: rotate(45deg);";

  const daysHtml = Array(4).fill(0).map((_, i) => `<div style="${i < ms.dailyBoxes ? fillDaily : emptyDaily}"></div>`).join('');
  const weeksHtml = Array(4).fill(0).map((_, i) => `<div style="margin: 0 4px; ${i < ms.weeklyBoxes ? fillWeek : emptyWeek}"></div>`).join('');

  return `
    <div class="card" style="padding: var(--spacing-lg); background: linear-gradient(135deg, rgba(20,20,25,1), rgba(30,30,40,1)); border: 1px solid var(--border-subtle);">
       <div style="display: flex; justify-content: space-between; gap: var(--spacing-md); flex-wrap: wrap;">
          
          <!-- Column 1: Daily Habit -->
          <div style="flex: 1; min-width: 110px; display: flex; flex-direction: column; align-items: center; text-align: center;">
             <div style="font-weight: bold; font-size: 0.95rem; margin-bottom: 12px; letter-spacing: 0.05em;">DAILY HABIT</div>
             <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                 ${daysHtml}
             </div>
             <div style="font-size: 0.75rem; color: var(--text-muted);">4 days / week</div>
          </div>
          
          <!-- Column 2: Weekly Streak -->
          <div style="flex: 1.2; min-width: 140px; display: flex; flex-direction: column; align-items: center; text-align: center; border-left: 1px solid rgba(255,255,255,0.1); border-right: 1px solid rgba(255,255,255,0.1); padding: 0 10px;">
             <div style="font-weight: bold; font-size: 0.95rem; margin-bottom: 12px; color: var(--accent-gold); letter-spacing: 0.05em;">MOMENTUM</div>
             <div style="display: flex; gap: 8px; margin-bottom: 8px; padding-top: 4px;">
                 ${weeksHtml}
             </div>
             <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">4-week streak</div>
          </div>
          
          <!-- Column 3: Trophies -->
          <div style="flex: 1; min-width: 110px; display: flex; flex-direction: column; align-items: center; text-align: center;">
             <div style="font-size: 2.5rem; line-height: 1; margin-bottom: 4px; filter: drop-shadow(0 0 10px rgba(255,215,0,0.5)); transform: scale(${ms.totalTrophies > 0 ? '1.1' : '1'}); transition: transform 0.3s ease;">🏆</div>
             <div style="font-weight: bold; font-size: 1.2rem; color: var(--accent-gold);">x${ms.totalTrophies}</div>
             <div style="font-size: 0.75rem; color: var(--text-muted);">Trophies Won</div>
          </div>
          
       </div>
    </div>
  `;
}

export async function renderDashboardSetsUI(unsorted, stats) {
  const wordSets = await getWordSets();
  const seedUnsortedComplete = unsorted.filter(w => w.source === 'seed');
  const seedUnsorted = seedUnsortedComplete.slice(0, 15); // Chunk array to max 15 words to prevent cognitive overload

  // Performance optimization for Engineer: Use O(1) indexed IDB count
  const seedDueCount = await getDueReviewCount('seed');

  let html = `
      <div class="card">
        <h2 class="card__title">🗃️ Practice Core Vocabulary</h2>
        <div style="display: flex; gap: var(--spacing-sm); margin-bottom: var(--spacing-sm);">
             <span style="font-size: 0.85rem; padding: 4px 8px; background: rgba(0,0,0,0.1); border-radius: 4px;">🎯 Lvl 1: ${seedUnsortedComplete.length} unsorted</span>
             <span style="font-size: 0.85rem; padding: 4px 8px; background: rgba(0,0,0,0.1); border-radius: 4px;">⚡ Lvl 2: ${seedDueCount} due</span>
        </div>
        
        <div style="display: flex; gap: var(--spacing-sm); margin-bottom: var(--spacing-sm);">
            <button class="btn btn--secondary practice-set-btn" style="flex: 1;" data-set="seed" ${seedUnsortedComplete.length === 0 ? 'disabled' : ''}>
              ${seedUnsortedComplete.length > 0 ? `Lvl 1: Sort ${seedUnsorted.length} →` : 'Lvl 1 sorted🏆'}
            </button>
            <button class="btn btn--primary drill-set-btn" style="flex: 1;" data-set="seed">
              ${seedDueCount > 0 ? `⚡ Lvl 2: Recall (${seedDueCount})` : 'Cram Mode'}
            </button>
        </div>
      </div>
  `;

  if (wordSets.length > 0) {
    html += `
      <div class="card">
        <h2 class="card__title">🗂️ Custom Extracted Sets</h2>
        <div style="display: flex; flex-direction: column; gap: var(--spacing-sm);">
          ${await Promise.all(wordSets.map(async set => {
      const dueCount = await getDueReviewCount(set.id);
      return `
            <div style="border: 1px solid var(--border-subtle); padding: var(--spacing-sm); border-radius: var(--radius-sm); background: rgba(0,0,0,0.2);">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="flex: 1; min-width: 0; position: relative;">
                  ${set.id !== 'manual-added' ? `
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span class="set-title-display" style="font-weight: bold; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(set.title)}">${escapeHtml(set.title)}</span>
                      <button class="btn btn--secondary btn--sm edit-set-name-btn" data-set="${set.id}" style="padding: 2px 6px; font-size: 0.7rem;">✏️</button>
                      <input type="text" class="text-input set-rename-input" data-set="${set.id}" data-original="${escapeHtml(set.title)}" value="${escapeHtml(set.title)}" style="display: none; height: 30px; padding: 4px; font-size: 0.95rem; width: 100%; max-width: 200px;">
                    </div>
                  ` : `
                    <div style="display: flex; align-items: center; gap: 8px;">
                       <span style="font-weight: bold; font-size: 0.95rem;">${escapeHtml(set.title)}</span>
                    </div>
                  `}
                  <div style="font-size: 0.8rem; color: var(--text-muted); display: flex; gap: 8px; margin-top: 4px;">
                      <span>🎯 Lvl 1: ${set.sortedCount}/${set.words.length} sorted</span>
                      <span>⚡ Lvl 2: ${dueCount} due</span>
                  </div>
                </div>
                <div style="display: flex; gap: var(--spacing-xs); margin-left: var(--spacing-sm);">
                  <button class="btn btn--secondary btn--sm view-set-words-btn" data-set="${set.id}" title="View Words">👁️</button>
                  <button class="btn btn--secondary btn--sm delete-set-btn" data-set="${set.id}" style="color: var(--accent-error); border-color: rgba(231,76,60,0.3);" title="Delete Set">✕</button>
                </div>
              </div>
              
              <div style="display: flex; gap: var(--spacing-sm); margin-top: var(--spacing-sm);">
                  <button class="btn btn--secondary btn--sm practice-set-btn" style="flex: 1;" data-set="${set.id}" ${set.sortedCount === set.words.length ? 'disabled' : ''}>
                      ${set.sortedCount === set.words.length ? 'Lvl 1 Done🏆' : 'Lvl 1: Sort →'}
                  </button>
                  <button class="btn btn--primary btn--sm drill-set-btn" style="flex: 1;" data-set="${set.id}">
                      ${dueCount > 0 ? `⚡ Lvl 2: Recall (${dueCount})` : 'Cram Mode'}
                  </button>
              </div>
              
              <div class="set-words-inline-list" id="inline-words-${set.id}" style="display: none; margin-top: var(--spacing-sm); border-top: 1px solid var(--border-subtle); padding-top: var(--spacing-sm);">
                 ${set.words.map(w => {
        const displayWord = w.nominative_sg || w.nominative_pl;
        return `<div class="inline-word-row" style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 0.85rem;">
                         <span>${escapeHtml(displayWord)} 
                            <span style="color: var(--text-muted); font-size: 0.75rem; margin-left: 6px;">${w.source === 'seed' ? '' : `(${w.source})`}</span>
                         </span>
                         ${w.source !== 'seed' ? `<button class="btn btn--secondary btn--sm delete-word-btn" data-wordid="${w.wordId}" data-set="${set.id}" style="padding: 2px 6px; font-size: 0.7rem; color: var(--accent-error);">✕</button>` : ''}
                     </div>`;
      }).join('')}
              </div>
            </div>
          `;
    })).then(results => results.join(''))}
        </div>
      </div>
    `;
  }
  return html;
}

export function setupDashboardInteractions() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const extractBtn = document.getElementById('extract-btn');
  const startSortBtn = document.getElementById('start-sort-extracted');
  const destSelect = document.getElementById('destination-set');

  // Destination Select State Preservation
  if (destSelect) {
    const savedDest = localStorage.getItem('last_destination_set');
    if (savedDest && Array.from(destSelect.options).some(o => o.value === savedDest)) {
      destSelect.value = savedDest;
    }
    destSelect.addEventListener('change', (e) => {
      localStorage.setItem('last_destination_set', e.target.value);
    });
  }

  // Drop zone events
  dropZone?.addEventListener('click', () => fileInput.click());
  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      document.getElementById('file-name').textContent = escapeHtml(file.name);
      dropZone.classList.add('drop-zone--active');
    }
  });
  dropZone?.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drop-zone--active'); });
  dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('drop-zone--active'));
  dropZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drop-zone--active');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      fileInput.files = e.dataTransfer.files;
      document.getElementById('file-name').textContent = escapeHtml(file.name);
      dropZone.classList.add('drop-zone--active');
    }
  });

  // Extract button
  extractBtn?.addEventListener('click', async () => {
    const textInput = document.getElementById('text-input');
    const text = textInput?.value?.trim();
    const file = fileInput?.files?.[0];

    if (!text && !file) {
      showToast('Please enter some Russian text or upload an image.', 'error');
      return;
    }

    extractBtn.disabled = true;
    extractBtn.innerHTML = '<span class="spinner"></span> Extracting...';

    try {
      let nouns;
      if (file) {
        nouns = await extractNounsFromImage(file, AppState.apiKey);
      } else {
        nouns = await extractNounsFromText(text, AppState.apiKey);
      }

      if (!nouns || nouns.length === 0) {
        showToast('No Russian nouns detected.', 'error');
        return;
      }

      const targetSetId = destSelect.value === 'new' ? `set-${Date.now()}` : destSelect.value;
      // Apply routing ID mapping before saving words
      for (const noun of nouns) {
        noun.wordSetId = targetSetId;
      }

      const added = await addWords(nouns);
      AppState.extractedNouns = nouns;

      showToast(`Found ${nouns.length} noun${nouns.length !== 1 ? 's' : ''}!`, 'success');

      // If "new" was extracted, save default title and update select
      if (destSelect.value === 'new') {
        destSelect.value = targetSetId;
        localStorage.setItem('last_destination_set', targetSetId);
      }

      renderPage();
    } catch (error) {
      const { showApiKeyModal } = await import('./main.js');
      if (error.message === 'RATE_LIMITED' || error.message === 'INVALID_API_KEY') {
        showApiKeyModal(() => extractBtn.click());
      } else {
        showToast(getErrorMessage(error), 'error');
      }
    } finally {
      extractBtn.disabled = false;
      if (!AppState.extractedNouns.length) {
        extractBtn.innerHTML = '✨ Extract Nouns';
      }
    }
  });

  // Manual word form (handles Deterministic Overwrite & Route logic)
  document.getElementById('manual-word-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nomSg = document.getElementById('man-nom-sg').value.trim() || null;
    const nomPl = document.getElementById('man-nom-pl').value.trim() || null;
    const genSg = document.getElementById('man-gen-sg').value.trim() || null;
    const genPl = document.getElementById('man-gen-pl').value.trim() || null;
    const translationEn = document.getElementById('man-translation-en').value.trim();
    const gender = document.getElementById('man-gender').value;
    const animacy = document.getElementById('man-animacy').value;

    if (!nomSg && !nomPl) {
      showToast('Please provide at least one nominative form.', 'error');
      return;
    }

    const baseStr = nomSg || nomPl || "unknown";
    const fallbackWordId = `manual-${baseStr.toLowerCase().trim()}`;
    let targetSetId = destSelect.value === 'new' ? `set-${Date.now()}` : destSelect.value;

    const allWords = await getAllWords();
    const existingWord = allWords.find(w =>
      (nomSg && w.nominative_sg && w.nominative_sg.toLowerCase().trim() === nomSg.toLowerCase().trim()) ||
      (nomPl && w.nominative_pl && w.nominative_pl.toLowerCase().trim() === nomPl.toLowerCase().trim())
    );

    let finalWordId = fallbackWordId;

    if (existingWord) {
      if (existingWord.wordSetId !== targetSetId) {
        const names = JSON.parse(localStorage.getItem('genitive_set_names') || '{}');
        const oldSetName = names[existingWord.wordSetId] || existingWord.wordSetId || 'Core Vocabulary';
        const newSetName = names[targetSetId] || targetSetId;

        const confirmed = confirm(`This word appears to exist in [${oldSetName}]. Update it and move it to [${newSetName}]?`);
        if (!confirmed) return; // cancel operation
      }
      finalWordId = existingWord.wordId; // reuse legacy ID
    }

    const word = {
      wordId: finalWordId,
      wordSetId: targetSetId,
      type: "noun",
      nominative_sg: nomSg,
      nominative_pl: nomPl,
      genitive_sg: genSg,
      genitive_pl: genPl,
      translation_en: translationEn,
      gender: gender,
      animacy: animacy,
      stemType: "noun",
      flags: {
        isIndeclinable: false,
        hasPlural: !!nomPl,
        hasSingular: !!nomSg,
        isProperNoun: false,
        hasSpellingMutation: false,
        hasFleetingVowel: false,
        isSuppletive: false,
        isAdjectival: false
      },
      semanticTags: ["manual"],
      source: "manual",
      bucketPaths: {
        singular: (nomSg && genSg) ? [animacy, gender, 'singular', 'hard_a'] : null,
        plural: (nomPl && genPl) ? [animacy, gender, 'plural', 'hard_ov'] : null
      },
      mastery: existingWord ? { ...existingWord.mastery, contextSentences: null } : { level1_sorted: false, errorsByLevel: {}, isMastered: false, lastPracticed: null }
    };

    if (word.bucketPaths.singular) {
      if (gender === 'feminine') word.bucketPaths.singular[3] = (genSg.endsWith('и') ? 'soft_i' : 'hard_y');
      else if (gender === 'masculine' || gender === 'neuter') word.bucketPaths.singular[3] = (genSg.endsWith('я') ? 'soft_ya' : 'hard_a');
    }
    if (word.bucketPaths.plural) {
      if (genPl.endsWith('ов')) word.bucketPaths.plural[3] = 'hard_ov';
      else if (genPl.endsWith('ев')) word.bucketPaths.plural[3] = 'y_ev';
      else if (genPl.endsWith('ей')) word.bucketPaths.plural[3] = 'soft_ey';
      else if (genPl.endsWith('ий')) word.bucketPaths.plural[3] = 'iy';
      else word.bucketPaths.plural[3] = 'zero';
    }

    await saveWord(word);
    showToast('Word added/updated successfully!', 'success');
    e.target.reset();

    // PM Override: Close modal on success
    const modalOverlay = document.getElementById('manual-word-modal-overlay');
    if (modalOverlay) modalOverlay.style.display = 'none';

    renderPage();
  });

  // Sort extracted nouns
  startSortBtn?.addEventListener('click', () => {
    if (AppState.extractedNouns.length > 0) {
      startSortSession(AppState.extractedNouns);
    }
  });

  // Render sets container
  getUnsortedWords().then(unsorted => {
    getStats().then(stats => {
      renderDashboardSetsUI(unsorted, stats).then(html => {
        const container = document.getElementById('dashboard-sets-container');
        if (container) {
          container.innerHTML = html;
        }
      });

      getDueReviewCount(null).then(totalDue => {
        const ctaContainer = document.getElementById('dashboard-global-cta-container');
        if (ctaContainer) {
          if (totalDue > 0) {
            ctaContainer.innerHTML = `<button class="btn btn--primary btn--full global-drill-btn" style="padding: var(--spacing-md); font-size: 1.1rem; border-radius: var(--radius-lg); box-shadow: var(--shadow-glow);">⚡ Daily Review (${totalDue} word${totalDue === 1 ? '' : 's'} due)</button>`;
          } else {
            ctaContainer.innerHTML = `<button class="btn btn--secondary btn--full global-drill-btn" style="padding: var(--spacing-md); font-size: 1.1rem; border-radius: var(--radius-lg);" disabled>🏆 All Caught Up!</button>`;
          }
        }
      });

      renderMilestoneTracker().then(html => {
        const hmContainer = document.getElementById('dashboard-milestone-container');
        if (hmContainer) {
          hmContainer.innerHTML = html;
        }
      });
    });
  });

  // Delegate Sets interactions to avoid memory leaks
  document.getElementById('dashboard-sets-container')?.addEventListener('click', async (e) => {

    // Practice Level 1 Sorting
    if (e.target.closest('.practice-set-btn')) {
      const setId = e.target.closest('.practice-set-btn').dataset.set;
      let setUnsorted = [];
      if (setId === 'seed') {
        const unsortedAll = await getUnsortedWords();
        setUnsorted = unsortedAll.filter(w => w.source === 'seed').slice(0, 15);
      } else {
        setUnsorted = (await getUnsortedWords(setId)).slice(0, 15);
      }
      if (setUnsorted.length > 0) startSortSession(setUnsorted);
      return;
    }

    // Drill Level 2 Recall (SRS Due + Bifurcation Cram Mode)
    if (e.target.closest('.drill-set-btn')) {
      const setId = e.target.closest('.drill-set-btn').dataset.set;
      const isCramMode = e.target.closest('.drill-set-btn').textContent.includes('Cram');

      // Dynamic import of drill logic to avoid bundling circulars
      const { startDrillSession } = await import('./view-drill.js');

      AppState.currentPage = 'drill';
      document.getElementById('main-content').innerHTML = `
                 <div class="page page--active" style="display: flex; justify-content: center; align-items: center; height: 50vh;">
                     <div class="spinner"></div>
                 </div>
             `;
      const teardown = await startDrillSession(setId, isCramMode);
      setTeardown(teardown);
      return;
    }

    // Delete Entire Set
    if (e.target.closest('.delete-set-btn')) {
      if (confirm('Are you sure you want to delete this set and all its saved words?')) {
        const setId = e.target.closest('.delete-set-btn').dataset.set;
        await deleteWordSet(setId);
        showToast('Set deleted permanently.', 'success');
        renderPage();
      }
      return;
    }

    // Toggle Inline Read
    if (e.target.closest('.view-set-words-btn')) {
      const setId = e.target.closest('.view-set-words-btn').dataset.set;
      const listEl = document.getElementById(`inline-words-${setId}`);
      if (listEl) listEl.style.display = listEl.style.display === 'none' ? 'block' : 'none';
      return;
    }

    // Toggle Edit Mode
    if (e.target.closest('.edit-set-name-btn')) {
      const btn = e.target.closest('.edit-set-name-btn');
      const container = btn.parentElement;
      const titleSpan = container.querySelector('.set-title-display');
      const input = container.querySelector('.set-rename-input');

      btn.style.display = 'none';
      titleSpan.style.display = 'none';
      input.style.display = 'block';
      input.focus();
      return;
    }

    // Individual Soft Delete implementation
    if (e.target.closest('.delete-word-btn')) {
      const btn = e.target.closest('.delete-word-btn');
      const row = btn.closest('.inline-word-row');

      if (btn.dataset.deleting === 'true') {
        // Undo triggered
        clearTimeout(btn.deleteTimer);
        btn.dataset.deleting = 'false';
        btn.innerHTML = '✕';
        row.style.opacity = '1';
        return;
      }

      // Initiate soft delete
      btn.dataset.deleting = 'true';
      btn.innerHTML = 'Undo';
      row.style.opacity = '0.5';

      btn.deleteTimer = setTimeout(async () => {
        const wordId = btn.dataset.wordid;
        const setId = btn.dataset.set;
        await deleteWord(wordId, setId); // Triggers GC check

        // Partial DOM update
        row.remove();

        // Re-fetch words to see if set is empty now 
        const allSets = await getWordSets();
        const setStillExists = allSets.find(s => s.id === setId);
        if (!setStillExists) {
          renderPage(); // Cleanup if ghost set was deleted
        }
      }, 3000);
      return;
    }
  });

  // Debounce rename input using focusout and keydown
  document.getElementById('dashboard-sets-container')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('set-rename-input')) {
      e.target.blur();
    }
  });

  document.getElementById('dashboard-sets-container')?.addEventListener('focusout', (e) => {
    if (e.target.classList.contains('set-rename-input')) {
      const input = e.target;
      if (input.dataset.isSaving) return;
      input.dataset.isSaving = true;

      let newName = escapeHtml(input.value.trim());
      const setId = input.dataset.set;
      const originalName = input.dataset.original;

      const names = JSON.parse(localStorage.getItem('genitive_set_names') || '{}');

      if (!newName) {
        newName = originalName;
      } else if (newName !== originalName) {
        // Collision detection
        let isCollision = false;
        let counter = 2;
        let finalName = newName;

        const renameCollides = (checkName) => {
          for (const key in names) {
            if (key !== setId && names[key] === checkName) return true;
          }
          return false;
        };

        while (renameCollides(finalName)) {
          finalName = `${newName} (${counter})`;
          counter++;
        }
        newName = finalName;
      }

      names[setId] = newName;
      localStorage.setItem('genitive_set_names', JSON.stringify(names));

      renderPage();
    }
  });

  // --- Sprint II.b UX Patch Listeners ---

  // Global Drill CTA
  document.getElementById('page-dashboard')?.addEventListener('click', async (e) => {
    if (e.target.closest('.global-drill-btn')) {
      const { startDrillSession } = await import('./view-drill.js');
      AppState.currentPage = 'drill';
      document.getElementById('main-content').innerHTML = `
          <div class="page page--active" style="display: flex; justify-content: center; align-items: center; height: 50vh;">
              <div class="spinner"></div>
          </div>
      `;
      const teardown = await startDrillSession(null, false);
      setTeardown(teardown);
    }
  });

  // Manual Word Modal Config
  const modalBtn = document.getElementById('open-manual-word-modal-btn');
  const modalOverlay = document.getElementById('manual-word-modal-overlay');
  const modalCloseBtn = document.getElementById('close-manual-modal-btn');
  const manualForm = document.getElementById('manual-word-form');

  if (modalBtn && modalOverlay && modalCloseBtn && manualForm) {
    modalBtn.addEventListener('click', () => {
      modalOverlay.style.display = 'flex';
      setTimeout(() => document.getElementById('man-nom-sg').focus(), 50);
    });

    const closeModalSafe = () => {
      const inputs = manualForm.querySelectorAll('input[type="text"]');
      let hasData = false;
      inputs.forEach(i => { if (i.value.trim() !== '') hasData = true; });

      if (hasData) {
        if (!confirm("Discard unsaved word?")) return;
      }
      modalOverlay.style.display = 'none';
      manualForm.reset();
    };

    modalCloseBtn.addEventListener('click', closeModalSafe);

    // Click outside guard
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        closeModalSafe();
      }
    });
  }
}
