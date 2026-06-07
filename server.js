require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const path = require('path');
const {
  initDb,
  closeDb,
  getState,
  saveIdea,
  deleteIdea,
  addCalendarEntry,
  removeCalendarEntry,
  clearCalendar,
  saveScript,
  getScripts,
  getDailyFeed,
  getDailyFeedHistory,
  saveDailyFeed,
} = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';

const AI_PROVIDER = (process.env.AI_PROVIDER || (process.env.GROQ_API_KEY ? 'groq' : 'xai')).toLowerCase();
const AI_CONFIGS = {
  groq: {
    name: 'Groq Cloud',
    key: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    baseUrl: process.env.GROQ_API_BASE_URL || 'https://api.groq.com/openai/v1',
    maxTokensKey: 'max_completion_tokens',
  },
  xai: {
    name: 'xAI',
    key: process.env.XAI_API_KEY || process.env.GROK_API_KEY,
    model: process.env.XAI_MODEL || process.env.GROK_MODEL || 'grok-4.3',
    baseUrl: process.env.XAI_API_BASE_URL || process.env.GROK_API_BASE_URL || 'https://api.x.ai/v1',
    maxTokensKey: 'max_tokens',
  },
};
const AI_CONFIG = AI_CONFIGS[AI_PROVIDER] || AI_CONFIGS.groq;
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || process.env.GROQ_TIMEOUT_MS || process.env.XAI_TIMEOUT_MS || 90000);
const AI_MAX_TOKENS = Number(process.env.AI_MAX_TOKENS || process.env.GROQ_MAX_TOKENS || process.env.XAI_MAX_TOKENS || 1600);
const AI_TEMPERATURE = Number(process.env.AI_TEMPERATURE || process.env.GROQ_TEMPERATURE || process.env.XAI_TEMPERATURE || 0.75);
const AI_FALLBACKS_ENABLED = process.env.AI_FALLBACKS_ENABLED !== 'false';

const ALLOWED_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const ALLOWED_CATEGORIES = ['trending', 'educational', 'storytelling', 'lifestyle', 'challenge', 'beginner'];
const ALLOWED_PLATFORMS = ['YouTube', 'Reels', 'LinkedIn', 'Podcast', 'Shorts', 'Instagram', 'X', 'Twitter'];
const ALLOWED_TONES = ['Casual', 'Funny', 'Professional', 'Energetic', 'Storytelling'];
const ALLOWED_LENGTHS = ['30 sec', '60 sec', '3 min', '5-8 min'];
const SCRIPT_LABELS = ['Hook', 'Story', 'Value', 'CTA'];
const HOOK_TYPES = ['Curiosity', 'Emotional', 'Controversial', 'Direct', 'Short-form'];
const REPURPOSE_FORMATS = ['youtube', 'instagram', 'linkedin', 'twitter'];
const DAILY_FEED_SOURCES = ['google_trends', 'reddit', 'youtube', 'instagram', 'x'];

app.disable('x-powered-by');
app.set('trust proxy', 1);

const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
  fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
  imgSrc: ["'self'", 'data:'],
  connectSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  frameAncestors: ["'none'"],
  formAction: ["'self'"],
};

if (NODE_ENV === 'production') {
  cspDirectives.upgradeInsecureRequests = [];
}

app.use(helmet({ contentSecurityPolicy: { directives: cspDirectives } }));

const allowedOrigins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (allowedOrigins.length > 0) {
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Origin is not allowed by CORS'));
    },
  }));
}

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '100kb' }));

app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.API_RATE_LIMIT || 200),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many API requests. Please try again soon.' },
}));

app.use('/api/generate', rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: Number(process.env.AI_RATE_LIMIT || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests. Please slow down and try again soon.' },
}));

function cleanString(value, maxLength = 180) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function isConfiguredSecret(value) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return ![
    '',
    'your_xai_api_key_here',
    'your_groq_api_key_here',
    'your_grok_api_key_here',
    'replace-with-your-groq-api-key',
    'replace-with-your-xai-api-key',
    'replace-with-your-grok-api-key',
  ].includes(normalized);
}

function sendServerError(res, error, publicMessage = 'Something went wrong. Please try again.') {
  console.error(error);
  return res.status(500).json({ error: publicMessage });
}

function buildIdeasPrompt({ niche, platform, tone }) {
  return [
    `Generate exactly 4 content ideas for a ${platform} creator in the ${niche} niche with a ${tone} tone.`,
    'Return ONLY a valid JSON object in this shape:',
    '{"ideas":[{"title":"string","category":"trending|educational|storytelling|lifestyle|challenge|beginner","viralScore":88,"platform":"string"}]}',
    'Make each title specific, practical, and scroll-stopping. viralScore must be a number from 60 to 99.',
  ].join('\n');
}

function buildScriptPrompt({ title, length, tone, platform }) {
  return [
    `Write a humanized script for a ${length} ${platform} video titled: "${title}".`,
    `The tone must be ${tone}.`,
    'Return ONLY a valid JSON object with this shape:',
    '{"sections":[{"label":"Hook","timeRange":"0-5 sec","text":"string"},{"label":"Story","timeRange":"5-20 sec","text":"string"},{"label":"Value","timeRange":"20-45 sec","text":"string"},{"label":"CTA","timeRange":"45-60 sec","text":"string"}],"wordCount":140,"duration":"60 sec"}',
    'Use natural spoken language, short punchy lines, and emotion cues in square brackets like [pause], [smile], or [surprised].',
  ].join('\n');
}

