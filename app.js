const EMPTY_CALENDAR = {
    mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: []
};

let savedIdeas = [];
let calendarState = { ...EMPTY_CALENDAR };
let dailyFeed = { generatedAt: null, items: [] };
let dailyFeedHistory = [];
let trendItems = [];
let activeTrendSource = 'all';
let activeDailyFeedSource = 'all';
let activeDailyFeedArchiveSource = 'all';
let selectedPlannerIdeaTitle = '';

function normalizeCalendarState(input) {
    const normalized = { ...EMPTY_CALENDAR };

    if (!input || typeof input !== 'object') {
        return normalized;
    }

    Object.keys(normalized).forEach((day) => {
        const values = input[day];
        normalized[day] = Array.isArray(values)
            ? values
                .map((value) => String(value || '').trim())
                .filter(Boolean)
            : [];
    });

    return normalized;
}

function setSelectedPlannerIdea(title = '') {
    selectedPlannerIdeaTitle = String(title || '').trim();
    const plannerInput = document.getElementById('planner-title-input');
    if (plannerInput) {
        plannerInput.value = selectedPlannerIdeaTitle;
    }

    document.querySelectorAll('#calendar-chips .cal-chip').forEach((chip) => {
        const isMatch = chip.dataset.title === selectedPlannerIdeaTitle;
        chip.classList.toggle('selected', isMatch);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    prioritizeLiveUpdatesLayout();
    initTheme();
    initNav();
    initSmartNavigation();
    initSelectors();
    initIdeaGeneration();
    initScriptGeneration();
    initCalendar();
    initUtilities();
    initCreatorOS();
    initStatsObserver();
    await loadAppState();
    initSavedIdeas();
    loadTrends();
    loadDailyFeed();
    loadDailyFeedHistory();

    const modal = document.getElementById('feed-archive-modal');
    const closeBtn = document.getElementById('feed-archive-close-btn');
    if (modal && closeBtn) {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeFeedArchiveModal();
            }
        });
        closeBtn.addEventListener('click', closeFeedArchiveModal);
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeFeedArchiveModal();
            }
        });
    }
});

function prioritizeLiveUpdatesLayout() {
    const creatorSection = document.getElementById('creator-os');
    const featuresSection = document.getElementById('features');

    if (creatorSection && featuresSection && featuresSection.parentNode) {
        featuresSection.parentNode.insertBefore(creatorSection, featuresSection);
    }

    const grid = creatorSection?.querySelector('.creator-os-grid');
    if (!grid) {
        return;
    }

    const cards = Array.from(grid.querySelectorAll('.tool-card'));
    const byTitle = new Map(cards.map((card) => {
        const title = card.querySelector('h3')?.textContent?.trim() || '';
        return [title, card];
    }));

    const priorityOrder = [
        'Trend Intelligence',
        'Daily Viral Ideas Feed',
        'Feed Archive',
        'Viral Hook Generator',
        'Thumbnail + Title Generator',
        'Multi-Platform Repurposer',
        'Content Scoring',
        'Caption & Hashtag Generator',
        'Prompt Enhancer',
    ];

    priorityOrder.forEach((title) => {
        const card = byTitle.get(title);
        if (card) {
            grid.appendChild(card);
            byTitle.delete(title);
        }
    });

    byTitle.forEach((card) => {
        grid.appendChild(card);
    });
}

function initTheme() {
    const toggle = document.getElementById('theme-toggle');
    const body = document.body;
    
    if (localStorage.getItem('sparkr_theme') === 'dark') {
        body.classList.add('dark-mode');
        body.classList.remove('light-mode');
    } else {
        body.classList.add('light-mode');
        body.classList.remove('dark-mode');
    }
    
    toggle.addEventListener('click', () => {
        body.classList.toggle('dark-mode');
        body.classList.toggle('light-mode');
        localStorage.setItem('sparkr_theme', body.classList.contains('dark-mode') ? 'dark' : 'light');
    });
}

function initNav() {
    const hamburger = document.querySelector('.hamburger');
    const mobileNav = document.querySelector('.mobile-nav');
    
    if (hamburger && mobileNav) {
        hamburger.addEventListener('click', () => {
            mobileNav.classList.toggle('active');
            hamburger.classList.toggle('active');
        });
    }
    
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            if (mobileNav) {
                mobileNav.classList.remove('active');
            }
            if (hamburger) {
                hamburger.classList.remove('active');
            }

            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
}

