// Bucket Map — defines which buckets to show at each Stage 4 path
// and the validation logic for Stages 1–3

export const STAGE_NAMES = [
    'Одушевлённость',  // Animacy
    'Род',              // Gender
    'Число',            // Number
    'Окончание'         // Ending
];

export const STAGE_LABELS_EN = [
    'Animacy',
    'Gender',
    'Number',
    'Ending Match'
];

// Stage 1: Animacy buckets
export const ANIMACY_BUCKETS = [
    { id: 'animate', label: 'Одушевлённый', sublabel: 'Animate', emoji: '🧑' },
    { id: 'inanimate', label: 'Неодушевлённый', sublabel: 'Inanimate', emoji: '📦' }
];

// Stage 2: Gender buckets
export const GENDER_BUCKETS = [
    { id: 'masculine', label: 'Мужской', sublabel: 'Masculine', emoji: '♂️' },
    { id: 'feminine', label: 'Женский', sublabel: 'Feminine', emoji: '♀️' },
    { id: 'neuter', label: 'Средний', sublabel: 'Neuter', emoji: '⚪' }
];

// Stage 3: Number buckets
export const NUMBER_BUCKETS = [
    { id: 'singular', label: 'Единственное', sublabel: 'Singular', emoji: '1️⃣' },
    { id: 'plural', label: 'Множественное', sublabel: 'Plural', emoji: '🔢' }
];

// Stage 4: Ending buckets — dynamic based on path through Stages 1–3
// Key format: "{gender}_{number}" (animacy doesn't change endings)
export const ENDING_BUCKETS = {
    'masculine_singular': [
        { id: 'hard_a', label: '-а', example: 'стола', sublabel: 'Hard stem' },
        { id: 'soft_ya', label: '-я', example: 'словаря', sublabel: 'Soft / й-stem' },
        { id: 'hard_y', label: '-ы', example: 'папы', sublabel: 'Masc in -а' },
        { id: 'soft_i', label: '-и', example: 'дяди', sublabel: 'Masc in -я / spelling rule' }
    ],
    'masculine_plural': [
        { id: 'hard_ov', label: '-ов', example: 'столов', sublabel: 'Hard stem' },
        { id: 'soft_ey', label: '-ей', example: 'словарей', sublabel: 'Soft stem' },
        { id: 'y_ev', label: '-ев', example: 'музеев', sublabel: 'й-stem' },
        { id: 'zero', label: '∅', example: 'солдат', sublabel: 'Zero ending', tooltip: 'Нулевое окончание' }
    ],
    'feminine_singular': [
        { id: 'hard_y', label: '-ы', example: 'лампы', sublabel: 'Hard stem' },
        { id: 'soft_i', label: '-и', example: 'статьи', sublabel: 'Soft / spelling rule' }
    ],
    'feminine_plural': [
        { id: 'zero', label: '∅', example: 'ламп', sublabel: 'Zero ending', tooltip: 'Нулевое окончание' },
        { id: 'ey', label: '-ей', example: 'статей', sublabel: '-ья / -ь stem' },
        { id: 'iy', label: '-ий', example: 'аудиторий', sublabel: '-ия stem' }
    ],
    'neuter_singular': [
        { id: 'hard_a', label: '-а', example: 'окна', sublabel: 'Hard stem' },
        { id: 'soft_ya', label: '-я', example: 'моря', sublabel: 'Soft stem' }
    ],
    'neuter_plural': [
        { id: 'zero', label: '∅', example: 'окон', sublabel: 'Hard stem', tooltip: 'Нулевое окончание' },
        { id: 'ey', label: '-ей', example: 'морей', sublabel: '-е stem' },
        { id: 'iy', label: '-ий', example: 'зданий', sublabel: '-ие stem' },
        { id: 'y_ev', label: '-ев', example: 'деревьев', sublabel: 'Irregular (-ья)' },
        { id: 'hard_ov', label: '-ов', example: 'облаков', sublabel: 'Irregular (-о)' }
    ],
    'plural_plural': [
        { id: 'zero', label: '∅', example: 'денег', sublabel: 'Zero ending', tooltip: 'Нулевое окончание' },
        { id: 'ey', label: '-ей', example: 'саней', sublabel: 'Soft / -ь stem' },
        { id: 'iy', label: '-ий', example: 'будней', sublabel: '-ия / -ие stem' },
        { id: 'hard_ov', label: '-ов', example: 'весов', sublabel: 'Hard stem' },
        { id: 'y_ev', label: '-ев', example: 'обоев', sublabel: 'й-stem' }
    ],
    'adjectival_masculine_singular': [
        { id: 'adj_ogo', label: '-ого', example: 'чёрного', sublabel: 'Мужской/Средний' },
        { id: 'adj_ego', label: '-его', example: 'будущего', sublabel: 'Мужской/Средний (мягк.)' }
    ],
    'adjectival_neuter_singular': [
        { id: 'adj_ogo', label: '-ого', example: 'чёрного', sublabel: 'Мужской/Средний' },
        { id: 'adj_ego', label: '-его', example: 'будущего', sublabel: 'Мужской/Средний (мягк.)' }
    ],
    'adjectival_feminine_singular': [
        { id: 'adj_oy', label: '-ой', example: 'столовой', sublabel: 'Женский' },
        { id: 'adj_ey', label: '-ей', example: 'рабочей', sublabel: 'Женский (мягк.)' }
    ],
    'adjectival_plural': [
        { id: 'adj_yh', label: '-ых', example: 'чёрных', sublabel: 'Множественное' },
        { id: 'adj_ih', label: '-их', example: 'будущих', sublabel: 'Множественное (мягк.)' }
    ]
};

