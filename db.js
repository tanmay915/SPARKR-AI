const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

const DEFAULT_DB_NAME = 'sparkr_ai';
const CALENDAR_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

let client;
let database;
let savedIdeas;
let calendarEntries;
let scripts;
let dailyFeed;

let useLocalFallback = false;
const dataDir = path.join(__dirname, 'data');
const localStateFiles = {
  ideas: path.join(dataDir, 'saved_ideas.json'),
  calendar: path.join(dataDir, 'calendar.json'),
  scripts: path.join(dataDir, 'scripts.json'),
  dailyFeed: path.join(dataDir, 'daily_feed.json'),
};

let localSavedIdeas = [];
let localCalendar = {};
let localScripts = [];
let localDailyFeed = { generatedAt: null, items: [] };
let localDailyFeedHistory = [];

function ensureDataDir() {
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  } catch (_e) {
  }
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw || 'null') || fallback;
  } catch (_e) {
    return fallback;
  }
}

function writeJson(file, obj) {
  try {
    fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write', file, e.message);
  }
}

function loadLocalState() {
  ensureDataDir();
  localSavedIdeas = readJson(localStateFiles.ideas, []);
  localCalendar = readJson(localStateFiles.calendar, CALENDAR_DAYS.reduce((s, d) => (s[d] = [], s), {}));
  localScripts = readJson(localStateFiles.scripts, []);
  const savedFeed = readJson(localStateFiles.dailyFeed, { generatedAt: null, items: [] });
  if (Array.isArray(savedFeed)) {
    localDailyFeedHistory = savedFeed;
    localDailyFeed = savedFeed[0] || { generatedAt: null, items: [] };
  } else {
    localDailyFeed = savedFeed.latest || savedFeed;
    localDailyFeedHistory = Array.isArray(savedFeed.history) ? savedFeed.history : (savedFeed.generatedAt ? [savedFeed] : []);
  }
}

function enableLocalFallback(reason) {
  if (!useLocalFallback) {
    console.warn(`Switching to local JSON fallback${reason ? `: ${reason}` : ''}`);
  }
  useLocalFallback = true;
  loadLocalState();
}

function isMongoReady() {
  return !useLocalFallback && savedIdeas && calendarEntries && scripts && dailyFeed;
}

function trimHistory(history, limit = 7) {
  return history.slice(0, limit);
}

function cleanEnv(value) {
  return String(value || '').trim();
}

function isPlaceholder(value) {
  return /^replace-with-|^your_|<.+>$/.test(cleanEnv(value).toLowerCase());
}

function stripMongoProtocol(host) {
  return cleanEnv(host)
    .replace(/^mongodb(\+srv)?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/\?.*$/, '');
}

function buildMongoUriFromParts() {
  const host = stripMongoProtocol(process.env.MONGODB_HOST);

  if (!host || isPlaceholder(host)) {
    return null;
  }

  const protocol = cleanEnv(process.env.MONGODB_PROTOCOL) || (host.includes('localhost') || host.startsWith('127.') ? 'mongodb' : 'mongodb+srv');
  const username = cleanEnv(process.env.MONGODB_USERNAME || process.env.MONGODB_USER);
  const password = cleanEnv(process.env.MONGODB_PASSWORD || process.env.MONGODB_PASS);
  const dbName = cleanEnv(process.env.MONGODB_DB) || DEFAULT_DB_NAME;
  const options = cleanEnv(process.env.MONGODB_OPTIONS) || (protocol === 'mongodb+srv' ? 'retryWrites=true&w=majority' : '');
  const auth = username && password && !isPlaceholder(username) && !isPlaceholder(password)
    ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
    : '';

  return `${protocol}://${auth}${host}/${encodeURIComponent(dbName)}${options ? `?${options}` : ''}`;
}

function getMongoUri() {
  return buildMongoUriFromParts() || cleanEnv(process.env.MONGODB_URI);
}