function initSmartNavigation() {
    const allNavLinks = Array.from(document.querySelectorAll('.nav-links a, .mobile-nav a'));
    const uniqueTargets = [...new Set(allNavLinks
        .map((link) => link.getAttribute('href'))
        .filter((href) => href && href.startsWith('#')))];
    const sections = uniqueTargets
        .map((id) => ({
            id,
            el: document.querySelector(id),
        }))
        .filter((item) => item.el);

    if (sections.length === 0) {
        return;
    }

    const setActive = (id) => {
        allNavLinks.forEach((link) => {
            const isMatch = link.getAttribute('href') === id;
            link.classList.toggle('active', isMatch);
        });
    };

    const getCurrentSection = () => {
        const navOffset = 110;
        const scrollPosition = window.scrollY + navOffset;
        let current = sections[0]?.id || '#home';

        sections.forEach(({ id, el }) => {
            const top = el.offsetTop;
            if (scrollPosition >= top) {
                current = id;
            }
        });

        return current;
    };

    let rafId = null;
    const updateActiveOnScroll = () => {
        if (rafId) {
            return;
        }

        rafId = window.requestAnimationFrame(() => {
            setActive(getCurrentSection());
            rafId = null;
        });
    };

    window.addEventListener('scroll', updateActiveOnScroll, { passive: true });
    window.addEventListener('resize', updateActiveOnScroll);

    allNavLinks.forEach((link) => {
        link.addEventListener('click', () => {
            const target = link.getAttribute('href');
            if (target && target.startsWith('#')) {
                setActive(target);
            }

            link.classList.remove('nav-click-pulse');
            void link.offsetWidth;
            link.classList.add('nav-click-pulse');
            window.setTimeout(() => link.classList.remove('nav-click-pulse'), 360);
        });
    });

    setActive(getCurrentSection());
}

// ==========================================================================
// PILL SELECTORS
// ==========================================================================

function initSelectors() {
    document.querySelectorAll('.selector-group').forEach(group => {
        const pills = group.querySelectorAll('.toggle-pill');
        pills.forEach(pill => {
            pill.addEventListener('click', () => {
                pills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
            });
        });
    });
}

function initIdeaGeneration() {
    const btn = document.getElementById('generate-ideas-btn');
    const heroBtn = document.getElementById('hero-generate-btn');
    const input = document.getElementById('niche-input');
    const grid = document.getElementById('ideas-results');
    
    const triggerGeneration = async () => {
        const niche = input.value.trim();
        if(!niche) {
            showToast("Please enter a niche!");
            return;
        }
        
        const platform = document.querySelector('#platform-selector .active').dataset.value;
        const tone = document.querySelector('#tone-selector .active').dataset.value;
        
        grid.innerHTML = '';
        for(let i=0; i<4; i++) {
            grid.innerHTML += `<div class="skel-card pulse-skel"></div>`;
        }
        
        try {
            const response = await apiPost('/api/generate/ideas', { niche, platform, tone });
            const ideas = response.ideas || [];
            renderIdeas(ideas, { niche, platform, tone });
        } catch (e) {
            console.error(e);
            grid.innerHTML = '<p style="color:red; grid-column:1/-1;">Error generating ideas. Check the backend and API key.</p>';
        }
    };
    
    btn.addEventListener('click', triggerGeneration);
    heroBtn.addEventListener('click', () => {
        document.getElementById('ideas').scrollIntoView({ behavior: 'smooth' });
        input.focus();
    });
}

function renderIdeas(ideas, context = {}) {
    const grid = document.getElementById('ideas-results');
    grid.innerHTML = '';
    
    const icons = { 'trending': '🔥', 'educational': '📚', 'storytelling': '🎙️', 'lifestyle': '✨', 'challenge': '⚡', 'beginner': '🌱' };
    const colors = { 'trending': '#FF4D00', 'educational': '#0057FF', 'storytelling': '#4F46E5', 'lifestyle': '#FFB800', 'challenge': '#FF4D00', 'beginner': '#00CC88' };
    
    ideas.forEach((idea, index) => {
        const isHigh = idea.viralScore >= 85;
        const isSolid = idea.viralScore >= 70 && idea.viralScore < 85;
        
        let badgeColor = isHigh ? '#FF4D00' : (isSolid ? '#0057FF' : '#888888');
        let badgeText = isHigh ? 'HIGH POTENTIAL 🔥' : (isSolid ? 'SOLID PICK 👍' : 'STEADY GROWTH 📈');
        
        const card = document.createElement('div');
        card.className = `idea-card card-hover ${isHigh ? 'high-potential-glow' : ''}`;
        card.style.animation = `fadeIn 0.5s ease forwards ${index * 100}ms`;
        card.style.opacity = '0';
        
        card.innerHTML = `
            <div class="card-header">
                <span class="cat-tag" style="color: ${colors[idea.category.toLowerCase()] || '#0057FF'}">${icons[idea.category.toLowerCase()] || '💡'} ${escapeHtml(idea.category)}</span>
                <span class="viral-badge" style="background: ${badgeColor}; color: white;">${idea.viralScore}% ${badgeText}</span>
            </div>
            <h4>${escapeHtml(idea.title)}</h4>
            <div class="card-actions">
                <button class="btn btn-orange-fill script-it-btn">✍️ SCRIPT IT</button>
                <button class="btn btn-grey-outline save-btn">🔖 SAVE</button>
            </div>
        `;
        
        card.querySelector('.script-it-btn').addEventListener('click', () => {
            document.getElementById('script-idea-title').value = idea.title;
            document.getElementById('scripts').scrollIntoView({ behavior: 'smooth' });
        });

        const saveBtn = card.querySelector('.save-btn');
        if (savedIdeas.some(i => i.title === idea.title)) {
            saveBtn.innerText = 'SAVED';
            saveBtn.disabled = true;
        }

        saveBtn.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();

            if (savedIdeas.some(i => i.title === idea.title)) {
                saveBtn.innerText = 'SAVED';
                saveBtn.disabled = true;
                showToast("Already saved.");
                return;
            }

            const originalText = saveBtn.innerText;
            saveBtn.disabled = true;
            saveBtn.innerText = 'SAVING...';

            try {
                const platform = idea.platform || context.platform || document.querySelector('#platform-selector .active')?.dataset.value;
                const tone = context.tone || document.querySelector('#tone-selector .active')?.dataset.value;

                const saved = await apiPost('/api/ideas', {
                    ...idea,
                    niche: context.niche,
                    platform,
                    tone,
                });

                savedIdeas = [
                    saved.idea,
                    ...savedIdeas.filter(i => i.id !== saved.idea.id && i.title !== saved.idea.title)
                ];
                initSavedIdeas();
                saveBtn.innerText = 'SAVED';
                showToast("Saved to database.");
            } catch (error) {
                console.error(error);
                saveBtn.disabled = false;
                saveBtn.innerText = originalText;
                showToast("Save failed. Check the server and database connection.");
            }
        }, true);
        
        grid.appendChild(card);
    });
}

