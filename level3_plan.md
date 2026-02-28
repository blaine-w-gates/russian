# Level 3 Architecture Plan: Syntactic Triggers & Adjective Agreement

## 1. Goal Description
The objective of Sprint III.a (Level 3) is to elevate the Genitive Lab from single-word morphology to contextual syntax puzzle-solving. We will introduce **Syntactic Triggers** (prepositions and quantities) and synthesize full-sentence puzzles focusing on **Dual-Entity Negation** (e.g., "У Ивана нет машины").

## 2. Updated Database Schemas

We will expand `SEED_DATA` and the IndexedDB logic to accommodate Triggers securely within our existing architecture.

### [NEW] Trigger Schema (Prepositions)
```javascript
{
  wordId: "prep-bez",
  type: "preposition",
  text_ru: "без",
  translation_en: "without",
  caseMandate: "genitive",
  triggerType: "abstract", 
}
```

### [NEW] Quantity Schema (Numerals)
Numerals dictate specific forms of the target noun and often must agree in gender.
```javascript
{
  wordId: "quant-dva",
  type: "quantity",
  text_ru: "два",
  translation_en: "two",
  caseMandate: "genitive",
  ruleType: "numeral_logic", // Dictates dynamic switch: 1 vs 2-4 vs 5+
  requiredGender: ["masculine", "neuter"] // "две" is for feminine.
}
```

### [NEW] SyntaxPuzzle Schema (The Dual-Entity Object)
Generates organically using words already extracted/known by the user.
```javascript
{
  puzzleId: "puzzle-170123",
  type: "possession_negation",
  formula: "У [X] нет [Y]",
  participantX: {
    wordId: "ivan",
    targetCase: "genitive",
    // Eventually supports adjectives:
    // adjectiveId: "new-adj"
  },
  participantY: {
    wordId: "mashina",
    targetCase: "genitive",
    // adjectiveId: null
  }
}
```

## 3. The State Machine: "У X нет Y"

### Sensible Subject Extraction
To ensure realistic puzzles, Participant X (Possessor) must be strictly drawn from the active pool of words matching `animacy: "animate"`. It will heavily weight `isProperNoun: true` (e.g., Иван, Лора) or family/people terms (брат, врач).

### State Machine Flow (Phase 1-4)
1. **State 1 (Selection/Prompt Phase):** The UI presents the Possessor and Possession in Nominative alongside a contextual English prompt: *"Ivan doesn't have a car."*
2. **State 2 (Triple Mutation Phase - UI Supported):** The user independently declines the Possessor (`Иван` → `Ивана`) and the Object (`машина` → `машины`). The engine provides isolated feedback on exactly which word failed if missed. 
   *(In Phase 2 of Level 3, an Adjective slot opens up here as well).*
3. **State 3 (Syntax Assembly):** User drags correctly declined components into the `У [___] нет [___]` visual bridge.
4. **State 4 (Independent Mastery Update):** The Database saves progress on both components atomically but independently.

## 4. Execution Sequence (Logic Guardrails First)
- **Step 1:** Modify `db.js` and `seed-data.js` to accept `type: "preposition"` and `type: "quantity"` without breaking existing dictionary lists.
- **Step 2:** Formulate `getRequiredForm(quantity, word)` utility to dynamically solve the **1, 2-4, 5+ Rule**.
- **Step 3:** Formulate the `CompoundMasteryUpdate` atomic transaction evaluating X and Y independently.
- **Step 4:** Deploy `view-level3.js` and the "Phase 0 Preposition Drop" UI elements to the Application Shell.

## User Review Required
> [!IMPORTANT]
> Awaiting the Board's final review of the Logic Snippets (Numeral Switch & Compound Mastery) before initiating execution on `view-level3.js`.