function getDatabaseName(uri) {
  if (process.env.MONGODB_DB) {
    return process.env.MONGODB_DB;
  }

  try {
    const parsed = new URL(uri);
    const dbName = parsed.pathname.replace(/^\//, '').trim();
    return dbName || DEFAULT_DB_NAME;
  } catch (_error) {
    return DEFAULT_DB_NAME;
  }
}

function normalizeId(document) {
  if (!document) {
    return null;
  }

  if (document.id && !document._id) {
    return {
      ...document,
      id: String(document.id),
    };
  }

  const { _id, ...rest } = document;
  return {
    id: _id ? _id.toString() : String(rest.id || ''),
    ...rest,
  };
}

function getObjectId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

async function initDb() {
  const uri = getMongoUri();

  if (!uri) {
    enableLocalFallback('MongoDB URI not configured');
    console.warn('MongoDB URI not configured; using local JSON fallback.');
    return;
  }

  client = new MongoClient(uri, {
    appName: 'sparkr-ai',
    maxPoolSize: 10,
    serverSelectionTimeoutMS: Number(process.env.MONGODB_TIMEOUT_MS || 8000),
  });

  try {
    await client.connect();
    database = client.db(getDatabaseName(uri));
    savedIdeas = database.collection('saved_ideas');
    calendarEntries = database.collection('calendar_entries');
    scripts = database.collection('scripts');
    dailyFeed = database.collection('daily_feed');

    await Promise.all([
      savedIdeas.createIndex({ title: 1 }, { unique: true }),
      savedIdeas.createIndex({ createdAt: -1 }),
      calendarEntries.createIndex({ day: 1, title: 1 }, { unique: true }),
      scripts.createIndex({ createdAt: -1 }),
      dailyFeed.createIndex({ generatedAt: -1 }),
    ]);
    useLocalFallback = false;
  } catch (err) {
    console.error('Failed to connect to MongoDB, switching to local JSON fallback:', err.message);
    enableLocalFallback('MongoDB connection failure');
  }
}

async function getState() {
  if (!isMongoReady()) {
    if (!useLocalFallback) {
      enableLocalFallback('MongoDB collections unavailable');
    }
    return {
      savedIdeas: localSavedIdeas.map(normalizeId),
      calendar: localCalendar,
      dailyFeed: localDailyFeed,
    };
  }

  const [ideas, calendarRows] = await Promise.all([
    savedIdeas.find({}).sort({ createdAt: -1, _id: -1 }).toArray(),
    calendarEntries.find({}).sort({ createdAt: 1, _id: 1 }).toArray(),
  ]);

  const calendar = CALENDAR_DAYS.reduce((state, day) => {
    state[day] = [];
    return state;
  }, {});

  calendarRows.forEach(({ day, title }) => {
    if (calendar[day] && !calendar[day].includes(title)) {
      calendar[day].push(title);
    }
  });

  return {
    savedIdeas: ideas.map(normalizeId),
    calendar,
    dailyFeed: await getDailyFeed(),
  };
}

async function saveIdea(idea) {
  const now = new Date();
  const document = {
    title: idea.title,
    category: idea.category,
    viralScore: idea.viralScore,
    platform: idea.platform,
    niche: idea.niche || null,
    tone: idea.tone || null,
    updatedAt: now,
  };
  if (!isMongoReady()) {
    if (!useLocalFallback) {
      enableLocalFallback('MongoDB collections unavailable');
    }
    const existing = localSavedIdeas.findIndex(s => s.title === document.title);
    if (existing !== -1) {
      localSavedIdeas[existing] = { ...localSavedIdeas[existing], ...document, updatedAt: now };
    } else {
      localSavedIdeas.unshift({ id: `${Date.now()}-${Math.floor(Math.random()*1000)}`, ...document, createdAt: now });
    }
    writeJson(localStateFiles.ideas, localSavedIdeas);
    return normalizeId(localSavedIdeas.find(s => s.title === document.title));
  }

  await savedIdeas.updateOne(
    { title: document.title },
    {
      $set: document,
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  return normalizeId(await savedIdeas.findOne({ title: document.title }));
}

async function getDailyFeed() {
  if (!isMongoReady()) {
    if (!useLocalFallback) {
      enableLocalFallback('MongoDB collections unavailable');
    }
    return localDailyFeed;
  }

  const row = await dailyFeed.findOne({}, { sort: { generatedAt: -1, _id: -1 } });
  return row ? normalizeId(row) : { generatedAt: null, items: [] };
}

async function getDailyFeedHistory(limit = 7) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 7, 20));

  if (!isMongoReady()) {
    if (!useLocalFallback) {
      enableLocalFallback('MongoDB collections unavailable');
    }
    return trimHistory(localDailyFeedHistory, safeLimit).map(normalizeId);
  }

  const rows = await dailyFeed.find({}).sort({ generatedAt: -1, _id: -1 }).limit(safeLimit).toArray();
  return rows.map(normalizeId);
}