function initScriptGeneration() {
    const btn = document.getElementById('generate-script-btn');
    const output = document.getElementById('script-output');

    btn.addEventListener('click', async () => {
        const title = document.getElementById('script-idea-title').value.trim();
        if (!title) {
            showToast("Enter an idea title!");
            return;
        }

        const length = document.getElementById('script-length').value;
        const tone = document.getElementById('script-tone').value;
        const platform = document.querySelector('#platform-selector .active').dataset.value;

        output.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding: 40px; color: #888;">Generating script... (this may take a few seconds)</div>';

        try {
            const response = await apiPost('/api/generate/script', { title, length, tone, platform });
            const data = response.script || response;
            renderScript(data);
        } catch (e) {
            console.error(e);
            output.innerHTML = '<p style="color:red;">Error generating script.</p>';
        }
    });
}

function renderScript(data) {
    const output = document.getElementById('script-output');
    output.innerHTML = '';
    
    document.getElementById('script-word-count').innerText = `📝 ${data.wordCount} words`;
    document.getElementById('script-duration').innerText = `⏱️ ${data.duration}`;
    
    const colors = { 'Hook': '#FF4D00', 'Story': '#4D90FF', 'Value': '#00CC88', 'CTA': '#FFB800' };
    
    data.sections.forEach((sec, i) => {
        const card = document.createElement('div');
        card.className = 'script-section';
        card.style.animation = `fadeIn 0.5s ease forwards ${i * 100}ms`;
        card.style.opacity = '0';

        card.innerHTML = `
            <div class="sec-header">
                <span class="label" style="color: ${colors[sec.label] || '#FFF'}">${escapeHtml(sec.label)}</span>
                <span class="sec-time">${escapeHtml(sec.timeRange)}</span>
            </div>
            <div class="sec-text">${escapeHtml(sec.text)}</div>
            <button class="btn-regen">↻ Regenerate</button>
        `;
        
        card.querySelector('.btn-regen').addEventListener('click', async (e) => {
            const btn = e.target;
            btn.innerText = '...';
            try {
                const tone = document.getElementById('script-tone').value;
                const res = await apiPost('/api/generate/section', { label: sec.label, tone });
                const newData = res.section || res;
                card.querySelector('.sec-text').innerText = newData.text;
            } catch(err) {
                showToast("Failed to regenerate");
            }
            btn.innerText = '↻ Regenerate';
        });
        
        output.appendChild(card);
    });
}