function buildSectionPrompt({ label, tone }) {
  return [
    `Rewrite only the ${label} section for a creator script.`,
    `Tone: ${tone}.`,
    'Return ONLY a valid JSON object in this shape: {"text":"string"}.',
    'Keep it concise and natural for spoken video.',
  ].join('\n');
}

function safeJsonParse(text) {
  const cleaned = String(text || '')
    .trim()
    .replace(/^```json/i, '')
    .replace(/^```/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (_error) {
    const objectStart = cleaned.indexOf('{');
    const objectEnd = cleaned.lastIndexOf('}');

    if (objectStart !== -1 && objectEnd > objectStart) {
      return JSON.parse(cleaned.slice(objectStart, objectEnd + 1));
    }

    const arrayStart = cleaned.indexOf('[');
    const arrayEnd = cleaned.lastIndexOf(']');

    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      return JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1));
    }

    throw _error;
  }
}

function fallbackIdeas(platform = 'YouTube') {
  return [
    { title: 'I Tried The 5AM Creator Routine For 30 Days', category: 'challenge', viralScore: 92, platform },
    { title: 'Stop Planning Content Like This. Use This Instead.', category: 'educational', viralScore: 88, platform },
    { title: 'How I Turned One Idea Into Seven Posts', category: 'storytelling', viralScore: 79, platform },
    { title: '3 Free Tools Every Creator Should Set Up Today', category: 'trending', viralScore: 72, platform },
  ];
}

function fallbackScript(title) {
  return {
    wordCount: 145,
    duration: '45 sec',
    sections: [
      { label: 'Hook', timeRange: '0-5 sec', text: `Stop scrolling. [pause] If "${title}" is on your mind, this is the simple version you actually need.` },
      { label: 'Story', timeRange: '5-20 sec', text: "I used to overthink this for hours, write a huge plan, and then post nothing. [smile] The fix was making the idea small enough to record today." },
      { label: 'Value', timeRange: '20-40 sec', text: 'Start with one clear promise, one example, and one takeaway. That gives your audience a reason to stay and a reason to save.' },
      { label: 'CTA', timeRange: '40-45 sec', text: "Save this for your next content session, and follow for more creator systems that don't waste your day." },
    ],
  };
}

function fallbackSection() {
  return { text: "Here is the cleaner version. [pause] Say the main idea first, add one real example, then give people the next step." };
}

function fallbackHooks(title) {
  return [
    { type: 'Curiosity', text: `Most people get ${title} wrong in one tiny way.` },
    { type: 'Emotional', text: `I wish someone told me this before I tried ${title}.` },
    { type: 'Controversial', text: `Hot take: ${title} is failing because of this one mistake.` },
    { type: 'Short-form', text: `If you care about ${title}, watch this before you post again.` },
  ];
}

function fallbackTitlePack(title) {
  return {
    titles: [
      `The ${title} Method That Actually Works`,
      `I Tried ${title} So You Don't Have To`,
      `Why ${title} Is Getting Harder`,
    ],
    thumbnailText: [
      'STOP DOING THIS',
      'THE REAL FIX',
      'MOST CREATORS MISS THIS',
    ],
    thumbnailConcepts: [
      'Split-screen before/after with bold arrows',
      'One big promise headline with a shocked face',
      'Clean icon-based concept with 3-step layout',
    ],
  };
}

function fallbackRepurposing(idea, platform) {
  return {
    youtube: `YouTube title: ${idea}`,
    instagram: `Instagram caption: ${idea} — save this for later.`,
    linkedin: `LinkedIn post: Here's a practical way to think about ${idea}.`,
    twitter: `X post: ${idea}. Here is the concise version in one thread-ready line.`,
    platform,
  };
}

function fallbackScoring(idea) {
  return {
    viralityScore: 78,
    ctrPotential: 80,
    engagementProbability: 74,
    competitionLevel: 52,
    analysis: `Strong hook potential and clear audience intent around ${idea}.`,
  };
}

function fallbackCaptionPack(title) {
  return {
    caption: `Quick breakdown on ${title}. What would you add to this?`,
    hashtags: {
      small: ['#contenttips', '#creatorlife', '#marketing'],
      medium: ['#contentstrategy', '#creatorworkflow', '#viralcontent'],
      viral: ['#tiktoktips', '#youtubegrowth', '#instagramreels'],
    },
  };
}

function fallbackPromptEnhancement(prompt) {
  return {
    enhancedPrompt: `Create a creator-focused content idea from: ${prompt}. Make it specific, practical, and high-converting.`,
    whyItWorks: 'The prompt now includes intent, specificity, and a clear output goal.',
  };
}

function fallbackTrendItems() {
  return [
    { topic: 'AI tools for creators', source: 'google_trends', score: 91, angle: 'Build a practical workflow around this fast-growing topic.', refUrl: 'https://trends.google.com/' },
    { topic: 'Short-form video hooks', source: 'reddit', score: 84, angle: 'Creators want better retention and stronger opening lines.', refUrl: 'https://www.reddit.com/r/popular/' },
    { topic: 'Monetizing niche content', source: 'youtube', score: 81, angle: 'Turn audience trust into revenue with one clear offer.', refUrl: 'https://www.youtube.com/feed/trending' },
    { topic: 'Behind-the-scenes creator posts', source: 'instagram', score: 78, angle: 'Instagram is strong for workflow, proof, and visual storytelling.', refUrl: 'https://www.instagram.com/explore/' },
  ];
}

