// ==UserScript==
// @name         Neopets Hi-Score Tracker
// @namespace    GreaseMonkey
// @version      1.0
// @description  Tracks Neopets game high scores and displays daily/monthly/total changes, resetting daily/monthly at calendar start.
// @author       @willnjohnson
// @match        *://www.neopets.com/gamescores.phtml?game_id=*
// @match        *://www.neopets.com/games/hiscores.phtml?game_id=*
// @grant        none
// ==/UserScript==

/*
  Storage structure per user (stored flat — no history arrays):
  {
      firstRecordedScore:        number | null,  // All-time first score seen; never changes
      firstRecordedScoreOfDay:   number | null,  // Score at start of current calendar day
      firstRecordedScoreOfMonth: number | null,  // Score at start of current calendar month
      latestScore:               number | null,  // Most recently observed score
      dayKey:                    string,         // "YYYY-MM-DD" of when daily baseline was set
      monthKey:                  string          // "YYYY-MM" of when monthly baseline was set
  }

  On each page load:
  - If dayKey !== today   → roll firstRecordedScoreOfDay   = latestScore, update dayKey
  - If monthKey !== month → roll firstRecordedScoreOfMonth = latestScore, update monthKey
  - Then update latestScore with the current observed score

  Deltas:
  - Change (Total) = latestScore - firstRecordedScore
  - Change (Day)   = latestScore - firstRecordedScoreOfDay
  - Change (Month) = latestScore - firstRecordedScoreOfMonth
*/