function initSavedIdeas() {
    const grid = document.getElementById('saved-ideas-grid');
    const empty = document.getElementById('saved-empty-state');
    const chips = document.getElementById('calendar-chips');
    
    if (!grid || !chips) {
        return;
    }

    grid.innerHTML = '';
    chips.innerHTML = '';
    setSelectedPlannerIdea('');
    
    if(savedIdeas.length === 0) {
        if (empty) {
            empty.style.display = 'block';
            grid.appendChild(empty);
        }
        return;
    }
    
    if (empty) {
        empty.style.display = 'none';
    }
    
    savedIdeas.forEach((idea, index) => {
        const card = document.createElement('div');
        card.className = 'idea-card';
        card.innerHTML = `
            <div class="card-header">
                <span class="cat-tag">${escapeHtml(idea.category)}</span>
                <span class="viral-badge" style="background:#888; color:white;">${idea.viralScore}%</span>
            </div>
            <h4>${escapeHtml(idea.title)}</h4>
            <div class="card-actions">
                <button class="btn btn-orange-fill script-it-btn">✍️ SCRIPT IT</button>
                <button class="btn btn-grey-outline remove-btn">🗑️ REMOVE</button>
            </div>
        `;
        
        card.querySelector('.script-it-btn').addEventListener('click', () => {
            document.getElementById('script-idea-title').value = idea.title;
            document.getElementById('scripts').scrollIntoView({ behavior: 'smooth' });
        });
        
        card.querySelector('.remove-btn').addEventListener('click', async () => {
            await apiDelete(`/api/ideas/${idea.id}`);
            savedIdeas = savedIdeas.filter(item => item.id !== idea.id);
            initSavedIdeas();
        });
        
        grid.appendChild(card);
        
        const chip = document.createElement('div');
        chip.className = 'cal-chip';
        chip.draggable = true;
        chip.innerText = idea.title;
        chip.dataset.title = idea.title;

        chip.addEventListener('click', () => {
            setSelectedPlannerIdea(idea.title);
            showToast(`Selected: ${idea.title}`);
        });
        
        chip.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/plain', idea.title);
            setTimeout(() => chip.style.opacity = '0.5', 0);
        });
        chip.addEventListener('dragend', () => chip.style.opacity = '1');
        
        chips.appendChild(chip);
    });
    
    renderCalendar();
}

function initCalendar() {
    const zones = document.querySelectorAll('.drop-zone');
    const plannerDaySelect = document.getElementById('planner-day-select');
    const plannerTitleInput = document.getElementById('planner-title-input');
    const plannerAddBtn = document.getElementById('planner-add-btn');
    const clearWeekBtn = document.getElementById('clear-week-btn');

    const addToCalendar = async (day, title) => {
        const safeDay = String(day || '').trim();
        const safeTitle = String(title || '').trim();

        if (!safeDay || !safeTitle) {
            showToast('Select a day and idea first.');
            return;
        }

        try {
            const dayItems = Array.isArray(calendarState[safeDay]) ? calendarState[safeDay] : [];
            if (dayItems.includes(safeTitle)) {
                showToast('This idea is already added to that day.');
                return;
            }

            const state = await apiPost('/api/calendar', { day: safeDay, title: safeTitle });
            calendarState = normalizeCalendarState(state.calendar);
            renderCalendar();
            showToast('Added to calendar ✓');
        } catch (error) {
            console.error(error);
            showToast('Unable to update calendar.');
        }
    };
    
    zones.forEach(zone => {
        zone.addEventListener('dragover', e => {
            e.preventDefault();
            zone.classList.add('drag-over');
        });
        zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
        zone.addEventListener('drop', async e => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            const title = e.dataTransfer.getData('text/plain');
            const day = zone.dataset.day;
            await addToCalendar(day, title);
        });

        zone.addEventListener('click', async () => {
            if (!selectedPlannerIdeaTitle) {
                return;
            }
            await addToCalendar(zone.dataset.day, selectedPlannerIdeaTitle);
        });
    });

    if (plannerAddBtn) {
        plannerAddBtn.addEventListener('click', async () => {
            const day = plannerDaySelect?.value;
            const title = plannerTitleInput?.value;
            await addToCalendar(day, title);
        });
    }

    if (plannerTitleInput) {
        plannerTitleInput.addEventListener('input', () => {
            selectedPlannerIdeaTitle = plannerTitleInput.value.trim();
            document.querySelectorAll('#calendar-chips .cal-chip').forEach((chip) => {
                chip.classList.remove('selected');
            });
        });
    }

    if (clearWeekBtn) {
        clearWeekBtn.addEventListener('click', async () => {
            const confirmed = window.confirm('Clear all ideas from this week?');
            if (!confirmed) {
                return;
            }

            try {
                const state = await apiPost('/api/calendar/clear', {});
                calendarState = normalizeCalendarState(state.calendar);
                renderCalendar();
                showToast('Week cleared ✓');
            } catch (error) {
                console.error(error);
                showToast('Unable to clear week.');
            }
        });
    }
}

function renderCalendar() {
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    days.forEach(day => {
        const zone = document.querySelector(`.drop-zone[data-day="${day}"]`);
        if (!zone) return;
        zone.innerHTML = '';

        const items = Array.isArray(calendarState[day]) ? calendarState[day] : [];
        items.forEach((title) => {
            const el = document.createElement('div');
            el.className = 'cal-chip cal-chip-placed';
            el.innerText = title;
            
            const rm = document.createElement('span');
            rm.className = 'cal-chip-remove';
            rm.innerText = '×';
            
            rm.addEventListener('click', async () => {
                try {
                    const state = await apiDelete('/api/calendar', { day, title });
                    calendarState = normalizeCalendarState(state.calendar);
                    renderCalendar();
                    showToast('Removed from calendar');
                } catch (error) {
                    console.error(error);
                    showToast('Unable to remove item.');
                }
            });
            
            el.appendChild(rm);
            zone.appendChild(el);
        });
    });
}

