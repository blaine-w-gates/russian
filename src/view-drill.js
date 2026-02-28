import { AppState, showToast, normalizeRussianText } from './state.js';
import { getReviewQueue, updateMastery, undoStreakReset, logException, saveWord } from './db.js';
import { renderPage } from './main.js';
import { fetchContextualSentence } from './gemini.js';

// Audio Trigger Helper
function playAudio(text) {
    if (!window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ru-RU';

    // Optional: tweak rate or voice if needed
    // utterance.rate = 0.9;

    window.speechSynthesis.speak(utterance);
}

// Dual-Path Determinism: Safely pick which form to ask for
export function assignDrillTarget(word) {
    if (word.flags.hasSingular && word.flags.hasPlural) {
        return Math.random() < 0.5 ? 'singular' : 'plural';
    } else if (word.flags.hasPlural) {
        return 'plural'; // Pluralia tantum like "деньги"
    } else {
        return 'singular'; // Singularia tantum or defaults
    }
}

// State container for the active drill session
export const DrillState = {
    active: false,
    queue: [],
    currentIndex: 0,
    currentWord: null,
    targetNumber: 'singular',
    currentStreak: 0,
    startTime: null,
    results: {
        correct: 0,
        incorrect: 0
    },
    // Typo guard backup state
    lastProcessedWordId: null,
    // Sprint III: Contextual Sentence abort controller
    abortController: null
};

export async function startDrillSession(setId = null, forceCram = false) {
    const words = await getReviewQueue(setId, forceCram);

    if (words.length === 0) {
        if (!forceCram) {
            showToast("No words due for review yet! Come back later or use Cram Mode.", "info");
        } else {
            showToast("No words available to practice in this set.", "info");
        }
        return;
    }

    DrillState.active = true;
    DrillState.queue = words;
    DrillState.currentIndex = 0;
    DrillState.currentStreak = 0;
    DrillState.startTime = Date.now();
    DrillState.results = { correct: 0, incorrect: 0 };
    DrillState.lastProcessedWordId = null;

    advanceDrill();
}

function advanceDrill() {
    // Cancel any inflight API requests from previous word
    if (DrillState.abortController) {
        DrillState.abortController.abort();
    }

    if (DrillState.currentIndex >= DrillState.queue.length) {
        endDrillSession();
        return;
    }

    DrillState.currentWord = DrillState.queue[DrillState.currentIndex];
    DrillState.targetNumber = assignDrillTarget(DrillState.currentWord);

    renderDrillScreen();
}

function renderDrillScreen() {
    const content = document.getElementById('main-content');
    const word = DrillState.currentWord;
    const isPluralTarget = DrillState.targetNumber === 'plural';

    const promptWord = isPluralTarget ? word.nominative_pl : word.nominative_sg;
    const targetString = isPluralTarget ? word.genitive_pl : word.genitive_sg;

    // Safety fallback
    if (!promptWord || !targetString) {
        console.error("Missing DB forms for word:", word);
        // Skip it and move on
        DrillState.currentIndex++;
        advanceDrill();
        return;
    }

    content.innerHTML = `
        <div class="page page--active" id="page-drill" style="height: 100vh; display: flex; flex-direction: column;">
             <div class="drill-header" style="display: flex; justify-content: space-between; align-items: center; padding: var(--spacing-md); border-bottom: 1px solid var(--border-subtle);">
                <button class="btn btn--secondary btn--sm" id="drill-back">← Dashboard</button>
                <div style="font-weight: 600; color: var(--text-secondary);">
                    Word ${DrillState.currentIndex + 1} of ${DrillState.queue.length}
                </div>
                <div style="font-weight: bold; color: var(--accent-primary);">
                    🔥 Streak: ${DrillState.currentStreak}
                </div>
             </div>
             
             <div class="drill-body" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: var(--spacing-xl);">
                 
                 <div class="drill-card" style="background: var(--surface-2); padding: var(--spacing-xl); border-radius: var(--radius-lg); text-align: center; width: 100%; max-width: 500px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                      
                      <div style="color: var(--text-muted); text-transform: uppercase; font-size: 0.8rem; letter-spacing: 0.05em; margin-bottom: var(--spacing-md);">
                          Genitive ${isPluralTarget ? 'Plural' : 'Singular'}
                      </div>
                      
                      <div style="font-size: 2.5rem; font-weight: 800; font-family: var(--font-russian); margin-bottom: var(--spacing-sm);">
                          ${promptWord}
                      </div>
                      
                      ${AppState.settings.showTranslations ? `<div style="color: var(--text-secondary); font-size: 1.1rem; margin-bottom: var(--spacing-lg);">${word.translation_en || ''}</div>` : ''}
                      
                      <form id="drill-form" style="width: 100%; display: flex; flex-direction: column; gap: var(--spacing-md);">
                          <input type="text" id="drill-input" class="text-input" style="font-size: 1.5rem; text-align: center; padding: var(--spacing-md);" 
                                 autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false"
                                 placeholder="Type the genitive form...">
                          
                          <button type="submit" class="btn btn--primary btn--full" style="font-size: 1.2rem; padding: var(--spacing-md);">Check</button>
                      </form>

                 </div>
                 
                 <div id="drill-feedback-container" style="margin-top: var(--spacing-xl); width: 100%; max-width: 500px;"></div>

             </div>
        </div>
    `;

    setupDrillInteractions(word, targetString);
    loadContextualSentence(word, DrillState.targetNumber);
}

async function loadContextualSentence(word, targetForm) {
    if (!AppState.apiKey) return;

    const fb = document.getElementById('drill-feedback-container');

    // Sprint II.b Deep Cache Check
    if (word.mastery.contextSentences && word.mastery.contextSentences[targetForm]) {
        const cachedData = word.mastery.contextSentences[targetForm];
        if (fb) {
            fb.innerHTML = `
                <div style="padding: var(--spacing-md); border-radius: var(--radius-sm); background: var(--surface-card); border-left: 3px solid var(--brand-primary); box-shadow: var(--shadow-sm);">
                    <div style="font-family: var(--font-russian); font-size: 1.05rem; margin-bottom: 4px; color: var(--text-primary);">
                        ${cachedData.russian}
                    </div>
                    <div style="font-size: 0.9rem; color: var(--text-secondary); font-style: italic;">
                        "${cachedData.english}"
                    </div>
                </div>
            `;
        }
        return;
    }

    DrillState.abortController = new AbortController();

    // Inject loading skeleton
    if (!fb || fb.innerHTML.trim() !== "") return; // Don't overwrite error states

    fb.innerHTML = `
        <div style="padding: var(--spacing-md); border-radius: var(--radius-sm); background: rgba(0,0,0,0.05); text-align: center;">
            <span class="spinner" style="vertical-align: middle; margin-right: 8px;"></span> 
            <span style="color: var(--text-muted); font-size: 0.9rem;">Generating context sentence...</span>
        </div>
    `;

    try {
        const sentenceData = await fetchContextualSentence(word, targetForm, DrillState.abortController.signal, AppState.apiKey);

        // Re-check DOM existence in case user navigated away during fetch
        const fbCurrent = document.getElementById('drill-feedback-container');
        if (!fbCurrent || DrillState.active === false || DrillState.currentWord?.wordId !== word.wordId) return;

        if (sentenceData) {
            // Save valid sentence to persistent specific-form cache
            if (!word.mastery.contextSentences) word.mastery.contextSentences = {};
            word.mastery.contextSentences[targetForm] = sentenceData;
            saveWord(word).catch(e => console.error('Failed to cache sentence:', e));

            fbCurrent.innerHTML = `
                <div style="padding: var(--spacing-md); border-radius: var(--radius-sm); background: var(--surface-card); border-left: 3px solid var(--brand-primary); box-shadow: var(--shadow-sm);">
                    <div style="font-family: var(--font-russian); font-size: 1.05rem; margin-bottom: 4px; color: var(--text-primary);">
                        ${sentenceData.russian}
                    </div>
                    <div style="font-size: 0.9rem; color: var(--text-secondary); font-style: italic;">
                        "${sentenceData.english}"
                    </div>
                </div>
            `;
        } else {
            fbCurrent.innerHTML = ``; // Hide cleanly on failure
        }

    } catch (err) {
        if (err.name === 'AbortError') return; // Expected during rapid progression
        const fbCurrent = document.getElementById('drill-feedback-container');
        if (fbCurrent) fbCurrent.innerHTML = ``;
    }
}

function setupDrillInteractions(word, targetString) {
    const backBtn = document.getElementById('drill-back');
    const form = document.getElementById('drill-form');
    const input = document.getElementById('drill-input');

    // Auto-Focus Race Guard
    if (input) {
        requestAnimationFrame(() => {
            setTimeout(() => input.focus(), 150);
        });
    }

    backBtn?.addEventListener('click', () => {
        if (DrillState.abortController) DrillState.abortController.abort();
        DrillState.active = false;
        AppState.currentPage = 'dashboard';
        renderPage();
    });

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userInput = input.value;
        if (!userInput.trim()) return; // ignore empty submits

        await processDrillResult(word, userInput, targetString);
    });
}