function buildHooksPrompt({ title, tone, platform }) {
  return [
    `Generate 5 viral hooks for the content idea: "${title}".`,
    `Platform: ${platform}. Tone: ${tone}.`,
    'Return ONLY valid JSON in this shape:',
    '{"hooks":[{"type":"Curiosity","text":"string"},{"type":"Emotional","text":"string"},{"type":"Controversial","text":"string"},{"type":"Direct","text":"string"},{"type":"Short-form","text":"string"}]}',
    'Each hook must be short, punchy, and suitable for social media openings.',
  ].join('\n');
}

function buildTitlePackPrompt({ idea, tone }) {
  return [
    `Create 3 clickable YouTube titles, 3 thumbnail text options, and 3 thumbnail concepts for: "${idea}".`,
    `Tone: ${tone}.`,
    'Return ONLY valid JSON in this shape:',
    '{"titles":["string"],"thumbnailText":["string"],"thumbnailConcepts":["string"]}',
    'Make the titles optimized for CTR and the thumbnail text extremely short.',
  ].join('\n');
}

function buildRepurposePrompt({ idea, tone }) {
  return [
    `Repurpose the idea "${idea}" into one YouTube title, one Instagram caption, one LinkedIn post, and one X/Twitter post.`,
    `Tone: ${tone}.`,
    'Return ONLY valid JSON in this shape:',
    '{"youtube":"string","instagram":"string","linkedin":"string","twitter":"string"}',
    'Keep each format native to its platform and creator-focused.',
  ].join('\n');
}

function buildScoringPrompt({ idea }) {
  return [
    `Analyze the idea "${idea}" and score it for virality, CTR potential, engagement probability, and competition.`,
    'Return ONLY valid JSON in this shape:',
    '{"viralityScore":88,"ctrPotential":86,"engagementProbability":79,"competitionLevel":41,"analysis":"string"}',
    'Scores must be numbers from 0 to 100. Lower competitionLevel means better opportunity.',
  ].join('\n');
}

function buildCaptionPrompt({ title, tone, platform }) {
  return [
    `Write a ready-to-post ${platform} caption for: "${title}".`,
    `Tone: ${tone}.`,
    'Also generate hashtags in three groups: small, medium, and viral.',
    'Return ONLY valid JSON in this shape:',
    '{"caption":"string","hashtags":{"small":["#tag"],"medium":["#tag"],"viral":["#tag"]}}',
    'Make it concise, clear, and highly usable.',
  ].join('\n');
}

function buildPromptEnhancerPrompt({ prompt }) {
  return [
    `Turn this rough prompt into a high-performing creator prompt: ${prompt}`,
    'Return ONLY valid JSON in this shape:',
    '{"enhancedPrompt":"string","whyItWorks":"string"}',
    'Make the prompt specific, structured, and easier for AI to execute well.',
  ].join('\n');
}

function buildTrendPrompt(trends) {
  return [
    'Turn the following live trend signals into 4 creator-ready daily viral content ideas.',
    'Return ONLY valid JSON in this shape:',
    '{"items":[{"title":"string","source":"google_trends|reddit|youtube|instagram|x","angle":"string","viralScore":88,"refUrl":"https://example.com"}]}',
    `Trend signals: ${JSON.stringify(trends)}`,
    'Make each idea highly specific, timely, and valuable for creators.',
  ].join('\n');
}

function normalizeHookResponse(parsed, title) {
  const source = Array.isArray(parsed?.hooks) ? parsed.hooks : [];
  const hooks = HOOK_TYPES.map((type, index) => {
    const match = source.find((hook) => cleanString(hook?.type, 30).toLowerCase() === type.toLowerCase()) || source[index];
    const text = cleanString(match?.text, 240);

    return {
      type,
      text: text || fallbackHooks(title)[index].text,
    };
  });

  return { hooks };
}

function normalizeTitlePackResponse(parsed, title) {
  const fallback = fallbackTitlePack(title);
  return {
    titles: Array.isArray(parsed?.titles) && parsed.titles.length ? parsed.titles.map((value) => cleanString(value, 120)).filter(Boolean).slice(0, 3) : fallback.titles,
    thumbnailText: Array.isArray(parsed?.thumbnailText) && parsed.thumbnailText.length ? parsed.thumbnailText.map((value) => cleanString(value, 60)).filter(Boolean).slice(0, 3) : fallback.thumbnailText,
    thumbnailConcepts: Array.isArray(parsed?.thumbnailConcepts) && parsed.thumbnailConcepts.length ? parsed.thumbnailConcepts.map((value) => cleanString(value, 200)).filter(Boolean).slice(0, 3) : fallback.thumbnailConcepts,
  };
}

function normalizeRepurposeResponse(parsed, idea, platform) {
  const fallback = fallbackRepurposing(idea, platform);
  return {
    youtube: cleanString(parsed?.youtube, 500) || fallback.youtube,
    instagram: cleanString(parsed?.instagram, 800) || fallback.instagram,
    linkedin: cleanString(parsed?.linkedin, 1200) || fallback.linkedin,
    twitter: cleanString(parsed?.twitter, 500) || fallback.twitter,
  };
}