function initUtilities() {
    document.getElementById('copy-btn').addEventListener('click', () => {
        const sections = document.querySelectorAll('.script-section');
        if(sections.length === 0) return;
        
        let text = "SCRIPT: " + document.getElementById('script-idea-title').value + "\n\n";
        sections.forEach(s => {
            text += `[${s.querySelector('.label').innerText}]\n${s.querySelector('.sec-text').innerText}\n\n`;
        });
        navigator.clipboard.writeText(text);
        showToast("Copied! ✓");
    });
    
    document.getElementById('export-pdf-btn').addEventListener('click', () => {
        const sections = document.querySelectorAll('.script-section');
        if (sections.length === 0) {
            showToast("Generate a script first.");
            return;
        }

        const title = document.getElementById('script-idea-title').value.trim() || 'Script Export';
        const html = Array.from(sections).map(section => {
            const label = section.querySelector('.label')?.innerText || '';
            const time = section.querySelector('.sec-time')?.innerText || '';
            const text = section.querySelector('.sec-text')?.innerText || '';
            return `
                <div class="block">
                    <div class="meta">
                        <span class="label">${escapeHtml(label)}</span>
                        <span class="time">${escapeHtml(time)}</span>
                    </div>
                    <div class="text">${escapeHtml(text)}</div>
                </div>
            `;
        }).join('');

        const win = window.open('', '_blank', 'width=900,height=900');
        if (!win) {
            showToast("Popup blocked. Allow popups to export PDF.");
            return;
        }

        win.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8" />
                <title>${escapeHtml(title)}</title>
                <style>
                    body { font-family: 'Inter', Arial, sans-serif; padding: 32px; color: #111; }
                    h1 { font-size: 24px; margin-bottom: 20px; }
                    .block { border: 1px solid #ddd; border-radius: 12px; padding: 16px; margin-bottom: 16px; break-inside: avoid; }
                    .meta { display: flex; justify-content: space-between; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #666; }
                    .label { font-weight: 700; color: #ff4d00; }
                    .time { font-weight: 600; }
                    .text { margin-top: 12px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
                    @media print { body { padding: 0; } }
                </style>
            </head>
            <body>
                <h1>${escapeHtml(title)}</h1>
                ${html}
            </body>
            </html>
        `);
        win.document.close();
        win.focus();
        win.print();
        setTimeout(() => win.close(), 500);
    });
    
    document.getElementById('remix-btn').addEventListener('click', () => {
        document.getElementById('generate-script-btn').click();
    });
}

function initCreatorOS() {
    const bind = (id, handler) => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('click', handler);
        }
    };

    bind('refresh-trends-btn', loadTrends);
        bind('refresh-daily-feed-btn', refreshDailyFeed);
    bind('generate-hooks-btn', generateHooks);
    bind('generate-title-pack-btn', generateTitlePack);
    bind('generate-repurpose-btn', generateRepurpose);
    bind('analyze-idea-btn', analyzeIdea);
    bind('generate-caption-btn', generateCaption);
    bind('enhance-prompt-btn', enhancePrompt);

    const filterButtons = document.querySelectorAll('#trend-source-filters .filter-pill');
    filterButtons.forEach((button) => {
        button.addEventListener('click', () => {
            filterButtons.forEach((pill) => pill.classList.remove('active'));
            button.classList.add('active');
            activeTrendSource = button.dataset.source || 'all';
            renderTrends(trendItems);
        });
    });

    const dailyFeedFilterButtons = document.querySelectorAll('#daily-feed-source-filters .filter-pill');
    dailyFeedFilterButtons.forEach((button) => {
        button.addEventListener('click', () => {
            dailyFeedFilterButtons.forEach((pill) => pill.classList.remove('active'));
            button.classList.add('active');
            activeDailyFeedSource = button.dataset.source || 'all';
            renderDailyFeed(dailyFeed);
        });
    });

    const dailyFeedArchiveFilterButtons = document.querySelectorAll('#daily-feed-archive-source-filters .filter-pill');
    dailyFeedArchiveFilterButtons.forEach((button) => {
        button.addEventListener('click', () => {
            dailyFeedArchiveFilterButtons.forEach((pill) => pill.classList.remove('active'));
            button.classList.add('active');
            activeDailyFeedArchiveSource = button.dataset.source || 'all';
            renderDailyFeedHistory(dailyFeedHistory);
        });
    });
}

function getToneValue(selectorId) {
    return document.querySelector(`${selectorId} .active`)?.dataset.value || 'Casual';
}

function getPlatformValue() {
    return document.querySelector('#platform-selector .active')?.dataset.value || 'YouTube';
}

function setModuleOutput(id, html) {
    const el = document.getElementById(id);
    if (el) {
        el.innerHTML = html;
    }
}

async function loadTrends() {
    const region = 'US';
    setModuleOutput('trends-output', '<div class="module-loading">Loading live trends...</div>');

    try {
        const response = await apiGet(`/api/trends?region=${region}`);
        trendItems = response.trends || [];
        renderTrends(trendItems);
    } catch (error) {
        console.error(error);
        setModuleOutput('trends-output', '<p class="module-error">Unable to load trends right now.</p>');
    }
}

function renderTrends(trends) {
    const output = document.getElementById('trends-output');
    if (!output) return;

    const filtered = activeTrendSource === 'all'
      ? trends
      : trends.filter((item) => String(item.source || '').toLowerCase() === activeTrendSource);

    if (!filtered.length) {
        output.innerHTML = '<p class="module-error">No trends for this source yet.</p>';
        return;
    }

    output.innerHTML = filtered.map((item) => `
        <div class="mini-card">
            <div class="mini-card-top">
                <span class="mini-source">${escapeHtml(item.source)}</span>
                <span class="mini-score">${escapeHtml(item.score)}%</span>
            </div>
            <h4>${escapeHtml(item.topic)}</h4>
            <p>${escapeHtml(item.angle || 'High-potential trend signal.')}</p>
        </div>
    `).join('');
}

async function loadDailyFeed() {
    setModuleOutput('daily-feed-output', '<div class="module-loading">Refreshing daily viral feed...</div>');

    try {
        const response = await apiGet('/api/daily-feed');
        dailyFeed = response.feed || { generatedAt: null, items: [] };
        renderDailyFeed(dailyFeed);
        loadDailyFeedHistory();
    } catch (error) {
        console.error(error);
        setModuleOutput('daily-feed-output', '<p class="module-error">Unable to load daily feed.</p>');
    }
}

async function refreshDailyFeed() {
    setModuleOutput('daily-feed-output', '<div class="module-loading">Generating a fresh daily feed...</div>');

    try {
        const response = await apiPost('/api/daily-feed/refresh', { region: 'US' });
        dailyFeed = response.feed || { generatedAt: null, items: [] };
        renderDailyFeed(dailyFeed);
        loadDailyFeedHistory();
        showToast('Daily feed refreshed.');
    } catch (error) {
        console.error(error);
        setModuleOutput('daily-feed-output', '<p class="module-error">Unable to refresh daily feed.</p>');
    }
}

async function loadDailyFeedHistory() {
    try {
        const response = await apiGet('/api/daily-feed/history?limit=5');
        dailyFeedHistory = response.history || [];
        renderDailyFeedHistory(dailyFeedHistory);
    } catch (error) {
        console.error(error);
        renderDailyFeedHistory([]);
    }
}

function renderDailyFeed(feed) {
    const output = document.getElementById('daily-feed-output');
    if (!output) return;

    const items = Array.isArray(feed?.items) ? feed.items : [];
    const filtered = activeDailyFeedSource === 'all'
      ? items
      : items.filter((item) => String(item.source || '').toLowerCase() === activeDailyFeedSource);

    if (!filtered.length) {
        output.innerHTML = '<p class="module-error">No daily feed items for this source yet.</p>';
        return;
    }

    output.innerHTML = filtered.map((item) => `
        <div class="daily-feed-card">
            <div class="card-header">
                <span class="cat-tag">${escapeHtml(item.source || 'trend')}</span>
                <span class="viral-badge" style="background:#ff4d00;color:#fff;">${escapeHtml(item.score || 0)}%</span>
            </div>
            <h4>${escapeHtml(item.title || item.topic)}</h4>
            <p>${escapeHtml(item.angle || '')}</p>
        </div>
    `).join('');
}

function renderDailyFeedHistory(history) {
    const output = document.getElementById('daily-feed-history-output');
    if (!output) return;

    const filtered = !Array.isArray(history) ? [] : history.filter((feed) => {
        if (activeDailyFeedArchiveSource === 'all') {
            return true;
        }

        const items = Array.isArray(feed?.items) ? feed.items : [];
        return items.some((item) => String(item.source || '').toLowerCase() === activeDailyFeedArchiveSource);
    });

    if (!filtered.length) {
        output.innerHTML = '<p class="module-error">No archives yet. Refresh the feed to create history.</p>';
        return;
    }

    output.innerHTML = filtered.map((feed, index) => {
        const time = feed.generatedAt ? new Date(feed.generatedAt).toLocaleString() : 'Unknown time';
        const firstTopic = Array.isArray(feed.items) && feed.items[0] ? (feed.items[0].title || feed.items[0].topic || 'Daily feed') : 'Daily feed';
        return `
            <div class="mini-card archive-card archive-card-clickable" data-archive-index="${index}">
                <div class="mini-card-top">
                    <span class="mini-source">${escapeHtml(time)}</span>
                    <span class="mini-score">${escapeHtml((feed.items || []).length)} ideas</span>
                </div>
                <h4>${escapeHtml(firstTopic)}</h4>
            </div>
        `;
    }).join('');

    output.querySelectorAll('.archive-card-clickable').forEach((card) => {
        card.addEventListener('click', () => {
            const index = Number(card.dataset.archiveIndex);
            const selected = filtered[index];
            if (selected) {
                openFeedArchiveModal(selected);
            }
        });
    });
}

function openFeedArchiveModal(feed) {
    const modal = document.getElementById('feed-archive-modal');
    const meta = document.getElementById('feed-archive-modal-meta');
    const content = document.getElementById('feed-archive-modal-content');

    if (!modal || !meta || !content) return;

    const time = feed.generatedAt ? new Date(feed.generatedAt).toLocaleString() : 'Unknown time';
    meta.innerHTML = `
        <div class="modal-meta-item"><span>Generated</span><strong>${escapeHtml(time)}</strong></div>
        <div class="modal-meta-item"><span>Total Ideas</span><strong>${escapeHtml((feed.items || []).length)}</strong></div>
    `;

    content.innerHTML = (feed.items || []).map((item) => {
        const link = normalizeExternalUrl(item.refUrl);
        return `
        <div class="archive-snapshot-item">
            <div class="card-header">
                <span class="cat-tag">${escapeHtml(item.source || 'trend')}</span>
                <span class="viral-badge" style="background:#ff4d00;color:#fff;">${escapeHtml(item.score || 0)}%</span>
            </div>
            <h4>${escapeHtml(item.title || item.topic || '')}</h4>
            <p>${escapeHtml(item.angle || '')}</p>
            ${link ? `<a class="snapshot-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">Open source reference ↗</a>` : ''}
        </div>
    `;
    }).join('');

    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
}

function closeFeedArchiveModal() {
    const modal = document.getElementById('feed-archive-modal');
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
}

function normalizeExternalUrl(value) {
    const url = String(value || '').trim();
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    return '';
}

async function generateHooks() {
    const title = document.getElementById('hook-title').value.trim();
    const platform = document.getElementById('hook-platform').value;
    const tone = document.getElementById('hook-tone').value;

    if (!title) return showToast('Enter a content idea first.');

    setModuleOutput('hooks-output', '<div class="module-loading">Generating hooks...</div>');
    try {
        const response = await apiPost('/api/generate/hooks', { title, platform, tone });
        const hooks = response.hooks || [];
        setModuleOutput('hooks-output', hooks.map((hook) => `
            <div class="mini-card">
                <div class="mini-card-top"><span class="mini-source">${escapeHtml(hook.type)}</span></div>
                <p>${escapeHtml(hook.text)}</p>
            </div>
        `).join(''));
    } catch (error) {
        console.error(error);
        setModuleOutput('hooks-output', '<p class="module-error">Unable to generate hooks.</p>');
    }
}

async function generateTitlePack() {
    const idea = document.getElementById('title-pack-input').value.trim();
    const tone = document.getElementById('title-pack-tone').value;
    if (!idea) return showToast('Enter a topic first.');

    setModuleOutput('title-pack-output', '<div class="module-loading">Building title pack...</div>');
    try {
        const response = await apiPost('/api/generate/title-pack', { idea, tone });
        const html = `
            <div class="stacked-group">
                <div><strong>Titles</strong><div>${(response.titles || []).map((t) => `<div class="mini-line">${escapeHtml(t)}</div>`).join('')}</div></div>
                <div><strong>Thumbnail Text</strong><div>${(response.thumbnailText || []).map((t) => `<div class="mini-line">${escapeHtml(t)}</div>`).join('')}</div></div>
                <div><strong>Thumbnail Concepts</strong><div>${(response.thumbnailConcepts || []).map((t) => `<div class="mini-line">${escapeHtml(t)}</div>`).join('')}</div></div>
            </div>
        `;
        setModuleOutput('title-pack-output', html);
    } catch (error) {
        console.error(error);
        setModuleOutput('title-pack-output', '<p class="module-error">Unable to generate title pack.</p>');
    }
}

async function generateRepurpose() {
    const idea = document.getElementById('repurpose-input').value.trim();
    const tone = document.getElementById('repurpose-tone').value;
    if (!idea) return showToast('Enter an idea first.');

    setModuleOutput('repurpose-output', '<div class="module-loading">Repurposing content...</div>');
    try {
        const response = await apiPost('/api/generate/repurpose', { idea, tone });
        const r = response.repurpose || {};
        setModuleOutput('repurpose-output', `
            <div class="stacked-group">
                <div class="mini-card"><strong>YouTube</strong><p>${escapeHtml(r.youtube || '')}</p></div>
                <div class="mini-card"><strong>Instagram</strong><p>${escapeHtml(r.instagram || '')}</p></div>
                <div class="mini-card"><strong>LinkedIn</strong><p>${escapeHtml(r.linkedin || '')}</p></div>
                <div class="mini-card"><strong>X / Twitter</strong><p>${escapeHtml(r.twitter || '')}</p></div>
            </div>
        `);
    } catch (error) {
        console.error(error);
        setModuleOutput('repurpose-output', '<p class="module-error">Unable to repurpose content.</p>');
    }
}

async function analyzeIdea() {
    const idea = document.getElementById('score-input').value.trim();
    if (!idea) return showToast('Enter an idea to score.');

    setModuleOutput('score-output', '<div class="module-loading">Scoring idea...</div>');
    try {
        const response = await apiPost('/api/analyze/idea', { idea });
        const score = response.scoring || {};
        setModuleOutput('score-output', `
            <div class="score-grid">
                <div class="score-pill"><span>Virality</span><strong>${escapeHtml(score.viralityScore || 0)}%</strong></div>
                <div class="score-pill"><span>CTR</span><strong>${escapeHtml(score.ctrPotential || 0)}%</strong></div>
                <div class="score-pill"><span>Engagement</span><strong>${escapeHtml(score.engagementProbability || 0)}%</strong></div>
                <div class="score-pill"><span>Competition</span><strong>${escapeHtml(score.competitionLevel || 0)}%</strong></div>
            </div>
            <p class="mini-explain">${escapeHtml(score.analysis || '')}</p>
        `);
    } catch (error) {
        console.error(error);
        setModuleOutput('score-output', '<p class="module-error">Unable to score idea.</p>');
    }
}

async function generateCaption() {
    const title = document.getElementById('caption-input').value.trim();
    const platform = document.getElementById('caption-platform').value;
    const tone = document.getElementById('caption-tone').value;
    if (!title) return showToast('Enter a title first.');

    setModuleOutput('caption-output', '<div class="module-loading">Generating caption...</div>');
    try {
        const response = await apiPost('/api/generate/caption', { title, platform, tone });
        const hashtags = response.hashtags || {};
        setModuleOutput('caption-output', `
            <div class="mini-card"><p>${escapeHtml(response.caption || '')}</p></div>
            <div class="hashtag-group">
                <div><strong>Small</strong><p>${escapeHtml((hashtags.small || []).join(' '))}</p></div>
                <div><strong>Medium</strong><p>${escapeHtml((hashtags.medium || []).join(' '))}</p></div>
                <div><strong>Viral</strong><p>${escapeHtml((hashtags.viral || []).join(' '))}</p></div>
            </div>
        `);
    } catch (error) {
        console.error(error);
        setModuleOutput('caption-output', '<p class="module-error">Unable to generate caption.</p>');
    }
}

async function enhancePrompt() {
    const prompt = document.getElementById('prompt-input').value.trim();
    if (!prompt) return showToast('Enter a weak prompt first.');

    setModuleOutput('prompt-output', '<div class="module-loading">Enhancing prompt...</div>');
    try {
        const response = await apiPost('/api/enhance-prompt', { prompt });
        setModuleOutput('prompt-output', `
            <div class="mini-card"><strong>Enhanced Prompt</strong><p>${escapeHtml(response.enhancedPrompt || '')}</p></div>
            <div class="mini-card"><strong>Why It Works</strong><p>${escapeHtml(response.whyItWorks || '')}</p></div>
        `);
    } catch (error) {
        console.error(error);
        setModuleOutput('prompt-output', '<p class="module-error">Unable to enhance prompt.</p>');
    }
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

async function loadAppState() {
    try {
        const state = await apiGet('/api/state');
        savedIdeas = state.savedIdeas || [];
        calendarState = normalizeCalendarState(state.calendar);
        dailyFeed = state.dailyFeed || { generatedAt: null, items: [] };
    } catch (error) {
        console.error(error);
        savedIdeas = [];
        calendarState = normalizeCalendarState();
        dailyFeed = { generatedAt: null, items: [] };
    }

    renderDailyFeed(dailyFeed);
        loadDailyFeedHistory();
}

async function apiGet(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
    }
    return response.json();
}

async function apiPost(url, body) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(error || `Request failed: ${response.status}`);
    }

    return response.json();
}

async function apiDelete(url, body) {
    const response = await fetch(url, {
        method: 'DELETE',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
        const error = await response.text();
        throw new Error(error || `Request failed: ${response.status}`);
    }
    return response.json();
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function initStatsObserver() {
    const stats = document.querySelectorAll('.stat-number');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const target = parseInt(entry.target.getAttribute('data-target'));
                animateValue(entry.target, 0, target, 2000);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });
    stats.forEach(s => observer.observe(s));
}

function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start).toLocaleString() + "+";
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}
