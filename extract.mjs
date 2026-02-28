import fs from 'fs';
import { SEED_DATA } from './src/seed-data.js';

const targetWords = ['статья', 'аудитория', 'море', 'солдат'];

const found = SEED_DATA.filter(word =>
    (word.nominative_sg && targetWords.includes(word.nominative_sg.toLowerCase())) ||
    (word.nominative_pl && targetWords.includes(word.nominative_pl.toLowerCase()))
);

fs.writeFileSync('pristine_export.json', JSON.stringify(found, null, 2));
console.log("Extracted pristine words:", found.map(w => w.nominative_sg).join(', '));