(() => {
    'use strict';

    // ─── Constants ────────────────────────────────────────────────────────────

    const LS_KEY_PREFIX = 'neopets_hst3_';

    const TROPHY_POSITIONS = {
        GOLD:   { start: 1,  end: 3  },
        SILVER: { start: 4,  end: 8  },
        BRONZE: { start: 9,  end: 17 }
    };

    // ─── Date Helpers ─────────────────────────────────────────────────────────

    const getDayKey = (ts = Date.now()) => {
        const d = new Date(ts);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const getMonthKey = (ts = Date.now()) => {
        const d = new Date(ts);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

    // ─── Utility ──────────────────────────────────────────────────────────────

    const getGameIdFromUrl = () => new URLSearchParams(window.location.search).get('game_id');

    const getTrophyImageUrl = (gameId, position) => {
        if (position >= TROPHY_POSITIONS.GOLD.start   && position <= TROPHY_POSITIONS.GOLD.end)   return `https://images.neopets.com/trophies/${gameId}_1.gif`;
        if (position >= TROPHY_POSITIONS.SILVER.start && position <= TROPHY_POSITIONS.SILVER.end) return `https://images.neopets.com/trophies/${gameId}_2.gif`;
        if (position >= TROPHY_POSITIONS.BRONZE.start && position <= TROPHY_POSITIONS.BRONZE.end) return `https://images.neopets.com/trophies/${gameId}_3.gif`;
        return '';
    };

    const formatChange = (change) => {
        if (change === null || change === undefined || isNaN(change)) return '<span style="color:gray;">-</span>';
        if (change > 0) return `<span style="color:green;">+${change.toLocaleString()}</span>`;
        if (change < 0) return `<span style="color:red;">${change.toLocaleString()}</span>`;
        return '0';
    };

    // ─── DOM Helpers ──────────────────────────────────────────────────────────

    const createElement = (tag, attributes = {}, innerHTML = '') => {
        const el = document.createElement(tag);
        Object.entries(attributes).forEach(([k, v]) => {
            if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
            else el.setAttribute(k, v);
        });
        if (innerHTML) el.innerHTML = innerHTML;
        return el;
    };

    const createTd = (content, attrs = {}) => createElement('td', { align: 'center', ...attrs }, String(content));

    // ─── Data Store ───────────────────────────────────────────────────────────

    class ScoreDataStore {
        static _key(gameId) {
            return LS_KEY_PREFIX + gameId;
        }

        static _load(gameId) {
            const raw = localStorage.getItem(this._key(gameId));
            if (!raw) return {};
            try { return JSON.parse(raw); } catch { return {}; }
        }

        static _save(gameId, data) {
            try {
                localStorage.setItem(this._key(gameId), JSON.stringify(data));
            } catch (e) {
                if (e.name === 'QuotaExceededError') {
                    console.error('NP Hi-Score Tracker: localStorage quota exceeded.', e);
                    alert('Neopets Hi-Score Tracker: localStorage quota exceeded — data could not be saved.');
                } else {
                    console.error('NP Hi-Score Tracker: Unexpected save error.', e);
                }
            }
        }

        /**
         * Process a fresh batch of scores from the page.
         * Updates each user's flat record, rolling day/month baselines as needed.
         * Returns the full updated users map for immediate use in rendering.
         */
        static update(gameId, currentScores) {
            const allUsers     = this._load(gameId);
            const todayKey     = getDayKey();
            const thisMonthKey = getMonthKey();

            for (const { username, points } of currentScores) {
                let u = allUsers[username];

                if (!u) {
                    // First time we've ever seen this user for this game
                    allUsers[username] = {
                        firstRecordedScore:        points,
                        firstRecordedScoreOfDay:   points,
                        firstRecordedScoreOfMonth: points,
                        latestScore:               points,
                        dayKey:                    todayKey,
                        monthKey:                  thisMonthKey
                    };
                    continue;
                }

                // Roll daily baseline if the calendar day has changed
                if (u.dayKey !== todayKey) {
                    u.firstRecordedScoreOfDay = u.latestScore;
                    u.dayKey = todayKey;
                }

                // Roll monthly baseline if the calendar month has changed
                if (u.monthKey !== thisMonthKey) {
                    u.firstRecordedScoreOfMonth = u.latestScore;
                    u.monthKey = thisMonthKey;
                }

                // Always update latest score
                u.latestScore = points;
            }

            this._save(gameId, allUsers);
            return allUsers;
        }
    }

    // ─── Change Calculator ────────────────────────────────────────────────────

    const calculateChanges = (username, currentPoints, allUsers) => {
        const u = allUsers[username];
        if (!u) return { totalChange: null, dailyChange: null, monthlyChange: null };
        return {
            totalChange:   currentPoints - u.firstRecordedScore,
            dailyChange:   currentPoints - u.firstRecordedScoreOfDay,
            monthlyChange: currentPoints - u.firstRecordedScoreOfMonth
        };
    };

    // ─── Parsers ──────────────────────────────────────────────────────────────

    class OldLayoutParser {
        static parse(table, gameId) {
            const rows = Array.from(table.querySelectorAll('tbody > tr')).slice(1);
            return rows.map(row => {
                const cells = Array.from(row.children);
                if (cells.length < 3) return null;

                const position = parseInt(cells[0].textContent.trim(), 10);
                const username = cells[1].querySelector('a b')?.textContent.trim();
                const points   = parseInt(cells[2].textContent.trim().replace(/,/g, ''), 10);

                if (!username || isNaN(points) || isNaN(position)) return null;

                let trophy = cells[3]?.querySelector('img')?.src || '';
                if (!trophy && position <= 17) trophy = getTrophyImageUrl(gameId, position);

                return { position, username, points, trophy };
            }).filter(Boolean);
        }
    }

    class NewLayoutParser {
        static parse(container, gameId) {
            const sections = [
                { id: 'gold',   ...TROPHY_POSITIONS.GOLD   },
                { id: 'silver', ...TROPHY_POSITIONS.SILVER },
                { id: 'bronze', ...TROPHY_POSITIONS.BRONZE }
            ];

            const scores = [];
            for (const section of sections) scores.push(...this._parseTrophySection(container, section, gameId));
            scores.push(...this._parseEverybodyElse(container));
            return scores.filter(Boolean).sort((a, b) => a.position - b.position);
        }

        static _parseTrophySection(container, section, gameId) {
            const table = container.querySelector(`#${section.id} table`);
            if (!table) return [];

            return Array.from(table.querySelectorAll('tbody > tr')).map(row => {
                const cell = row.querySelector('td[valign="center"]');
                if (!cell) return null;

                const position = parseInt(cell.querySelector('.hiscorecount')?.id.replace('count-', ''), 10);
                const username = cell.querySelector('.hiscoreuser a')?.textContent.trim();
                const points   = parseInt(cell.querySelector('.hiscoreuser b')?.textContent.trim().replace(/,/g, ''), 10);

                if (!username || isNaN(points) || isNaN(position)) return null;

                const trophy = container.querySelector(`#${section.id} .hiscore-trophy`)?.src
                    || getTrophyImageUrl(gameId, position);

                return { position, username, points, trophy };
            }).filter(Boolean);
        }

        static _parseEverybodyElse(container) {
            const table = container.querySelector('.everybodyelse-box-mid table');
            if (!table) return [];

            return Array.from(table.querySelectorAll('tbody > tr')).flatMap(row => {
                const cells = Array.from(row.children);
                const scores = [];
                if (cells[0]?.querySelector('b')) scores.push(this._parseCell(cells, 0, 1, 2));
                if (cells.length >= 8 && cells[4]?.querySelector('b')) scores.push(this._parseCell(cells, 4, 5, 6));
                return scores;
            }).filter(Boolean);
        }

        static _parseCell(cells, posIdx, userIdx, ptsIdx) {
            const position = parseInt(cells[posIdx]?.querySelector('b')?.textContent.trim(), 10);
            const username = cells[userIdx]?.querySelector('a')?.textContent.trim();
            const points   = parseInt(cells[ptsIdx]?.querySelector('b')?.textContent.trim().replace(/,/g, ''), 10);
            if (!username || isNaN(points) || isNaN(position)) return null;
            return { position, username, points, trophy: '' };
        }
    }

    // ─── Layout Detection ─────────────────────────────────────────────────────

    const detectLayout = (contentArea) => {
        const oldTable = contentArea.querySelector('table[align="center"][border="1"][cellpadding="3"][cellspacing="0"]');
        if (oldTable) return { type: 'old', element: oldTable };

        const newContainer = contentArea.querySelector('#gr-hiscores-list-main');
        if (newContainer) return { type: 'new', element: newContainer };

        return { type: null, element: null };
    };

    // ─── Table Builder ────────────────────────────────────────────────────────
    //
    // Shared by both layout paths. Produces a unified replacement table so that
    // sort logic only lives in one place.
    //
    // Trophy cells are NOT rowspanned — each row gets its own individual cell.
    // Rowspan breaks immediately when rows are reordered by sort, so we skip it.

		class TableBuilder {
        static build(scores, allUsers) {
            const changeData = {};
            scores.forEach(score => {
                changeData[score.username] = calculateChanges(score.username, score.points, allUsers);
            });

            const table = createElement('table', {
                align: 'center', border: '1', cellpadding: '3', cellspacing: '0',
                style: { marginTop: '15px', width: '100%' }
            });

            table.appendChild(this._buildHead());
            table.appendChild(this._buildBody(scores, changeData));
            this._attachSort(table, changeData);

            return table;
        }

        static _buildHead() {
            const thead = createElement('thead');
            const tr    = createElement('tr');

            // sortKey: null = not sortable; string = key for comparator
            // 'username' and 'points' are passed through to the row data
            const COLS = [
                { label: 'Pos',            width: '5%',  sortKey: 'position' },
                { label: 'Username',       width: '18%', sortKey: 'username' },
                { label: 'Points',         width: '13%', sortKey: 'points'   },
                { label: 'Δ (Total)',      width: '12%', sortKey: 'totalChange'   },
                { label: 'Δ (Day)',        width: '12%', sortKey: 'dailyChange'   },
                { label: 'Δ (Month)',      width: '12%', sortKey: 'monthlyChange' },
                { label: 'Trophy',         width: '8%',  sortKey: null            }
            ];

            COLS.forEach(({ label, width, sortKey }) => {
                const th = createTd('', { style: { width } });
                th.innerHTML = `<b>${label}</b>`;

                if (sortKey) {
                    const link = createElement('span', {
                        'data-sort-key': sortKey,
                        title: 'Sort',
                        style: {
                            marginLeft: '5px',
                            cursor: 'pointer',
                            color: '#003366',
                            textDecoration: 'underline',
                            fontSize: '10px'
                        }
                    }, '⇅');
                    th.appendChild(link);
                }

                tr.appendChild(th);
            });

            thead.appendChild(tr);
            return thead;
        }

        static _buildBody(scores, changeData) {
            const tbody = createElement('tbody');
            scores.forEach(score => {
                // Attach original data to the row for the sorter to read
                const row = this._buildRow(score, changeData[score.username]);
                row.setAttribute('data-username', score.username);
                row.setAttribute('data-points', score.points);
                row.setAttribute('data-position', score.position);
                tbody.appendChild(row);
            });
            return tbody;
        }

        static _buildRow(score, changes) {
            const { totalChange, dailyChange, monthlyChange } = changes || {};
            const row = createElement('tr');
            row.appendChild(createTd(score.position));
            row.appendChild(createTd(`<a href="/userlookup.phtml?user=${score.username}"><b>${score.username}</b></a>`));
            row.appendChild(createTd(score.points.toLocaleString()));
            row.appendChild(createTd(formatChange(totalChange)));
            row.appendChild(createTd(formatChange(dailyChange)));
            row.appendChild(createTd(formatChange(monthlyChange)));

            const trophyCell = createTd('&nbsp;');
            if (score.trophy && score.position <= 17) {
                trophyCell.innerHTML = `<img src="${score.trophy}" width="50" height="50" border="0">`;
            }
            row.appendChild(trophyCell);
            return row;
        }

        static _attachSort(table, changeData) {
            const tbody = table.querySelector('tbody');
            const links = Array.from(table.querySelectorAll('thead span[data-sort-key]'));
            const originalOrder = Array.from(tbody.children);
            
            // Track the state of each column: { key: string, direction: 1 (desc) | -1 (asc) }
            let activeSort = { key: null, dir: 1 };

            links.forEach(link => {
                link.addEventListener('click', () => {
                    const key = link.getAttribute('data-sort-key');

                    // If clicking a different column, reset to Descending. 
                    // If clicking the same column, toggle the direction.
                    if (activeSort.key !== key) {
                        activeSort = { key: key, dir: 1 };
                    } else {
                        activeSort.dir *= -1;
                    }

                    // Update visuals: All links reset to ⇅, active link shows direction
                    links.forEach(l => {
                        l.textContent = (l.getAttribute('data-sort-key') === activeSort.key) 
                            ? (activeSort.dir === 1 ? '↓' : '↑') 
                            : '⇅';
                    });

                    Array.from(tbody.children).sort((a, b) => {
                        let valA, valB;
                        
                        // Extract values
                        if (key === 'username') { 
                            valA = a.getAttribute('data-username'); 
                            valB = b.getAttribute('data-username'); 
                        } else if (key === 'points') { 
                            valA = parseInt(a.getAttribute('data-points')); 
                            valB = parseInt(b.getAttribute('data-points')); 
                        } else if (key === 'position') { 
                            valA = parseInt(a.getAttribute('data-position')); 
                            valB = parseInt(b.getAttribute('data-position')); 
                        } else {
                            valA = changeData[a.getAttribute('data-username')]?.[key] ?? null;
                            valB = changeData[b.getAttribute('data-username')]?.[key] ?? null;
                        }

                        // String sort for username
                        if (key === 'username') {
                            return activeSort.dir === 1 ? valA.localeCompare(valB) : valB.localeCompare(valA);
                        }

                        // Numeric sort with null-handling (pushing nulls to bottom)
                        if (valA === null && valB === null) return 0;
                        if (valA === null) return 1;
                        if (valB === null) return -1;
                        
                        return activeSort.dir === 1 ? valB - valA : valA - valB;
                    }).forEach(row => tbody.appendChild(row));
                });
            });
        }
    }

    // ─── Layout Modifiers ─────────────────────────────────────────────────────
    //
    // Both modifiers replace the original page element with a unified table from
    // TableBuilder. Sort logic therefore works identically on both layouts.

    class OldLayoutModifier {
        static modify(oldTable, scores, allUsers) {
            const newTable = TableBuilder.build(scores, allUsers);
            oldTable.parentNode.insertBefore(newTable, oldTable);
            oldTable.remove();
        }
    }

    class NewLayoutModifier {
        static modify(container, scores, allUsers, contentArea) {
            const innerMid = container.querySelector('.mid-content');
            if (!innerMid) return;

            // Center the game title
            const h2 = innerMid.querySelector('h2');
            if (h2) Object.assign(h2.style, { textAlign: 'center', display: 'block' });

            // Hoist non-nav content out before the container is removed
            const skipIds = new Set(['gr-hiscore-minscore', 'gr-hiscores-nav']);
            Array.from(innerMid.children).forEach(el => {
                if (!skipIds.has(el.id) && el.tagName !== 'BR' && !el.matches('table[cellpadding="0"][cellspacing="0"]')) {
                    contentArea.insertBefore(el, container);
                }
            });

            contentArea.querySelector('table[cellpadding="0"][cellspacing="0"]')?.remove();
            container.remove();

            contentArea.appendChild(TableBuilder.build(scores, allUsers));
        }
    }

    // ─── Main ─────────────────────────────────────────────────────────────────

    class NeopetsHiScoreTracker {
        constructor() {
            this.gameId      = getGameIdFromUrl();
            this.contentArea = document.querySelector('td.content');
        }

        init() {
            // if (!this.gameId)      { console.log('NP Hi-Score Tracker: No game ID in URL.');            return; }
            if (!this.contentArea) { console.error('NP Hi-Score Tracker: td.content not found.');       return; }

            const layout = detectLayout(this.contentArea);
            if (!layout.type) { console.warn('NP Hi-Score Tracker: No recognisable hi-score table.'); return; }

            const scores = layout.type === 'old'
                ? OldLayoutParser.parse(layout.element, this.gameId)
                : NewLayoutParser.parse(layout.element, this.gameId);

            if (!scores.length) { console.log('NP Hi-Score Tracker: No scores found.'); return; }

            const allUsers = ScoreDataStore.update(this.gameId, scores);

            if (layout.type === 'old') {
                OldLayoutModifier.modify(layout.element, scores, allUsers);
            } else {
                NewLayoutModifier.modify(layout.element, scores, allUsers, this.contentArea);
            }

            // console.log(`NP Hi-Score Tracker: Updated for game ${this.gameId}.`);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => new NeopetsHiScoreTracker().init());
    } else {
        new NeopetsHiScoreTracker().init();
    }
})();
