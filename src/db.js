// Database module — IndexedDB via idb
import { openDB } from 'idb';
import { SEED_DATA } from './seed-data.js';

const DB_NAME = 'genitive-lab';
const DB_VERSION = 3; // Bumped for Sprint III Activity Logs

let dbInstance = null;

export async function getDB() {
    if (dbInstance) return dbInstance;

    dbInstance = await openDB(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion, newVersion, transaction) {
            let store;
            // V1 & V2 schema
            if (!db.objectStoreNames.contains('words')) {
                store = db.createObjectStore('words', { keyPath: 'wordId' });
            } else {
                store = transaction.objectStore('words');
            }
            if (!db.objectStoreNames.contains('exceptions')) {
                db.createObjectStore('exceptions', { keyPath: 'id', autoIncrement: true });
            }
            // Level 2 SRS Index
            if (oldVersion < 2 && store) {
                if (!store.indexNames.contains('nextReviewIdx')) {
                    store.createIndex('nextReviewIdx', 'mastery.nextReviewDate');
                }
            }
            // V3 Activity Logs Store
            if (oldVersion < 3) {
                if (!db.objectStoreNames.contains('activityLogs')) {
                    db.createObjectStore('activityLogs', { keyPath: 'date' });
                }
            }
        }
    });

    return dbInstance;
}

// Seed database on first launch
export async function seedIfEmpty() {
    const db = await getDB();
    const count = await db.count('words');
    if (count === 0) {
        const tx = db.transaction('words', 'readwrite');
        for (const word of SEED_DATA) {
            await tx.store.put(word);
        }
        await tx.done;
        console.log(`[DB] Seeded ${SEED_DATA.length} words`);
    }
    return count === 0;
}

// Force reseed from SEED_DATA (Sprint G)
export async function reseedFromSource() {
    const db = await getDB();
    const tx = db.transaction('words', 'readwrite');
    let added = 0;
    let updated = 0;
    for (const word of SEED_DATA) {
        const existing = await tx.store.get(word.wordId);
        if (existing) {
            // Preserve mastery progress if it already exists
            word.mastery = existing.mastery;
            updated++;
        } else {
            added++;
        }
        await tx.store.put(word);
    }
    await tx.done;
    console.log(`[DB] Reseeded from source: ${added} added, ${updated} updated.`);
    return { added, updated };
}

// Level 2 Upgrade: Initialize SRS fields for all previously sorted Level 1 words
export async function migrateToLevel2() {
    const db = await getDB();
    const tx = db.transaction('words', 'readwrite');
    const allWords = await tx.store.getAll();
    let migrated = 0;

    for (const word of allWords) {
        if (word.mastery.level1_sorted && word.mastery.level2_streak === undefined) {
            // It's mapped, so it's eligible to be reviewed NOW
            word.mastery.level2_streak = 0;
            // Set due date to 1 second ago so it queries as "due" immediately
            word.mastery.nextReviewDate = Date.now() - 1000;
            await tx.store.put(word);
            migrated++;
        }
    }
    await tx.done;
    if (migrated > 0) {
        console.log(`[DB] Level 2 Migration Configured ${migrated} existing words.`);
    }
    return migrated;
}

// Get all words
export async function getAllWords() {
    const db = await getDB();
    return db.getAll('words');
}

// Get a single word
export async function getWord(wordId) {
    const db = await getDB();
    return db.get('words', wordId);
}

// Save/update a word with Seed Override Firewall
export async function saveWord(word) {
    const db = await getDB();
    const tx = db.transaction('words', 'readwrite');
    const existing = await tx.store.get(word.wordId);

    if (existing && existing.source === 'seed') {
        // Firewall: Silently drop mutation of core properties.
        const updated = { ...existing };
        if (word.wordSetId) updated.wordSetId = word.wordSetId;
        if (word.mastery) updated.mastery = word.mastery;
        if (word.translation_en) updated.translation_en = word.translation_en;
        await tx.store.put(updated);
    } else {
        await tx.store.put(word);
    }
    await tx.done;
}

