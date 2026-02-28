// Gemini API integration — noun extraction pipeline

const SYSTEM_PROMPT = `You are an expert Russian linguistic analyzer. Extract all unique nouns from the provided text or image. Lemmatize them and return a strict JSON array of objects. Do not include markdown formatting.
For each noun, generate this exact schema:
{
"wordId": "generate_a_unique_uuid",
"type": "noun",
"nominative_sg": "String or null if pluralia tantum",
"nominative_pl": "String or null if singularia tantum",
"genitive_sg": "String or null",
"genitive_pl": "String or null",
"gender": "masculine|feminine|neuter|null",
"animacy": "animate|inanimate",
"stemType": "noun",
"genitiveSgEnding": "Last 1-2 letters of genitive singular (e.g., 'а', 'я', 'и', 'ы') or null",
"genitivePlEnding": "Last 1-2 letters of genitive plural (e.g., 'ов', 'ей', 'ев') or 'zero' for ∅, or null",
"flags": {
"isIndeclinable": boolean,
"hasPlural": boolean,
"hasSingular": boolean,
"isProperNoun": boolean,
"hasSpellingMutation": boolean (true if 7-letter rule applies),
"hasFleetingVowel": boolean,
"isSuppletive": boolean,
"isAdjectival": boolean (true for words like чёрный or будущее)
},
"translation_en": "string",
"semanticTags": ["extracted"],
"source": "gemini",
"bucketPaths": {
"singular": ["animacy", "gender", "singular", "ending_bucket_id"],
"plural": ["animacy", "gender", "plural", "ending_bucket_id"]
},
"mastery": { "level1_sorted": false, "errorsByLevel": {}, "isMastered": false, "lastPracticed": null }
}
Map the ending_bucket_ids strictly to these values based on the genitive ending:
Masc/Neut Sg: 'hard_a', 'soft_ya', 'adj_ogo', 'adj_ego'
Fem Sg: 'hard_y', 'soft_i', 'adj_oy', 'adj_ey'
Plural (All): 'hard_ov', 'soft_ey', 'y_ev', 'ey', 'iy', 'zero', 'adj_yh', 'adj_ih'
Indeclinable: Use ['indeclinable'] for both paths.`;

// Primary and fallback models
const PRIMARY_MODEL = 'gemini-2.5-flash';
const FALLBACK_MODEL = 'gemini-2.5-flash-lite';
const MIN_DELAY_MS = 2000;

let lastCallTimestamp = 0;
let usingFallback = false;
let fallbackCooldownUntil = 0;

// Sanitize Gemini response
function parseGeminiResponse(raw) {
    let cleaned = raw.replace(/```json\n?([\s\S]*?)\n?```/gi, '$1').trim();

    // Aggressively extract the JSON array to avoid conversational text
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        cleaned = cleaned.substring(firstBracket, lastBracket + 1);
    }

    try {
        const arr = JSON.parse(cleaned);
        if (!Array.isArray(arr)) throw new Error('Response is not an array');
        return arr;
    } catch (e) {
        console.error('[Gemini] Parse error:', e, 'Raw:', raw);
        return null;
    }
}

// Rate limiter queue
let rateLimitPromise = Promise.resolve();

async function waitForRateLimit() {
    const p = rateLimitPromise.then(async () => {
        const now = Date.now();
        const elapsed = now - lastCallTimestamp;
        if (elapsed < MIN_DELAY_MS) {
            await new Promise(r => setTimeout(r, MIN_DELAY_MS - elapsed));
        }
        lastCallTimestamp = Date.now();
    });
    rateLimitPromise = p;
    return p;
}

// Get current model (with circuit breaker)
function getCurrentModel() {
    if (usingFallback && Date.now() > fallbackCooldownUntil) {
        usingFallback = false; // Try primary again
    }
    return usingFallback ? FALLBACK_MODEL : PRIMARY_MODEL;
}

// Switch to fallback
function activateFallback() {
    usingFallback = true;
    fallbackCooldownUntil = Date.now() + 60000; // 60 second cooldown
    console.log('[Gemini] Switched to fallback model');
}

// Extract nouns from text
export async function extractNounsFromText(text, apiKey) {
    if (!apiKey) throw new Error('NO_API_KEY');
    if (!text.trim()) throw new Error('EMPTY_INPUT');

    await waitForRateLimit();
    const model = getCurrentModel();

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const body = {
        contents: [{
            parts: [{
                text: `Extract all Russian nouns from the following text:\n\n${text}`
            }]
        }],
        systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }]
        },
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (response.status === 401) throw new Error('INVALID_API_KEY');
    if (response.status === 429) {
        activateFallback();
        throw new Error('RATE_LIMITED');
    }
    if (!response.ok) throw new Error(`API_ERROR_${response.status}`);

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) throw new Error('EMPTY_RESPONSE');

    const nouns = parseGeminiResponse(rawText);
    if (!nouns) throw new Error('PARSE_ERROR');

    const wordSetId = `set-${Date.now()}`;
    return processNouns(nouns, wordSetId);
}