// Get buckets for Stage 4 based on previous selections
export function getEndingBuckets(word, gender, number) {
    if (word.flags && word.flags.isAdjectival) {
        if (number === 'plural') return ENDING_BUCKETS['adjectival_plural'];
        return ENDING_BUCKETS[`adjectival_${gender}_singular`] || [];
    }
    const key = `${gender}_${number}`;
    return ENDING_BUCKETS[key] || [];
}

// Validate a user's bucket choice for a given word at a given stage
export function validateChoice(word, stage, chosenBucketId, targetNumber = 'singular') {
    const activePath = word.bucketPaths ? word.bucketPaths[targetNumber] : word.bucketPath;
    if (!activePath) return false;

    switch (stage) {
        case 0: // Animacy
            return word.animacy === chosenBucketId;
        case 1: // Gender
            if (Array.isArray(word.gender)) {
                return word.gender.includes(chosenBucketId);
            }
            return word.gender === chosenBucketId;
        case 2: // Number
            const expectedNumber = activePath[2];
            return expectedNumber === chosenBucketId;
        case 3: { // Ending
            // The bucket path's last element is the ending bucket ID
            const expectedEnding = activePath[activePath.length - 1];
            return expectedEnding === chosenBucketId;
        }
        default:
            return false;
    }
}

// Check if a word should skip a stage
export function shouldSkipStage(word, stage) {
    if (stage === 1) { // Gender
        // Pluralia tantum words don't have a gender
        if (!word.flags.hasSingular) return true;
    }
    if (stage === 2) {
        // Skip number stage if it only has one form (singularia tantum or pluralia tantum)
        if (!word.flags.hasPlural || !word.flags.hasSingular || word.flags.isProperNoun) {
            return true;
        }
    }
    return false;
}

// Check if a word is indeclinable (bypasses all stages)
export function isIndeclinable(word) {
    return word.flags.isIndeclinable;
}

// Get spelling rule hint if applicable
export function getSpellingHint(word) {
    if (word.flags.hasSpellingMutation) {
        const nom = word.nominative_sg || word.nominative_pl;
        const lastChar = nom.slice(-2, -1) || nom.slice(-1);
        return `7-letter spelling rule: ${lastChar} + и`;
    }
    return null;
}

// Format bucket path as readable string
export function formatBucketPath(path) {
    const labels = {
        animate: 'Animate', inanimate: 'Inanimate',
        masculine: 'Masculine', feminine: 'Feminine', neuter: 'Neuter',
        singular: 'Singular', plural: 'Plural',
        indeclinable: '✨ Indeclinable'
    };

    return path.map(p => labels[p] || p).join(' → ');
}