async function processDrillResult(word, userInput, targetString) {
    const isCorrect = normalizeRussianText(userInput) === normalizeRussianText(targetString);

    // Disable inputs during processing
    const input = document.getElementById('drill-input');
    const submitBtn = document.querySelector('#drill-form button');
    if (input) input.disabled = true;
    if (submitBtn) submitBtn.disabled = true;

    // Backup current streak state before DB update for Typo Guard
    word.mastery._backupStreak = word.mastery.level2_streak;
    word.mastery._backupNextReview = word.mastery.nextReviewDate;

    // Update DB
    await updateMastery(word.wordId, isCorrect);
    DrillState.lastProcessedWordId = word.wordId;

    if (isCorrect) {
        DrillState.results.correct++;
        DrillState.currentStreak++;
        playAudio(targetString);

        // Visual celebration
        input.style.backgroundColor = 'rgba(46, 204, 113, 0.2)';
        input.style.borderColor = 'var(--accent-primary)';
        input.style.color = 'var(--accent-primary)';

        setTimeout(() => {
            DrillState.currentIndex++;
            advanceDrill();
        }, 800);

    } else {
        DrillState.results.incorrect++;
        DrillState.currentStreak = 0; // Local counter reset

        const feedbackContainer = document.getElementById('drill-feedback-container');

        // Overwrite the contextual sentence area completely with the Error Card
        if (DrillState.abortController) DrillState.abortController.abort();

        feedbackContainer.innerHTML = `
              <div class="card" style="border: 2px solid var(--accent-error); background: rgba(239, 68, 68, 0.05);">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--spacing-md);">
                      <h3 style="color: var(--accent-error); margin: 0;">Incorrect</h3>
                      <button class="btn btn--secondary btn--sm" id="drill-report-btn">⚠ Report Error</button>
                  </div>
                  
                  <div style="margin-bottom: var(--spacing-md); font-size: 1.1rem;">
                      <div style="color: var(--text-muted); font-size: 0.9rem;">You typed:</div>
                      <div style="text-decoration: line-through; color: var(--accent-error); margin-bottom: var(--spacing-sm);">${userInput}</div>
                      
                      <div style="color: var(--text-muted); font-size: 0.9rem;">Expected:</div>
                      <div style="font-weight: bold; color: var(--accent-primary); font-family: var(--font-russian); font-size: 1.3rem;">
                          ${targetString}
                          <button id="drill-audio-btn" style="background:none; border:none; cursor:pointer; font-size:1.2rem; margin-left:8px;" title="Listen">🔊</button>
                      </div>
                  </div>
                  
                  <div style="display: flex; gap: var(--spacing-sm); flex-direction: column;">
                      <button id="btn-next-word" class="btn btn--primary btn--full">Continue →</button>
                      <button id="btn-typo-guard" class="btn btn--outline btn--full" style="border-color: var(--text-muted); color: var(--text-secondary);">
                         Undo Mistake (Oops, I mistyped!)
                      </button>
                  </div>
              </div>
         `;

        // Bind Listeners
        document.getElementById('drill-audio-btn')?.addEventListener('click', () => playAudio(targetString));

        document.getElementById('btn-next-word')?.addEventListener('click', () => {
            DrillState.currentIndex++;
            advanceDrill();
        });

        document.getElementById('btn-typo-guard')?.addEventListener('click', async () => {
            // Rollback the DB
            await undoStreakReset(word.wordId);

            // Fix local stats
            DrillState.results.incorrect--;
            DrillState.currentStreak = word.mastery._backupStreak; // Restore run streak

            showToast("Streak restored. Let's try that again!", "success");

            // Re-render same card
            renderDrillScreen();
        });

        // Exception Reporting
        document.getElementById('drill-report-btn')?.addEventListener('click', () => {
            logException({
                wordId: word.wordId,
                nominative: word.nominative_sg,
                targetForm: targetString,
                userAnswer: userInput,
                type: 'database_error_reported'
            });
            showToast("Report sent to engineering.", "success");
        });
    }
}