// Delete a single word with GC and firewall
export async function deleteWord(wordId, wordSetId) {
    const db = await getDB();
    const tx = db.transaction('words', 'readwrite');
    const word = await tx.store.get(wordId);

    if (word && word.source === 'seed') {
        throw new Error("Core textbook vocabulary cannot be deleted.");
    }

    tx.store.delete(wordId); // Queue deletion without awaiting to keep tx active

    if (wordSetId && wordSetId.startsWith('set-')) {
        const allWords = await tx.store.getAll();
        const setStillExists = allWords.some(w => w.wordSetId === wordSetId && w.wordId !== wordId);

        if (!setStillExists) {
            const names = JSON.parse(localStorage.getItem('genitive_set_names') || '{}');
            if (names[wordSetId]) {
                delete names[wordSetId];
                localStorage.setItem('genitive_set_names', JSON.stringify(names));
            }
        }
    }
    await tx.done;
}

// Bulk Edit mechanism (Sprint III)
export async function bulkAction(wordIds, action, targetSetId = null) {
    const db = await getDB();
    const tx = db.transaction('words', 'readwrite');
    let processed = 0;

    for (const wordId of wordIds) {
        const word = await tx.store.get(wordId);
        if (!word) continue;

        // FIREWALL: Protect Core Vocabulary
        if (word.source === 'seed') {
            console.warn(`[Firewall] Blocked bulk ${action} on seed word: ${wordId}`);
            continue;
        }

        if (action === 'delete') {
            await tx.store.delete(wordId);
            processed++;
        } else if (action === 'move') {
            word.wordSetId = targetSetId;
            await tx.store.put(word);
            processed++;
        }
    }

    await tx.done;
    return processed;
}

// Add multiple words (from Gemini extraction) with Seed Override Firewall
export async function addWords(words) {
    const db = await getDB();
    const tx = db.transaction('words', 'readwrite');
    const existingIds = new Set((await tx.store.getAllKeys()));
    let added = 0;

    for (const word of words) {
        if (!existingIds.has(word.wordId)) {
            await tx.store.put(word);
            added++;
        } else {
            const existing = await tx.store.get(word.wordId);
            if (existing && existing.source === 'seed') {
                // Firewall: Silently drop mutation of core properties.
                const updated = { ...existing };
                if (word.wordSetId) updated.wordSetId = word.wordSetId;
                if (word.mastery) updated.mastery = word.mastery;
                if (word.translation_en) updated.translation_en = word.translation_en;
                await tx.store.put(updated);
            }
        }
    }
    await tx.done;
    return added;
}

// Get words that haven't been sorted yet
export async function getUnsortedWords(wordSetId = null) {
    const all = await getAllWords();
    let unsorted = all.filter(w => !w.mastery.level1_sorted);
    if (wordSetId) {
        unsorted = unsorted.filter(w => w.wordSetId === wordSetId);
    }
    return unsorted;
}

// Get word sets (grouped extractions and manual)
export async function getWordSets() {
    const all = await getAllWords();
    const sets = {};
    const names = JSON.parse(localStorage.getItem('genitive_set_names') || '{}');
    for (const word of all) {
        if (word.wordSetId && word.wordSetId.startsWith('set-')) {
            if (!sets[word.wordSetId]) {
                sets[word.wordSetId] = {
                    id: word.wordSetId,
                    title: names[word.wordSetId] || `Extracted Set (${new Date(parseInt(word.wordSetId.split('-')[1])).toLocaleDateString()})`,
                    words: [],
                    sortedCount: 0
                };
            }
            sets[word.wordSetId].words.push(word);
            if (word.mastery.level1_sorted) sets[word.wordSetId].sortedCount++;
        } else if (word.wordSetId === 'manual-added') {
            if (!sets['manual-added']) {
                sets['manual-added'] = {
                    id: 'manual-added',
                    title: '✍️ Manually Added Words',
                    words: [],
                    sortedCount: 0,
                    isManual: true
                };
            }
            sets['manual-added'].words.push(word);
            if (word.mastery.level1_sorted) sets['manual-added'].sortedCount++;
        }
    }

    // Sort array: Put manual added first if it exists, then sort the rest by most recent
    return Object.values(sets).sort((a, b) => {
        if (a.id === 'manual-added') return -1;
        if (b.id === 'manual-added') return 1;
        return b.id.localeCompare(a.id);
    });
}

