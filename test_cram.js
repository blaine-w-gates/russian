const now = new Date("2026-02-28T22:00:00");
let logs = [];

// Time travel backwards 4 weeks, injecting 4 drills per week
for (let w = 0; w < 4; w++) {
    let daysToInject = 4; // w=0: 4, w=1: 4, w=2: 4, w=3: 4
    for (let d = 0; d < daysToInject; d++) {
        let logDate = new Date(now);
        logDate.setDate(now.getDate() - (w * 7) - d); 
        logs.push({ 
            date: logDate.toLocaleDateString('en-CA'), 
            count: 1, drillCount: 1 
        });
    }
}

const currentDay = now.getDay() === 0 ? 6 : now.getDay() - 1;
const currentMonday = new Date(now);
currentMonday.setDate(now.getDate() - currentDay);
currentMonday.setHours(0, 0, 0, 0);

const timeWindowStart = new Date(currentMonday);
timeWindowStart.setDate(currentMonday.getDate() - 28); // 4 weeks ago

const weeksMap = new Map();
// Initialize weeks map for last 5 weeks
for (let i = 0; i < 5; i++) {
    const weekMon = new Date(timeWindowStart);
    weekMon.setDate(timeWindowStart.getDate() + (i * 7));
    weeksMap.set(weekMon.toLocaleDateString('en-CA'), 0);
}

for (let log of logs) {
    if (log.drillCount > 0) {
        const logDate = new Date(log.date + 'T00:00:00');
        const logDay = logDate.getDay() === 0 ? 6 : logDate.getDay() - 1;
        const logMon = new Date(logDate);
        logMon.setDate(logDate.getDate() - logDay);
        const weekKey = logMon.toLocaleDateString('en-CA');

        if (weeksMap.has(weekKey)) {
            weeksMap.set(weekKey, weeksMap.get(weekKey) + 1);
        }
    }
}

const currentMondayStr = currentMonday.toLocaleDateString('en-CA');
const dailyBoxes = weeksMap.get(currentMondayStr) || 0;

let weeklyBoxes = 0;
const weekKeys = Array.from(weeksMap.keys()).sort().reverse();
for (let i = 0; i < weekKeys.length; i++) {
    if (weeksMap.get(weekKeys[i]) >= 4) {
        weeklyBoxes++;
    } else if (i > 0) {
        break;
    }
}
console.log({
    dailyBoxes: Math.min(dailyBoxes, 4),
    rawWeeklyBoxes: weeklyBoxes,
    uiWeeklyBoxes: weeklyBoxes % 4
});