async function saveDailyFeed(feed) {
  const document = {
    generatedAt: feed.generatedAt ? new Date(feed.generatedAt) : new Date(),
    items: Array.isArray(feed.items) ? feed.items : [],
  };

  if (!isMongoReady()) {
    if (!useLocalFallback) {
      enableLocalFallback('MongoDB collections unavailable');
    }
    localDailyFeed = {
      generatedAt: document.generatedAt.toISOString(),
      items: document.items,
    };
    localDailyFeedHistory = trimHistory([
      localDailyFeed,
      ...localDailyFeedHistory.filter((entry) => entry.generatedAt !== localDailyFeed.generatedAt),
    ]);
    writeJson(localStateFiles.dailyFeed, {
      latest: localDailyFeed,
      history: localDailyFeedHistory,
    });
    return localDailyFeed;
  }

  const result = await dailyFeed.insertOne(document);
  await dailyFeed.deleteMany({ _id: { $nin: (await dailyFeed.find({}).sort({ generatedAt: -1, _id: -1 }).limit(7).toArray()).map((entry) => entry._id) } });
  return normalizeId(await dailyFeed.findOne({ _id: result.insertedId }));
}

async function deleteIdea(id) {
  if (!isMongoReady()) {
    if (!useLocalFallback) {
      enableLocalFallback('MongoDB collections unavailable');
    }
    const idx = localSavedIdeas.findIndex(i => i.id === id);
    if (idx === -1) return false;
    const title = localSavedIdeas[idx].title;
    localSavedIdeas.splice(idx, 1);
    CALENDAR_DAYS.forEach(day => {
      if (localCalendar[day]) localCalendar[day] = localCalendar[day].filter(t => t !== title);
    });
    writeJson(localStateFiles.ideas, localSavedIdeas);
    writeJson(localStateFiles.calendar, localCalendar);
    return true;
  }

  const objectId = getObjectId(id);

  if (!objectId) {
    return false;
  }

  const idea = await savedIdeas.findOne({ _id: objectId }, { projection: { title: 1 } });

  if (!idea) {
    return false;
  }

  await Promise.all([
    savedIdeas.deleteOne({ _id: objectId }),
    calendarEntries.deleteMany({ title: idea.title }),
  ]);

  return true;
}

async function addCalendarEntry(day, title) {
  if (!isMongoReady()) {
    if (!useLocalFallback) {
      enableLocalFallback('MongoDB collections unavailable');
    }
    if (!localCalendar[day]) localCalendar[day] = [];
    if (!localCalendar[day].includes(title)) {
      localCalendar[day].push(title);
      writeJson(localStateFiles.calendar, localCalendar);
    }
    return getState();
  }

  await calendarEntries.updateOne(
    { day, title },
    {
      $setOnInsert: {
        day,
        title,
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );

  return getState();
}

async function removeCalendarEntry(day, title) {
  if (!isMongoReady()) {
    if (!useLocalFallback) {
      enableLocalFallback('MongoDB collections unavailable');
    }
    if (localCalendar[day]) {
      localCalendar[day] = localCalendar[day].filter(t => t !== title);
      writeJson(localStateFiles.calendar, localCalendar);
    }
    return getState();
  }

  await calendarEntries.deleteOne({ day, title });
  return getState();
}

async function clearCalendar() {
  if (!isMongoReady()) {
    if (!useLocalFallback) {
      enableLocalFallback('MongoDB collections unavailable');
    }
    localCalendar = CALENDAR_DAYS.reduce((s, d) => (s[d] = [], s), {});
    writeJson(localStateFiles.calendar, localCalendar);
    return getState();
  }

  await calendarEntries.deleteMany({});
  return getState();
}

async function saveScript(script) {
  const document = {
    title: script.title,
    length: script.length,
    tone: script.tone,
    platform: script.platform,
    wordCount: script.wordCount,
    duration: script.duration,
    sections: script.sections,
    createdAt: new Date(),
  };
  if (!isMongoReady()) {
    if (!useLocalFallback) {
      enableLocalFallback('MongoDB collections unavailable');
    }
    const id = `${Date.now()}-${Math.floor(Math.random()*1000)}`;
    const doc = { id, ...document };
    localScripts.unshift(doc);
    writeJson(localStateFiles.scripts, localScripts);
    return normalizeId(localScripts[0]);
  }

  const result = await scripts.insertOne(document);
  return normalizeId(await scripts.findOne({ _id: result.insertedId }));
}

async function getScripts(limit = 20) {
  if (!isMongoReady()) {
    if (!useLocalFallback) {
      enableLocalFallback('MongoDB collections unavailable');
    }
    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 50));
    return localScripts.slice(0, safeLimit).map(normalizeId);
  }

  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 50));
  const rows = await scripts.find({}).sort({ createdAt: -1, _id: -1 }).limit(safeLimit).toArray();
  return rows.map(normalizeId);
}

async function closeDb() {
  if (client) {
    await client.close();
  }
}

module.exports = {
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
};