// Delete an entire word set
export async function deleteWordSet(setId) {
    const db = await getDB();
    const tx = db.transaction('words', 'readwrite');
    const allWords = await tx.store.getAll(); // Fetch all upfront
    let deleted = 0;

    for (const word of allWords) {
        if (word.wordSetId === setId) {
            tx.store.delete(word.wordId); // Queue without awaiting inside loop
            deleted++;
        }
    }
    await tx.done;

    // Cleanup custom name
    const names = JSON.parse(localStorage.getItem('genitive_set_names') || '{}');
    if (names[setId]) {
        delete names[setId];
        localStorage.setItem('genitive_set_names', JSON.stringify(names));
    }

    return deleted;
}

// Get words grouped by their bucket path
export async function getWordsByBucket() {
    const all = await getAllWords();
    const sorted = all.filter(w => w.mastery.level1_sorted);
    const groups = {};

    for (const word of sorted) {
        // Fallback for legacy data before Sprint A resourced words
        if (word.bucketPath && !word.bucketPaths) {
            const key = word.bucketPath.join(' → ');
            if (!groups[key]) {
                groups[key] = { path: word.bucketPath, words: [] };
            }
            groups[key].words.push({ ...word, _displayNumber: 'singular' });
            continue;
        }

        // Handle dual paths
        if (word.bucketPaths) {
            if (word.bucketPaths.singular) {
                const keySg = word.bucketPaths.singular.join(' → ');
                if (!groups[keySg]) groups[keySg] = { path: word.bucketPaths.singular, words: [] };
                groups[keySg].words.push({ ...word, _displayNumber: 'singular' });
            }
            if (word.bucketPaths.plural) {
                const keyPl = word.bucketPaths.plural.join(' → ');
                if (!groups[keyPl]) groups[keyPl] = { path: word.bucketPaths.plural, words: [] };
                groups[keyPl].words.push({ ...word, _displayNumber: 'plural' });
            }
        }
    }

    return groups;
}

// Mark a word as sorted
export async function markWordSorted(wordId) {
    const word = await getWord(wordId);
    if (word) {
        word.mastery.level1_sorted = true;
        word.mastery.lastPracticed = Date.now();
        // Initialize for Level 2 so it shows up in Review Queue immediately
        word.mastery.level2_streak = 0;
        word.mastery.nextReviewDate = Date.now() - 1000;
        await saveWord(word);
        await incrementDailyActivity('sort');
    }
}

// Update Mastery metrics post-drill (Level 2)
export async function updateMastery(wordId, isCorrect) {
    const word = await getWord(wordId);
    if (!word) return;

    if (word.mastery.level2_streak === undefined) {
        word.mastery.level2_streak = 0;
    }

    const intervals = [1, 3, 7, 30]; // Days

    if (isCorrect) {
        if (word.mastery.level2_streak < intervals.length - 1) {
            word.mastery.level2_streak++;
        } else {
            word.mastery.isMastered = true;
        }
    } else {
        word.mastery.level2_streak = 0; // Penalty
    }

    const currentIntervalDays = intervals[word.mastery.level2_streak] || intervals[intervals.length - 1];
    word.mastery.nextReviewDate = Date.now() + (currentIntervalDays * 86400000);

    if (isNaN(word.mastery.nextReviewDate)) {
        console.error("[DB] SRS Math failed for:", word.nominative_sg);
        word.mastery.nextReviewDate = Date.now();
    }
    word.mastery.lastPracticed = Date.now();

    await saveWord(word);

    // Log Activity
    await incrementDailyActivity('drill');

    return word;
}

// Cancel a streak reset if the user mistyped
export async function undoStreakReset(wordId) {
    const word = await getWord(wordId);
    if (word && word.mastery._backupStreak !== undefined) {
        word.mastery.level2_streak = word.mastery._backupStreak;
        word.mastery.nextReviewDate = word.mastery._backupNextReview;
        delete word.mastery._backupStreak;
        delete word.mastery._backupNextReview;
        await saveWord(word);
    }
}