function normalizeScoringResponse(parsed, idea) {
  const fallback = fallbackScoring(idea);
  const clampScore = (value, defaultValue) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return defaultValue;
    return Math.max(0, Math.min(100, Math.round(num)));
  };

  return {
    viralityScore: clampScore(parsed?.viralityScore, fallback.viralityScore),
    ctrPotential: clampScore(parsed?.ctrPotential, fallback.ctrPotential),
    engagementProbability: clampScore(parsed?.engagementProbability, fallback.engagementProbability),
    competitionLevel: clampScore(parsed?.competitionLevel, fallback.competitionLevel),
    analysis: cleanString(parsed?.analysis, 500) || fallback.analysis,
  };
}

function normalizeCaptionResponse(parsed, title) {
  const fallback = fallbackCaptionPack(title);
  const hashtags = parsed?.hashtags && typeof parsed.hashtags === 'object' ? parsed.hashtags : {};

  return {
    caption: cleanString(parsed?.caption, 1200) || fallback.caption,
    hashtags: {
      small: Array.isArray(hashtags.small) ? hashtags.small.map((value) => cleanString(value, 40)).filter(Boolean).slice(0, 10) : fallback.hashtags.small,
      medium: Array.isArray(hashtags.medium) ? hashtags.medium.map((value) => cleanString(value, 40)).filter(Boolean).slice(0, 10) : fallback.hashtags.medium,
      viral: Array.isArray(hashtags.viral) ? hashtags.viral.map((value) => cleanString(value, 40)).filter(Boolean).slice(0, 10) : fallback.hashtags.viral,
    },
  };
}

function normalizePromptEnhancerResponse(parsed, prompt) {
  const fallback = fallbackPromptEnhancement(prompt);
  return {
    enhancedPrompt: cleanString(parsed?.enhancedPrompt, 2000) || fallback.enhancedPrompt,
    whyItWorks: cleanString(parsed?.whyItWorks, 500) || fallback.whyItWorks,
  };
}

function normalizeTrendItems(items) {
  const fallback = fallbackTrendItems();
  const source = Array.isArray(items) ? items : [];
  const normalized = source
    .map((item) => ({
      topic: cleanString(item?.topic || item?.title, 140),
      source: DAILY_FEED_SOURCES.includes(cleanString(item?.source, 30)) ? cleanString(item?.source, 30) : 'google_trends',
      score: Math.max(0, Math.min(100, Math.round(Number(item?.score ?? item?.viralScore ?? 75)))),
      angle: cleanString(item?.angle, 240),
      refUrl: cleanString(item?.refUrl || item?.url || item?.link, 500),
    }))
    .filter((item) => item.topic);

  const merged = [...normalized, ...fallback].slice(0, 4);
  return merged.map((item) => ({
    ...item,
    score: Number.isFinite(item.score) ? item.score : 75,
  }));
}

async function fetchGoogleTrends(region = 'US') {
  try {
    const response = await fetch(`https://trends.google.com/trends/api/dailytrends?hl=en-US&tz=0&geo=${encodeURIComponent(region)}&ns=15`);
    if (!response.ok) return [];
    const text = await response.text();
    const cleaned = text.replace(/^\)\]\}',?\n/, '');
    const data = JSON.parse(cleaned);
    const searches = data?.default?.trendingSearchesDays?.[0]?.trendingSearches || [];

    const parseTraffic = (value) => {
      const digits = String(value || '').replace(/[^\d]/g, '');
      const number = Number(digits);
      return Number.isFinite(number) ? number : 0;
    };

    return searches.slice(0, 6).map((item) => ({
      topic: cleanString(item?.title?.query || item?.title?.exploreLink?.query, 140),
      source: 'google_trends',
      score: Math.max(70, Math.min(99, Math.round(parseTraffic(item?.formattedTraffic) / 1000 + 70) || 85)),
      angle: cleanString(item?.articles?.[0]?.snippet || item?.articles?.[0]?.title, 240),
      refUrl: cleanString(item?.articles?.[0]?.url || item?.title?.exploreLink, 500),
    })).filter((item) => item.topic);
  } catch (error) {
    console.error('Google Trends fetch failed:', error.message);
    return [];
  }
}

async function fetchRedditTrends() {
  try {
    const response = await fetch('https://www.reddit.com/r/popular.json?limit=10');
    if (!response.ok) return [];
    const data = await response.json();
    return (data?.data?.children || []).slice(0, 5).map((child) => ({
      topic: cleanString(child?.data?.title, 140),
      source: 'reddit',
      score: Math.max(70, Math.min(95, Math.round((Number(child?.data?.score) || 0) / 1000 + 72))),
      angle: cleanString(child?.data?.subreddit_name_prefixed || 'Reddit discussion', 240),
      refUrl: cleanString(child?.data?.permalink ? `https://www.reddit.com${child.data.permalink}` : '', 500),
    })).filter((item) => item.topic);
  } catch (error) {
    console.error('Reddit trends fetch failed:', error.message);
    return [];
  }
}

async function fetchYouTubeTrends() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return [];

  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'snippet,statistics');
    url.searchParams.set('chart', 'mostPopular');
    url.searchParams.set('regionCode', process.env.YOUTUBE_REGION || 'US');
    url.searchParams.set('maxResults', '10');
    url.searchParams.set('key', apiKey);

    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();

    return (data?.items || []).slice(0, 5).map((item) => ({
      topic: cleanString(item?.snippet?.title, 140),
      source: 'youtube',
      score: Math.max(72, Math.min(98, Math.round((Number(item?.statistics?.viewCount) || 0) / 1000000 + 74))),
      angle: cleanString(item?.snippet?.channelTitle || 'YouTube trending video', 240),
      refUrl: cleanString(item?.id ? `https://www.youtube.com/watch?v=${item.id}` : '', 500),
    })).filter((item) => item.topic);
  } catch (error) {
    console.error('YouTube trends fetch failed:', error.message);
    return [];
  }
}

