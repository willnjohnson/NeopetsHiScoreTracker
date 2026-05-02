# Neopets Hi-Score Tracker

A Greasemonkey/Tampermonkey userscript designed to enhance the Neopets Hi-Score tables. This tool transforms standard static score lists into dynamic, data-driven leaderboards, helping you track performance, analyze pacing, and identify suspicious score fluctuations.

---

## Key Features

### 1. Performance & Pacing Tracking
Don't get left behind. By tracking your scores over time, this script provides the necessary context to determine if your current scoring pace is sufficient to maintain a trophy-eligible position. 
* **Δ (Total):** Tracks the cumulative shift since the first time your score was recorded.
* **Δ (Day):** Monitors your progress within the current 24-hour cycle.
* **Δ (Month):** Shows your advancement relative to the start of the current calendar month.

### 2. Flexible Leaderboard Analysis
* **Dynamic Sorting:** Toggle between ascending and descending views for any column—including Positional (Pos), Username, Points, and Delta values—to instantly isolate top performers or identify trends.
* **Flat Data Structure:** Unlike standard tables that reset, this script stores performance history in a persistent, lightweight format, allowing you to compare current scores against historical baselines.
* **Layout Agnostic:** Works seamlessly with both legacy Neopets score tables and the updated "New" layout.

### 3. Cheat & Anomaly Detection
By monitoring the **Δ (Change)** columns, you can easily identify suspicious activity. Rapid, massive spikes in total score deltas—especially those occurring outside of standard gameplay patterns **(primarily in Cumulative games like Sakhmet Solitaire, Pyramids, Neggsweeper, and Scarab 21)**—which allow you to distinguish between legitimate high-score progression and potential leaderboard manipulation.

---

## How It Works

The script captures the score data directly from the `gamescores.phtml` or `games/hiscores.phtml` pages. It calculates the difference between the current values and the stored "baseline" (Day/Month/Total). 

### Storage Logic
* **Daily Reset:** At the start of a new calendar day, the script rolls your current score into the `firstRecordedScoreOfDay` baseline.
* **Monthly Reset:** At the start of a new calendar month, it rolls the score into the `firstRecordedScoreOfMonth` baseline.
* **Historical Baseline:** `firstRecordedScore` is preserved permanently, offering a bird's-eye view of a user's total improvement since you first began tracking them.

---

## Installation
1. Install a userscript manager (e.g., **Tampermonkey** or **Greasemonkey**).
2. Create a new script in your manager and paste the source code.
3. Save and refresh your Neopets Hi-Score pages.

---

## Troubleshooting
* **Quota Exceeded:** If you track hundreds of users across many games, your browser's `localStorage` may reach its limit. The script includes a built-in handler to notify you if data storage fails.
* **Layout Changes:** This script uses class-based parsing (`OldLayoutParser` vs `NewLayoutParser`) to ensure compatibility. If a table fails to load, check the browser console for "No recognisable hi-score table" warnings.

---

License

This project is licensed under the MIT License. You are free to use, copy, modify, and distribute the code for personal or collaborative use, provided that the original copyright notice and permission notice are included in all copies or substantial portions of the software.