// Log an exception report
export async function logException(data) {
    const db = await getDB();
    await db.add('exceptions', {
        ...data,
        timestamp: new Date().toISOString()
    });

    // Fire-and-forget webhook if configured
    const webhookUrl = localStorage.getItem('exception_webhook_url');
    if (webhookUrl) {
        fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }).catch(() => { }); // Silent fail
    }
}

// Get all exception reports
export async function getExceptions() {
    const db = await getDB();
    return db.getAll('exceptions');
}

// Get stats
export async function getStats() {
    const all = await getAllWords();
    const sorted = all.filter(w => w.mastery.level1_sorted);
    const mastered = all.filter(w => w.mastery.isMastered);

    return {
        total: all.length,
        sorted: sorted.length,
        mastered: mastered.length,
        seedCount: all.filter(w => w.source === 'seed').length,
        extractedCount: all.filter(w => w.source === 'gemini').length
    };
}

// Export all data as JSON
export async function exportData() {
    const words = await getAllWords();
    const exceptions = await getExceptions();
    const db = await getDB();
    const activityLogs = await db.getAll('activityLogs');
    const data = {
        words,
        exceptions,
        activityLogs,
        exportDate: new Date().toISOString(),
        version: 1,
        genitive_set_names: JSON.parse(localStorage.getItem('genitive_set_names') || '{}')
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `genitive - lab -export -${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// Import data from JSON
export async function importData(jsonData) {
    const db = await getDB();
    if (jsonData.words && Array.isArray(jsonData.words)) {
        const tx = db.transaction('words', 'readwrite');
        for (const word of jsonData.words) {
            await tx.store.put(word);
        }
        await tx.done;
    }

    if (jsonData.activityLogs && Array.isArray(jsonData.activityLogs)) {
        const tx = db.transaction('activityLogs', 'readwrite');
        for (const importedLog of jsonData.activityLogs) {

            // Safe legacy initialization on imported data
            if (typeof importedLog.sortCount === 'undefined') importedLog.sortCount = 0;
            if (typeof importedLog.drillCount === 'undefined') importedLog.drillCount = 0;

            const existingLog = await tx.store.get(importedLog.date);
            if (!existingLog) {
                await tx.store.put(importedLog);
            } else {
                // Collision: keep the one with the higher 'count'
                if (importedLog.count > existingLog.count) {
                    await tx.store.put(importedLog);
                }
            }
        }
        await tx.done;
    }

    if (jsonData.genitive_set_names) {
        const existing = JSON.parse(localStorage.getItem('genitive_set_names') || '{}');
        const merged = { ...existing, ...jsonData.genitive_set_names };
        localStorage.setItem('genitive_set_names', JSON.stringify(merged));
    }
}

// Get the Due vocabulary count for the dashboard
export async function getDueReviewCount(setId = null) {
    const db = await getDB();
    const now = Date.now();
    let count = 0;

    // Use the optimized Index (performance fix for Engineer)
    const tx = db.transaction('words', 'readonly');
    const index = tx.store.index('nextReviewIdx');

    // IDB key range: everything where nextReviewDate < now
    const range = IDBKeyRange.upperBound(now);

    let cursor = await index.openCursor(range);
    while (cursor) {
        const w = cursor.value;
        if (w.mastery.level1_sorted && !w.mastery.isMastered) {
            if (!setId || w.wordSetId === setId || (!w.wordSetId && setId === 'seed')) {
                count++;
            }
        }
        cursor = await cursor.continue();
    }
    return count;
}

// Get SRS review queue, scoped to a specific set
export async function getReviewQueue(setId = null, forceCram = false) {
    const db = await getDB();
    const now = Date.now();
    const tx = db.transaction('words', 'readonly');
    let words = [];

    if (forceCram) {
        // "I don't care about due dates, I just want to practice these words" (Bifurcation requested by Engineer)
        words = await tx.store.getAll();
        words = words.filter(w => w.mastery.level1_sorted && !w.mastery.isMastered);
    } else {
        // Optimized fetch Using index
        const index = tx.store.index('nextReviewIdx');
        const range = IDBKeyRange.upperBound(now);
        let cursor = await index.openCursor(range);
        while (cursor) {
            if (cursor.value.mastery.level1_sorted && !cursor.value.mastery.isMastered) {
                words.push(cursor.value);
            }
            cursor = await cursor.continue();
        }
    }

    if (setId) {
        if (setId === 'seed') {
            words = words.filter(w => !w.wordSetId || !w.wordSetId.startsWith('set-'));
        } else {
            words = words.filter(w => w.wordSetId === setId);
        }
    }

    // Sort so most overdue show first
    if (!forceCram) {
        words.sort((a, b) => a.mastery.nextReviewDate - b.mastery.nextReviewDate);
    } else {
        // Cram mode gets shuffled
        words.sort(() => Math.random() - 0.5);
    }

    // Limit batch sizes for UX (maybe 15 words max per sprint)
    return words.slice(0, 15);
}

// ═══════════════════════════════════════════
// ACTIVITY HEATMAP (SPRINT III) & GAMIFICATION
// ═══════════════════════════════════════════

export async function calculateMilestones(customTx = null) {
    const db = await getDB();
    const tx = customTx || db.transaction('activityLogs', 'readonly');

    // Get stats object where trophies are stored
    const stats = await tx.store.get('USER_STATS') || { date: 'USER_STATS', totalTrophies: 0 };

    // Time-window calculation: current week + 4 prior weeks
    const now = new Date();
    // Shift to Monday as start of week
    const currentDay = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const currentMonday = new Date(now);
    currentMonday.setDate(now.getDate() - currentDay);
    currentMonday.setHours(0, 0, 0, 0);
    const currentMondayStr = `${currentMonday.getFullYear()}-${String(currentMonday.getMonth() + 1).padStart(2, '0')}-${String(currentMonday.getDate()).padStart(2, '0')}`;

    let cursor = await tx.store.openCursor();

    const weeksMap = new Map();
    weeksMap.set(currentMondayStr, 0);

    while (cursor) {
        const log = cursor.value;
        if (log.date !== 'USER_STATS' && log.drillCount > 0) {
            const [y, m, d] = log.date.split('-');
            const logDateObj = new Date(y, m - 1, d, 12, 0, 0);

            if (logDateObj <= now) {
                const logDay = logDateObj.getDay() === 0 ? 6 : logDateObj.getDay() - 1;
                const logMon = new Date(logDateObj);
                logMon.setDate(logDateObj.getDate() - logDay);
                const weekKey = `${logMon.getFullYear()}-${String(logMon.getMonth() + 1).padStart(2, '0')}-${String(logMon.getDate()).padStart(2, '0')}`;

                weeksMap.set(weekKey, (weeksMap.get(weekKey) || 0) + 1);
            }
        }
        cursor = await cursor.continue();
    }

    const dailyBoxes = weeksMap.get(currentMondayStr) || 0;

    let weeklyBoxes = 0;
    let checkDateObj = new Date(currentMonday);

    while (true) {
        const key = `${checkDateObj.getFullYear()}-${String(checkDateObj.getMonth() + 1).padStart(2, '0')}-${String(checkDateObj.getDate()).padStart(2, '0')}`;
        const count = weeksMap.get(key) || 0;

        if (count >= 4) {
            weeklyBoxes++;
        } else {
            if (key !== currentMondayStr) {
                break;
            }
        }
        checkDateObj.setDate(checkDateObj.getDate() - 7);
    }

    return {
        dailyBoxes: Math.min(dailyBoxes, 4),
        weeklyBoxes: weeklyBoxes % 4,
        totalTrophies: stats.totalTrophies || 0,
        rawWeeklyBoxes: weeklyBoxes
    };
}

export async function incrementDailyActivity(actionType = 'general') {
    const db = await getDB();

    // Timezone-safe local YYYY-MM-DD
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const localDateStr = `${year}-${month}-${day}`;

    const tx = db.transaction('activityLogs', 'readwrite');
    let log = await tx.store.get(localDateStr);

    if (!log) {
        log = { date: localDateStr, count: 0, sortCount: 0, drillCount: 0 };
    } else {
        // Safe legacy initialization
        if (typeof log.sortCount === 'undefined') log.sortCount = 0;
        if (typeof log.drillCount === 'undefined') log.drillCount = 0;
    }

    log.count++;
    if (actionType === 'sort') log.sortCount++;

    let isNewDrillDay = false;
    if (actionType === 'drill') {
        if (log.drillCount === 0) isNewDrillDay = true;
        log.drillCount++;
    }

    await tx.store.put(log); // Save log immediately so calculateMilestones sees it

    // TROPHY RACE CONDITION GUARD
    // Atomic Trophy calculation securely inside the IDB write transaction
    if (actionType === 'drill') {
        const milestones = await calculateMilestones(tx);

        if (milestones.rawWeeklyBoxes > 0 && milestones.rawWeeklyBoxes % 4 === 0 && milestones.dailyBoxes === 4) {
            // They just hit exactly the 4th day of the 4th week!
            let stats = await tx.store.get('USER_STATS') || { date: 'USER_STATS', totalTrophies: 0 };

            // Re-evaluate to prevent duplicate trophy for same milestone
            const milestoneKey = `milestone_${localDateStr}`;
            if (stats.lastMilestone !== milestoneKey) {
                stats.totalTrophies++;
                stats.lastMilestone = milestoneKey;
                await tx.store.put(stats);
                console.log(`[Gamification] Trophy Unlocked! Total: ${stats.totalTrophies}`);
            }
        }
    }

    await tx.done;
}

export async function getYearlyActivity() {
    const db = await getDB();
    const logs = await db.getAll('activityLogs');
    const map = new Map();
    for (const log of logs) {
        map.set(log.date, log); // Return full object, not just count
    }
    return map;
}

export async function getStreakStats() {
    const db = await getDB();
    const logs = await db.getAll('activityLogs');

    if (logs.length === 0) return { currentStreak: 0, longestStreak: 0 };

    // Sort logs descending by date
    logs.sort((a, b) => b.date.localeCompare(a.date));

    // Get today's local date string
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayObj = new Date(todayStr + 'T00:00:00'); // Force local midnight

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let lastDateObj = null;

    // Helper: Does this log qualify for a streak? (Must be Drill, unless legacy)
    const qualifiesForStreak = (log) => {
        if (typeof log.drillCount !== 'undefined') {
            return log.drillCount > 0;
        }
        return log.count > 0; // Legacy fallback
    };

    // Calculate Longest Streak
    for (let i = logs.length - 1; i >= 0; i--) {
        const log = logs[i];
        if (qualifiesForStreak(log)) {
            const currentObj = new Date(log.date + 'T00:00:00');
            if (!lastDateObj) {
                tempStreak = 1;
            } else {
                const diffTime = currentObj - lastDateObj;
                const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays === 1) {
                    tempStreak++;
                } else if (diffDays > 1) {
                    tempStreak = 1; // broken streak
                }
            }
            longestStreak = Math.max(longestStreak, tempStreak);
            lastDateObj = currentObj;
        }
    }

    // Calculate Current Streak
    const mostRecentLog = logs.find(log => qualifiesForStreak(log));
    if (mostRecentLog) {
        const mostRecentObj = new Date(mostRecentLog.date + 'T00:00:00');
        const diffTime = todayObj - mostRecentObj;
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 1) {
            // Started today or yesterday, streak is alive
            let checkDateObj = new Date(mostRecentObj.getTime()); // DEEP CLONE to prevent mutation!
            currentStreak = 0;

            for (const log of logs) {
                if (!qualifiesForStreak(log)) continue;
                const logDateObj = new Date(log.date + 'T00:00:00');
                const walkDiff = Math.round((checkDateObj - logDateObj) / (1000 * 60 * 60 * 24));

                if (walkDiff === 0) {
                    currentStreak++; // Hit
                    checkDateObj.setDate(checkDateObj.getDate() - 1); // Mutating the clone is safe
                } else if (walkDiff > 0) {
                    break; // Missed a day
                }
            }
        }
    }

    return { currentStreak, longestStreak };
}