async function fetchInstagramTrends() {
  const sourceUrl = process.env.INSTAGRAM_TRENDS_URL;
  if (!sourceUrl) return [];

  try {
    const response = await fetch(sourceUrl);
    if (!response.ok) return [];

    const contentType = response.headers.get('content-type') || '';
    let payload;

    if (contentType.includes('application/json')) {
      payload = await response.json();
    } else {
      const text = await response.text();
      payload = {
        items: text
          .split(/\r?\n/)
          .map((line) => cleanString(line, 180))
          .filter(Boolean)
          .slice(0, 5)
          .map((topic) => ({ topic })),
      };
    }

    const items = Array.isArray(payload) ? payload : (payload?.items || payload?.data || []);
    return items.slice(0, 5).map((item) => ({
      topic: cleanString(item?.topic || item?.title || item?.name, 140),
      source: 'instagram',
      score: Math.max(70, Math.min(96, Math.round(Number(item?.score || item?.virality || 78)))),
      angle: cleanString(item?.angle || item?.caption || item?.summary || 'Instagram trend signal', 240),
      refUrl: cleanString(item?.refUrl || item?.url || item?.link, 500),
    })).filter((item) => item.topic);
  } catch (error) {
    console.error('Instagram trends fetch failed:', error.message);
    return [];
  }
}

async function fetchXTrends() {
  const sourceUrl = process.env.X_TRENDS_URL;
  if (!sourceUrl) return [];

  try {
    const response = await fetch(sourceUrl);
    if (!response.ok) return [];

    const contentType = response.headers.get('content-type') || '';
    let payload;

    if (contentType.includes('application/json')) {
      payload = await response.json();
    } else {
      const text = await response.text();
      payload = {
        items: text
          .split(/\r?\n/)
          .map((line) => cleanString(line, 180))
          .filter(Boolean)
          .slice(0, 5)
          .map((topic) => ({ topic })),
      };
    }

    const items = Array.isArray(payload) ? payload : (payload?.items || payload?.data || []);
    return items.slice(0, 5).map((item) => ({
      topic: cleanString(item?.topic || item?.title || item?.name, 140),
      source: 'x',
      score: Math.max(70, Math.min(96, Math.round(Number(item?.score || item?.virality || 78)))),
      angle: cleanString(item?.angle || item?.text || item?.summary || 'X trend signal', 240),
      refUrl: cleanString(item?.refUrl || item?.url || item?.link, 500),
    })).filter((item) => item.topic);
  } catch (error) {
    console.error('X trends fetch failed:', error.message);
    return [];
  }
}

async function collectTrendSignals(region = 'US') {
  const [google, reddit, youtube] = await Promise.all([
    fetchGoogleTrends(region),
    fetchRedditTrends(),
    fetchYouTubeTrends(),
  ]);

  const [instagram, x] = await Promise.all([
    fetchInstagramTrends(),
    fetchXTrends(),
  ]);

  return normalizeTrendItems([...google, ...reddit, ...youtube, ...instagram, ...x]);
}

function normalizeCategory(category) {
  const cleaned = cleanString(category, 30).toLowerCase();
  return ALLOWED_CATEGORIES.includes(cleaned) ? cleaned : 'educational';
}

function normalizeIdea(idea, platform) {
  const title = cleanString(idea?.title, 160);
  const score = Number(idea?.viralScore);

  if (!title || !Number.isFinite(score)) {
    return null;
  }

  return {
    title,
    category: normalizeCategory(idea.category),
    viralScore: Math.max(60, Math.min(99, Math.round(score))),
    platform: ALLOWED_PLATFORMS.includes(idea.platform) ? idea.platform : platform,
  };
}

function normalizeIdeasResponse(parsed, defaults) {
  const source = Array.isArray(parsed) ? parsed : parsed?.ideas;
  const normalized = Array.isArray(source)
    ? source.map((idea) => normalizeIdea(idea, defaults.platform)).filter(Boolean)
    : [];

  const backup = fallbackIdeas(defaults.platform);

  return [...normalized, ...backup].slice(0, 4);
}

function countWords(sections) {
  return sections.reduce((total, section) => {
    return total + cleanString(section.text, 4000).split(/\s+/).filter(Boolean).length;
  }, 0);
}

function normalizeScriptResponse(parsed, title) {
  if (!parsed || !Array.isArray(parsed.sections)) {
    throw new Error('AI response did not include script sections.');
  }

  const sections = SCRIPT_LABELS.map((label, index) => {
    const match = parsed.sections.find((section) => cleanString(section?.label, 20) === label) || parsed.sections[index];
    const text = cleanString(match?.text, 2500);

    if (!text) {
      throw new Error(`AI response did not include text for ${label}.`);
    }

    return {
      label,
      timeRange: cleanString(match?.timeRange, 40) || `${index * 15}-${(index + 1) * 15} sec`,
      text,
    };
  });

  return {
    wordCount: Number.isFinite(Number(parsed.wordCount)) ? Math.round(Number(parsed.wordCount)) : countWords(sections),
    duration: cleanString(parsed.duration, 40) || fallbackScript(title).duration,
    sections,
  };
}