function endDrillSession() {
    const content = document.getElementById('main-content');
    const total = DrillState.results.correct + DrillState.results.incorrect;
    const accuracy = total > 0 ? Math.round((DrillState.results.correct / total) * 100) : 0;

    content.innerHTML = `
        <div class="page page--active" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh;">
            <div class="summary" style="max-width: 500px; width: 100%; text-align: center;">
                 <div style="font-size: 4rem; margin-bottom: var(--spacing-md);">🏆</div>
                 <h2 style="font-size: 2rem; margin-bottom: var(--spacing-xl);">Drill Complete!</h2>
                 
                 <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-md); margin-bottom: var(--spacing-xl);">
                      <div class="stat-card">
                          <div class="stat-card__value" style="color: var(--accent-primary);">${accuracy}%</div>
                          <div class="stat-card__label">Accuracy</div>
                      </div>
                      <div class="stat-card">
                          <div class="stat-card__value">🔥 ${DrillState.currentStreak}</div>
                          <div class="stat-card__label">Final Streak</div>
                      </div>
                 </div>
                 
                 <button class="btn btn--primary btn--full" id="drill-finish">Return to Dashboard</button>
            </div>
        </div>
    `;

    document.getElementById('drill-finish')?.addEventListener('click', () => {
        DrillState.active = false;
        AppState.currentPage = 'dashboard';
        renderPage();
    });

    // Provide cleanup function for App Shell tear-down
    return function drillTeardown() {
        if (DrillState.abortController) DrillState.abortController.abort();
        DrillState.active = false;
    };
}
