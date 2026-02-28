// ══════════════════════════════════════════════════════════
// 52-Week Gamification Engine Simulator (Time-Travel Math Test)
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

    const weeksMap = new Map();
    // Ensure the current week exists even with 0 drills
    weeksMap.set(toDateStr(currentMonday), 0);

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

    const currentMondayStr = toDateStr(currentMonday);
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
            const milestoneKey = `milestone_${localDateStr}`;
            if (lastMilestone !== milestoneKey) {
                totalTrophies++;
                lastMilestone = milestoneKey;
            }
        }
    }
}

console.log("🚀 Starting 52-Week Gamification State Machine Test...\n");

const startDate = new Date();
const startDay = startDate.getDay() === 0 ? 6 : startDate.getDay() - 1;
startDate.setDate(startDate.getDate() - startDay);
startDate.setHours(12, 0, 0, 0);

for (let week = 1; week <= 52; week++) {

    let behaviorPlan = [];

    // Q1 (Weeks 1-12)
    if (week <= 12) behaviorPlan = ['drill', 'drill', 'drill', 'drill', null, null, null];
    // Q2 (Weeks 13-24)
    else if (week <= 24) behaviorPlan = ['drill', 'drill', 'drill', 'drill', null, null, null];
    // Q3 (Weeks 25-36)
    else if (week <= 36) behaviorPlan = ['drill', 'drill', 'drill', 'drill', null, null, null];
    // Q4 (Weeks 37-48)
    else if (week <= 48) behaviorPlan = ['sort', 'sort', 'sort', 'sort', null, null, null];
    // Last 4 weeks
    else if (week === 49) behaviorPlan = ['drill', 'drill', 'drill', null, null, null, null]; // 3 days (Misses target)
    else if (week === 50) behaviorPlan = [null, null, null, null, null, null, null];          // 0 days (Full Vacation reset)
    else if (week === 51) behaviorPlan = ['drill', 'drill', 'drill', 'drill', null, null, null]; // Back on track
    else if (week === 52) behaviorPlan = ['drill', 'drill', 'drill', 'drill', 'drill', null, null]; // Overachiever (5 days)

    for (let day = 0; day < 7; day++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + ((week - 1) * 7) + day);

        const action = behaviorPlan[day];
        if (action) {
            simulateAction(currentDate, action);
        }
    }

    if (week % 12 === 0 || week === 52) {
        let title = "";
        if (week === 12) title = "Q1 [Button 1 | Daily Review]: Expected 3 Trophies.";
        if (week === 24) title = "Q2 [Button 2 | Cram Mode]: Expected 6 Trophies cumulative.";
        if (week === 36) title = "Q3 [Button 3 | Lvl 2 Recall]: Expected 9 Trophies cumulative.";
        if (week === 48) title = "Q4 [Button 4 | Lvl 1 Sort]: Expected 9 Trophies (Sorts do not earn streaks!).";
        if (week === 52) title = "End [Resilience Test]: Missed weeks, reset correctly. Expected 9 Trophies total.";

        const pointInTime = new Date(startDate);
        pointInTime.setDate(startDate.getDate() + ((week - 1) * 7) + 6);
        const ms = calculateMilestones(pointInTime);
        console.log(`--- WEEK ${week} ---`);
        console.log(`Scenario: ${title}`);
        console.log(`Result: Daily Habit: [${ms.dailyBoxes}/4], Momentum Grid: [${ms.weeklyBoxes}/4]. Total Streak Chain: ${ms.rawWeeklyBoxes}`);
        console.log(`🏆 Trophies Won: x${ms.totalTrophies}\n`);
    }
}

if (totalTrophies === 9) {
    console.log("✅ STATE MACHINE VALIDATED: Flawless mathematical execution over 364 days.");
} else {
    console.error(`❌ QA FAILURE: Expected 9 Trophies, calculated ${totalTrophies}`);
}