// Extract nouns from image
export async function extractNounsFromImage(imageFile, apiKey) {
    if (!apiKey) throw new Error('NO_API_KEY');
    if (!imageFile) throw new Error('NO_IMAGE');

    await waitForRateLimit();
    const model = getCurrentModel();

    // Convert image to base64
    const base64 = await fileToBase64(imageFile);
    const mimeType = imageFile.type || 'image/png';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const body = {
        contents: [{
            parts: [
                {
                    inlineData: {
                        mimeType: mimeType,
                        data: base64
                    }
                },
                {
                    text: 'Extract all Russian nouns visible in this image.'
                }
            ]
        }],
        systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }]
        },
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (response.status === 401) throw new Error('INVALID_API_KEY');
    if (response.status === 429) {
        activateFallback();
        throw new Error('RATE_LIMITED');
    }
    if (!response.ok) throw new Error(`API_ERROR_${response.status}`);

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) throw new Error('EMPTY_RESPONSE');

    const nouns = parseGeminiResponse(rawText);
    if (!nouns) throw new Error('PARSE_ERROR');

    const wordSetId = `set-${Date.now()}`;
    return processNouns(nouns, wordSetId);
}

// Process raw nouns from Gemini into app schema
function processNouns(rawNouns, wordSetId) {
    return rawNouns.map((noun, i) => {
        return {
            wordId: noun.wordId || `gemini-${Date.now()}-${i}-${noun.nominative_sg || noun.nominative_pl}`,
            wordSetId: wordSetId || `manual-${Date.now()}`,
            type: 'noun',
            nominative_sg: noun.nominative_sg,
            nominative_pl: noun.nominative_pl || null,
            genitive_sg: noun.genitive_sg,
            genitive_pl: noun.genitive_pl || null,
            gender: noun.gender,
            animacy: noun.animacy,
            stemType: noun.stemType || 'noun',
            translation_en: noun.translation_en || '',
            genitiveSgEnding: noun.genitiveSgEnding || null,
            genitivePlEnding: noun.genitivePlEnding || null,
            flags: noun.flags || {
                isIndeclinable: false,
                hasPlural: !!noun.nominative_pl,
                hasSingular: !!noun.nominative_sg,
                isProperNoun: false,
                hasSpellingMutation: false,
                hasFleetingVowel: false,
                isSuppletive: false,
                isAdjectival: false
            },
            semanticTags: noun.semanticTags || ['extracted'],
            source: 'gemini',
            bucketPaths: noun.bucketPaths || { singular: null, plural: null },
            relatedAdjectives: [],
            relatedPronouns: [],
            mastery: noun.mastery || {
                level1_sorted: false, level2_drills: [], level3_triggers: [],
                level4_pronouns: [], level5_adjectives: [], level6_chaos: [],
                errorsByLevel: {}, isMastered: false, lastPracticed: null
            }
        };
    });
}

// ═══════════════════════════════════════════
// SPRINT III - CONTEXTUAL AI SENTENCES
// ═══════════════════════════════════════════
export async function fetchContextualSentence(word, targetForm, abortSignal, apiKey) {
    if (!apiKey) throw new Error('NO_API_KEY');

    await waitForRateLimit();

    // Convert target form (e.g. "singular", "plural") to the actual Russian genitive string expected
    const targetRussian = targetForm === 'singular' ? word.genitive_sg : word.genitive_pl;
    const baseRussian = targetForm === 'singular' ? word.nominative_sg : word.nominative_pl;

    const prompt = `Write a short, simple Russian sentence demonstrating the genitive case of "${baseRussian}". 
    The sentence MUST contain the EXACT word form "${targetRussian}". 
    Keep vocabulary at A2 level if possible.
    Provide the response strictly as a JSON object: {"russian": "sentence here", "english": "translation here"}`;

    const model = getCurrentModel();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.3, // Low temp for grammar accuracy
            responseMimeType: "application/json"
        }
    };

    try {
        let response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: abortSignal // Wire up the abort controller
        });

        // 1-Shot Auto-Retry on Fallback
        if (response.status === 429) {
            activateFallback();
            console.warn('[Gemini] 429 Hit. Auto-retrying with fallback...');
            const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/${FALLBACK_MODEL}:generateContent?key=${apiKey}`;
            response = await fetch(fallbackUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: abortSignal
            });
        }

        if (response.status === 401) throw new Error('INVALID_API_KEY');
        if (!response.ok) throw new Error(`API_ERROR_${response.status}`);

        const data = await response.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!rawText) throw new Error('EMPTY_RESPONSE');

        const result = JSON.parse(rawText);
        if (!result.russian || !result.english) throw new Error('MALFORMED_JSON');

        return result;

    } catch (err) {
        if (err.name === 'AbortError') {
            console.log(`[Gemini] fetchContextualSentence aborted for ${targetRussian}`);
            throw err;
        }
        console.error('[Gemini] fetchContextualSentence failed:', err);
        return null;
    }
}

// Helper: file to base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Error message mapper
export function getErrorMessage(error) {
    const messages = {
        'NO_API_KEY': 'No API key set. Please add your Gemini API key in Settings.',
        'EMPTY_INPUT': 'Please enter some Russian text or upload an image.',
        'INVALID_API_KEY': 'API Key invalid or missing. Please check your Settings.',
        'RATE_LIMITED': 'API rate limit reached. Retrying in 60s with fallback model...',
        'EMPTY_RESPONSE': 'No Russian nouns detected. Try a clearer image or different text.',
        'PARSE_ERROR': 'AI returned unexpected format. Please try again.',
        'NO_IMAGE': 'Please select an image file.'
    };

    const msg = error.message || error;
    return messages[msg] || `Unexpected error: ${msg}`;
}