function normalizeSectionResponse(parsed) {
  const text = cleanString(parsed?.text, 2500);

  if (!text) {
    throw new Error('AI response did not include section text.');
  }

  return { text };
}

async function callAI(prompt) {
  if (!isConfiguredSecret(AI_CONFIG.key)) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  const body = {
    model: AI_CONFIG.model,
    temperature: AI_TEMPERATURE,
    stream: false,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You are SPARKR AI, a practical content strategy assistant. Return only valid JSON.',
      },
      { role: 'user', content: prompt },
    ],
  };

  body[AI_CONFIG.maxTokensKey] = AI_MAX_TOKENS;

  try {
    const response = await fetch(`${AI_CONFIG.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${AI_CONFIG.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${AI_CONFIG.name} request failed: ${response.status} ${text.slice(0, 500)}`);
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content || null;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateJson(prompt) {
  const content = await callAI(prompt);
  return content ? safeJsonParse(content) : null;
}

function isFeedStale(feed) {
  if (!feed?.generatedAt) {
    return true;
  }

  const generatedAt = new Date(feed.generatedAt).getTime();
  if (!Number.isFinite(generatedAt)) {
    return true;
  }

  return Date.now() - generatedAt > 20 * 60 * 60 * 1000;
}

async function refreshDailyFeed(region = 'US') {
  const trendSignals = await collectTrendSignals(region);
  const parsed = await generateJson(buildTrendPrompt(trendSignals));
  const items = normalizeTrendItems(parsed?.items || parsed?.ideas || parsed || trendSignals);
  const feed = {
    generatedAt: new Date().toISOString(),
    items,
  };

  await saveDailyFeed(feed);
  return feed;
}

let dailyFeedTimer = null;

function scheduleDailyFeedRefresh() {
  if (dailyFeedTimer) {
    clearTimeout(dailyFeedTimer);
  }

  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setHours(8, 0, 0, 0);

  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  const msUntilNextRun = nextRun.getTime() - now.getTime();

  dailyFeedTimer = setTimeout(async () => {
    try {
      await refreshDailyFeed(process.env.DAILY_FEED_REGION || 'US');
    } catch (error) {
      console.error('Daily feed refresh failed:', error);
    } finally {
      scheduleDailyFeedRefresh();
    }
  }, msUntilNextRun);

  if (typeof dailyFeedTimer.unref === 'function') {
    dailyFeedTimer.unref();
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    environment: NODE_ENV,
    database: 'mongodb',
    aiProvider: AI_PROVIDER,
    aiProviderName: AI_CONFIG.name,
    aiModel: AI_CONFIG.model,
    aiConfigured: isConfiguredSecret(AI_CONFIG.key),
  });
});

app.get('/api/state', async (_req, res) => {
  try {
    res.json(await getState());
  } catch (error) {
    sendServerError(res, error, 'Unable to load app state.');
  }
});

app.post('/api/generate/ideas', async (req, res) => {
  const niche = cleanString(req.body?.niche, 80);
  const platform = cleanString(req.body?.platform, 30);
  const tone = cleanString(req.body?.tone, 30);

  if (!niche || !ALLOWED_PLATFORMS.includes(platform) || !ALLOWED_TONES.includes(tone)) {
    return res.status(400).json({ error: 'Valid niche, platform, and tone are required.' });
  }

  try {
    const parsed = await generateJson(buildIdeasPrompt({ niche, platform, tone }));
    const ideas = parsed ? normalizeIdeasResponse(parsed, { platform }) : fallbackIdeas(platform);
    return res.json({ ideas, fallback: !parsed });
  } catch (error) {
    console.error(error);

    if (!AI_FALLBACKS_ENABLED) {
      return res.status(502).json({ error: `AI generation failed. Check your ${AI_CONFIG.name} key and model access.` });
    }

    return res.json({ ideas: fallbackIdeas(platform), fallback: true });
  }
});

app.post('/api/generate/script', async (req, res) => {
  const title = cleanString(req.body?.title, 160);
  const length = cleanString(req.body?.length, 30);
  const tone = cleanString(req.body?.tone, 30);
  const platform = cleanString(req.body?.platform, 30);

  if (!title || !ALLOWED_LENGTHS.includes(length) || !ALLOWED_TONES.includes(tone) || !ALLOWED_PLATFORMS.includes(platform)) {
    return res.status(400).json({ error: 'Valid title, length, tone, and platform are required.' });
  }

  try {
    const parsed = await generateJson(buildScriptPrompt({ title, length, tone, platform }));
    const script = parsed ? normalizeScriptResponse(parsed, title) : fallbackScript(title);
    const saved = await saveScript({ title, length, tone, platform, ...script });
    return res.json({ script: { ...script, id: saved.id }, saved: true, fallback: !parsed });
  } catch (error) {
    console.error(error);

    if (!AI_FALLBACKS_ENABLED) {
      return res.status(502).json({ error: `AI script generation failed. Check your ${AI_CONFIG.name} key and model access.` });
    }

    const script = fallbackScript(title);
    const saved = await saveScript({ title, length, tone, platform, ...script });
    return res.json({ script: { ...script, id: saved.id }, saved: true, fallback: true });
  }
});

