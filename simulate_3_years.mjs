// ══════════════════════════════════════════════════════════
// 3-Year Gamification Engine Simulator (Time-Travel Math Test)
// ══════════════════════════════════════════════════════════

const logsMap = new Map();
let totalTrophies = 0;
let lastMilestone = null;

function toDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function calculateMilestones(simDate) {
    const currentDay = simDate.getDay() === 0 ? 6 : simDate.getDay() - 1;
    const currentMonday = new Date(simDate);
    currentMonday.setDate(simDate.getDate() - currentDay);
    currentMonday.setHours(0, 0, 0, 0);

    const currentMondayStr = toDateStr(currentMonday);
    const weeksMap = new Map();
    weeksMap.set(currentMondayStr, 0);

    // Process all logs up to simDate
    for (const log of logsMap.values()) {
        const [y, m, d] = log.date.split('-');
        const logDateObj = new Date(y, m - 1, d, 12, 0, 0);

        if (logDateObj > simDate) continue;

        if (log.drillCount > 0) {
            const logDay = logDateObj.getDay() === 0 ? 6 : logDateObj.getDay() - 1;
            const logMon = new Date(logDateObj);
            logMon.setDate(logDateObj.getDate() - logDay);
            const weekKey = toDateStr(logMon);

            if (weeksMap.has(weekKey)) {
                weeksMap.set(weekKey, weeksMap.get(weekKey) + 1);
            } else {
                weeksMap.set(weekKey, 1);
            }
        }
    }

    const dailyBoxes = weeksMap.get(currentMondayStr) || 0;

    let weeklyBoxes = 0;

    // Walk backward infinitely week by week
    let checkDateObj = new Date(currentMonday);
    while (true) {
        const key = toDateStr(checkDateObj);
        const count = weeksMap.get(key) || 0;

        if (count >= 4) {
            weeklyBoxes++;
        } else {
            // If it's the current week, it might not be done yet, so don't break the streak
            // UNLESS it's a past week, then the streak is definitively broken.
            if (key !== currentMondayStr) {
                break;
            }
        }
        checkDateObj.setDate(checkDateObj.getDate() - 7);
    }

    return {
        dailyBoxes: Math.min(dailyBoxes, 4),
        weeklyBoxes: weeklyBoxes % 4,
        rawWeeklyBoxes: weeklyBoxes,
        totalTrophies
    };
}

function simulateAction(simDate, actionType) {
    const localDateStr = toDateStr(simDate);

    if (!logsMap.has(localDateStr)) {
        logsMap.set(localDateStr, { date: localDateStr, count: 0, sortCount: 0, drillCount: 0 });
    }

    let log = logsMap.get(localDateStr);
    log.count++;

    if (actionType === 'sort') log.sortCount++;
    if (actionType === 'drill') log.drillCount++;

    if (actionType === 'drill') {
        const milestones = calculateMilestones(simDate);
        if (milestones.rawWeeklyBoxes > 0 && milestones.rawWeeklyBoxes % 4 === 0 && milestones.dailyBoxes === 4) {
            const currentDay = simDate.getDay() === 0 ? 6 : simDate.getDay() - 1;
            const currentMonday = new Date(simDate);
            currentMonday.setDate(simDate.getDate() - currentDay);
            const milestoneKey = `milestone_${toDateStr(currentMonday)}`;
            if (lastMilestone !== milestoneKey) {
                totalTrophies++;
                lastMilestone = milestoneKey;
            }
        }
    }
}

console.log("🚀 Starting 3-Year (156 Weeks) Gamification State Machine Test...\n");

const startDate = new Date();
const startDay = startDate.getDay() === 0 ? 6 : startDate.getDay() - 1;
startDate.setDate(startDate.getDate() - startDay);
startDate.setHours(12, 0, 0, 0);

for (let week = 1; week <= 156; week++) {

    let behaviorPlan = [];

    // Year 1 (Weeks 1-52): Perfect Streak (Button 1: Daily Review) -> 13 Trophies expected
    if (week <= 52) behaviorPlan = ['drill', 'drill', 'drill', 'drill', null, null, null];

    // Year 2, Beginning (Weeks 53-60): Burnout (1-3 days max or full breaks) -> 0 Trophies, reset streak chain
    else if (week <= 54) behaviorPlan = ['drill', 'drill', 'drill', null, null, null, null]; // 3 days (miss)
    else if (week <= 56) behaviorPlan = [null, null, null, null, null, null, null];          // Full break (miss)
    else if (week <= 60) behaviorPlan = ['drill', null, 'drill', null, null, null, null];    // 2 days (miss)

    // Year 2, Recovery (Weeks 61-104): Perfect Streak again (Button 2: Cram Mode) -> 11 Trophies expected
    else if (week <= 104) behaviorPlan = ['drill', 'drill', 'drill', 'drill', 'drill', null, null];

    // Year 3, Alternate Strategy (Weeks 105-116): User does Lvl 1 Sort 15 only! -> 0 Trophies expected, streak dies
    else if (week <= 116) behaviorPlan = ['sort', 'sort', 'sort', 'sort', 'sort', null, null];

    // Year 3, Final Stretch (Weeks 117-156): Perfect Streak (Button 3: Lvl 2 Recall) -> 10 Trophies expected
    else if (week <= 156) behaviorPlan = ['drill', 'drill', 'drill', 'drill', null, null, null];

    for (let day = 0; day < 7; day++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + ((week - 1) * 7) + day);

        const action = behaviorPlan[day];
        if (action) {
            simulateAction(currentDate, action);
        }
    }

    if (week === 52 || week === 60 || week === 104 || week === 116 || week === 156) {
        let title = "";
        if (week === 52) title = "(Year 1 End) [Perfect Streak]: Expected 13 total trophies.";
        if (week === 60) title = "(Burnout Period) [1-3 days or missing]: Streak chain breaks, 0 new trophies.";
        if (week === 104) title = "(Year 2 End) [Perfect Recovery]: Expected 11 new trophies (24 total).";
        if (week === 116) title = "(Year 3 Start) [Lvl 1 Sort 15 Only]: Streak dies. 0 new trophies (24 total).";
        if (week === 156) title = "(Year 3 End) [Perfect Finish]: Expected 10 new trophies (34 total).";

        const pointInTime = new Date(startDate);
        pointInTime.setDate(startDate.getDate() + ((week - 1) * 7) + 6);
        const ms = calculateMilestones(pointInTime);
        console.log(`--- WEEK ${week} ---`);
        console.log(`Scenario: ${title}`);
        console.log(`Result: Daily Habit: [${ms.dailyBoxes}/4], Momentum Grid: [${ms.weeklyBoxes}/4]. Total Streak Chain: ${ms.rawWeeklyBoxes}`);
        console.log(`🏆 Trophies Won: x${ms.totalTrophies}\n`);
    }
}

if (totalTrophies === 34) {
    console.log("✅ 3-YEAR STATE MACHINE VALIDATED: Flawless execution across 1,092 simulated days and leap years.");
} else {
    console.error(`❌ QA FAILURE: Expected 34 Trophies, calculated ${totalTrophies}`);
}