app.post('/api/generate/section', async (req, res) => {
  const label = cleanString(req.body?.label, 20);
  const tone = cleanString(req.body?.tone, 30);

  if (!SCRIPT_LABELS.includes(label) || !ALLOWED_TONES.includes(tone)) {
    return res.status(400).json({ error: 'Valid section label and tone are required.' });
  }

  try {
    const parsed = await generateJson(buildSectionPrompt({ label, tone }));
    const section = parsed ? normalizeSectionResponse(parsed) : fallbackSection();
    return res.json({ section, fallback: !parsed });
  } catch (error) {
    console.error(error);

    if (!AI_FALLBACKS_ENABLED) {
      return res.status(502).json({ error: `AI section generation failed. Check your ${AI_CONFIG.name} key and model access.` });
    }

    return res.json({ section: fallbackSection(), fallback: true });
  }
});

app.get('/api/scripts', async (req, res) => {
  try {
    const limit = Number(req.query.limit || 20);
    return res.json({ scripts: await getScripts(limit) });
  } catch (error) {
    sendServerError(res, error, 'Unable to load scripts.');
  }
});

app.post('/api/ideas', async (req, res) => {
  try {
    const title = cleanString(req.body?.title, 160);
    const category = normalizeCategory(req.body?.category);
    const viralScore = Number(req.body?.viralScore);
    const platform = cleanString(req.body?.platform, 30);
    const niche = cleanString(req.body?.niche, 80);
    const tone = cleanString(req.body?.tone, 30);

    if (!title || !Number.isFinite(viralScore) || viralScore < 0 || viralScore > 100 || !ALLOWED_PLATFORMS.includes(platform)) {
      return res.status(400).json({ error: 'Valid title, category, viralScore, and platform are required.' });
    }

    const saved = await saveIdea({
      title,
      category,
      viralScore: Math.round(viralScore),
      platform,
      niche,
      tone,
    });

    return res.status(201).json({ idea: saved });
  } catch (error) {
    sendServerError(res, error, 'Unable to save idea.');
  }
});

app.delete('/api/ideas/:id', async (req, res) => {
  try {
    const deleted = await deleteIdea(req.params.id);

    if (!deleted) {
      return res.status(404).json({ error: 'Idea not found.' });
    }

    return res.json({ ok: true });
  } catch (error) {
    sendServerError(res, error, 'Unable to delete idea.');
  }
});

app.post('/api/calendar', async (req, res) => {
  try {
    const day = cleanString(req.body?.day, 10);
    const title = cleanString(req.body?.title, 160);

    if (!ALLOWED_DAYS.includes(day) || !title) {
      return res.status(400).json({ error: 'Valid day and title are required.' });
    }

    return res.json(await addCalendarEntry(day, title));
  } catch (error) {
    sendServerError(res, error, 'Unable to update calendar.');
  }
});

app.delete('/api/calendar', async (req, res) => {
  try {
    const day = cleanString(req.body?.day, 10);
    const title = cleanString(req.body?.title, 160);

    if (!ALLOWED_DAYS.includes(day) || !title) {
      return res.status(400).json({ error: 'Valid day and title are required.' });
    }

    return res.json(await removeCalendarEntry(day, title));
  } catch (error) {
    sendServerError(res, error, 'Unable to update calendar.');
  }
});

app.post('/api/calendar/clear', async (_req, res) => {
  try {
    return res.json(await clearCalendar());
  } catch (error) {
    sendServerError(res, error, 'Unable to clear calendar.');
  }
});

app.get('/api/trends', async (req, res) => {
  try {
    const region = cleanString(req.query.region || process.env.DAILY_FEED_REGION || 'US', 10).toUpperCase() || 'US';
    const trends = await collectTrendSignals(region);
    return res.json({ region, trends });
  } catch (error) {
    sendServerError(res, error, 'Unable to load trends.');
  }
});

app.get('/api/daily-feed', async (_req, res) => {
  try {
    const feed = await getDailyFeed();
    return res.json({ feed, fresh: !isFeedStale(feed) });
  } catch (error) {
    sendServerError(res, error, 'Unable to load daily feed.');
  }
});

app.get('/api/daily-feed/history', async (req, res) => {
  try {
    const limit = Number(req.query.limit || 7);
    const history = await getDailyFeedHistory(limit);
    return res.json({ history });
  } catch (error) {
    sendServerError(res, error, 'Unable to load daily feed history.');
  }
});

app.post('/api/daily-feed/refresh', async (req, res) => {
  try {
    const region = cleanString(req.body?.region || process.env.DAILY_FEED_REGION || 'US', 10).toUpperCase() || 'US';
    const feed = await refreshDailyFeed(region);
    return res.json({ feed, fresh: true });
  } catch (error) {
    sendServerError(res, error, 'Unable to refresh daily feed.');
  }
});

app.post('/api/generate/hooks', async (req, res) => {
  const title = cleanString(req.body?.title, 160);
  const tone = cleanString(req.body?.tone, 30);
  const platform = cleanString(req.body?.platform, 30);

  if (!title || !ALLOWED_TONES.includes(tone) || !platform) {
    return res.status(400).json({ error: 'Valid title, tone, and platform are required.' });
  }

  try {
    const parsed = await generateJson(buildHooksPrompt({ title, tone, platform }));
    const hooks = parsed ? normalizeHookResponse(parsed, title) : { hooks: fallbackHooks(title) };
    return res.json({ ...hooks, fallback: !parsed });
  } catch (error) {
    console.error(error);

    if (!AI_FALLBACKS_ENABLED) {
      return res.status(502).json({ error: `AI hook generation failed. Check your ${AI_CONFIG.name} key and model access.` });
    }

    return res.json({ hooks: fallbackHooks(title), fallback: true });
  }
});

app.post('/api/generate/title-pack', async (req, res) => {
  const idea = cleanString(req.body?.idea || req.body?.title, 160);
  const tone = cleanString(req.body?.tone, 30);

  if (!idea || !ALLOWED_TONES.includes(tone)) {
    return res.status(400).json({ error: 'Valid idea and tone are required.' });
  }

  try {
    const parsed = await generateJson(buildTitlePackPrompt({ idea, tone }));
    const pack = parsed ? normalizeTitlePackResponse(parsed, idea) : fallbackTitlePack(idea);
    return res.json({ ...pack, fallback: !parsed });
  } catch (error) {
    console.error(error);

    if (!AI_FALLBACKS_ENABLED) {
      return res.status(502).json({ error: `AI title generation failed. Check your ${AI_CONFIG.name} key and model access.` });
    }

    return res.json({ ...fallbackTitlePack(idea), fallback: true });
  }
});

app.post('/api/generate/repurpose', async (req, res) => {
  const idea = cleanString(req.body?.idea || req.body?.title, 220);
  const tone = cleanString(req.body?.tone, 30);

  if (!idea || !ALLOWED_TONES.includes(tone)) {
    return res.status(400).json({ error: 'Valid idea and tone are required.' });
  }

  try {
    const parsed = await generateJson(buildRepurposePrompt({ idea, tone }));
    const repurpose = parsed ? normalizeRepurposeResponse(parsed, idea, 'multi-platform') : fallbackRepurposing(idea, 'multi-platform');
    return res.json({ repurpose, fallback: !parsed });
  } catch (error) {
    console.error(error);

    if (!AI_FALLBACKS_ENABLED) {
      return res.status(502).json({ error: `AI repurposing failed. Check your ${AI_CONFIG.name} key and model access.` });
    }

    return res.json({ repurpose: fallbackRepurposing(idea, 'multi-platform'), fallback: true });
  }
});

app.post('/api/analyze/idea', async (req, res) => {
  const idea = cleanString(req.body?.idea || req.body?.title, 220);

  if (!idea) {
    return res.status(400).json({ error: 'Valid idea is required.' });
  }

  try {
    const parsed = await generateJson(buildScoringPrompt({ idea }));
    const scoring = parsed ? normalizeScoringResponse(parsed, idea) : fallbackScoring(idea);
    return res.json({ scoring, fallback: !parsed });
  } catch (error) {
    console.error(error);

    if (!AI_FALLBACKS_ENABLED) {
      return res.status(502).json({ error: `AI scoring failed. Check your ${AI_CONFIG.name} key and model access.` });
    }

    return res.json({ scoring: fallbackScoring(idea), fallback: true });
  }
});

app.post('/api/generate/caption', async (req, res) => {
  const title = cleanString(req.body?.title || req.body?.idea, 160);
  const tone = cleanString(req.body?.tone, 30);
  const platform = cleanString(req.body?.platform, 30) || 'Instagram';

  if (!title || !ALLOWED_TONES.includes(tone)) {
    return res.status(400).json({ error: 'Valid title and tone are required.' });
  }

  try {
    const parsed = await generateJson(buildCaptionPrompt({ title, tone, platform }));
    const caption = parsed ? normalizeCaptionResponse(parsed, title) : fallbackCaptionPack(title);
    return res.json({ ...caption, fallback: !parsed });
  } catch (error) {
    console.error(error);

    if (!AI_FALLBACKS_ENABLED) {
      return res.status(502).json({ error: `AI caption generation failed. Check your ${AI_CONFIG.name} key and model access.` });
    }

    return res.json({ ...fallbackCaptionPack(title), fallback: true });
  }
});

app.post('/api/enhance-prompt', async (req, res) => {
  const prompt = cleanString(req.body?.prompt, 500);

  if (!prompt) {
    return res.status(400).json({ error: 'Valid prompt is required.' });
  }

  try {
    const parsed = await generateJson(buildPromptEnhancerPrompt({ prompt }));
    const result = parsed ? normalizePromptEnhancerResponse(parsed, prompt) : fallbackPromptEnhancement(prompt);
    return res.json({ ...result, fallback: !parsed });
  } catch (error) {
    console.error(error);

    if (!AI_FALLBACKS_ENABLED) {
      return res.status(502).json({ error: `AI prompt enhancement failed. Check your ${AI_CONFIG.name} key and model access.` });
    }

    return res.json({ ...fallbackPromptEnhancement(prompt), fallback: true });
  }
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/index.html', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/style.css', (_req, res) => {
  res.sendFile(path.join(__dirname, 'style.css'));
});

app.get('/app.js', (_req, res) => {
  res.sendFile(path.join(__dirname, 'app.js'));
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

async function shutdown(signal) {
  console.log(`${signal} received. Closing MongoDB connection...`);
  await closeDb();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

(async () => {
  try {
    await initDb();
    const currentFeed = await getDailyFeed();
    if (isFeedStale(currentFeed)) {
      await refreshDailyFeed(process.env.DAILY_FEED_REGION || 'US');
    }
    scheduleDailyFeedRefresh();
    app.listen(PORT, () => {
      console.log(`SPARKR AI running on http://localhost:${PORT}`);
      console.log(`MongoDB connected. ${AI_CONFIG.name} model: ${AI_CONFIG.model}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
})();
