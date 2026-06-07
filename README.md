# SPARKR AI - Content Strategy Platform

**SPARKR AI** is an advanced AI-powered content generation and planning platform designed for creators. It provides intelligent idea generation, script writing, content scoring, and a comprehensive calendar system for content planning.

## 🎯 Features

### Core Generators
- **Idea Engine** - Generate 10+ niche-specific content ideas with viral scoring
- **Viral Hook Generator** - Create platform-optimized hooks (YouTube, Reels, LinkedIn, Shorts)
- **Script Generator** - Humanized video scripts with Hook → Story → Value → CTA structure
- **Caption & Hashtag Generator** - Platform-specific captions with tiered hashtag groups
- **Content Scoring** - Analyze ideas for virality, engagement, CTR potential, and competition level
- **Multi-Platform Repurposer** - Transform content for YouTube, Instagram, LinkedIn, and Twitter
- **Prompt Enhancer** - Improve weak prompts for better AI outputs
- **Thumbnail & Title Pack** - Generate video titles, thumbnail concepts, and text overlays

### Intelligence & Insights
- **Trend Intelligence** - Live trending topics from Google Trends, Reddit, YouTube, Instagram, X
- **Daily Viral Feed** - AI-curated viral ideas across multiple platforms
- **Feed Archive** - Access last 5 daily feeds with historical snapshots
- **Content Calendar** - Drag-and-drop weekly planner with saved ideas
- **Saved Ideas Library** - Build and manage your content idea repository

### User Experience
- **Dark/Light Theme** - Persistent theme preference with smooth transitions
- **Mobile Responsive** - Fully optimized for all devices
- **Real-time Loading States** - Skeleton screens and loading indicators
- **Toast Notifications** - User feedback for all actions
- **PDF Export** - Download scripts as formatted PDFs
- **Copy to Clipboard** - One-click script copying

## 🛠️ Tech Stack

### Frontend
- **HTML5** - Semantic structure
- **CSS3** - Glass morphism effects, gradients, animations
- **Vanilla JavaScript** - No framework dependencies, ES6+ features
- **LocalStorage** - Client-side state persistence

### Backend
- **Node.js + Express** - RESTful API server
- **MongoDB** - Primary database (with local JSON fallback)
- **Groq Cloud / xAI** - AI model providers (Llama 3.3 70B / Grok 4.3)
- **Helmet** - Security headers
- **CORS** - Cross-origin resource sharing
- **Rate Limiting** - Request throttling

## 📋 Project Structure

```
AI-Content-idea-main/
├── app.js                 # Frontend application logic & event handlers
├── server.js              # Express backend & API endpoints
├── db.js                  # Database abstraction layer (MongoDB + JSON fallback)
├── index.html             # Main HTML layout
├── style.css              # Styling & responsive design
├── package.json           # Dependencies & scripts
├── README.md              # This file
├── data/
│   ├── saved_ideas.json   # Persisted saved ideas
│   ├── calendar.json      # Weekly calendar state
│   └── daily_feed.json    # Feed snapshots
└── probe-tls.js           # TLS certificate validation utility
```

## 🚀 Getting Started

### Prerequisites
- **Node.js** 16+ and npm
- **MongoDB** (Atlas cloud or local instance)
- **API Keys** for Groq or xAI

### Installation

1. **Clone repository:**
   ```bash
   git clone https://github.com/Mrvikas06/SPARKR-AI.git
   cd SPARKR-AI
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables** in `.env`:
   ```bash
   # Server
   PORT=3000
   NODE_ENV=development
   
   # Database - MongoDB Atlas
   MONGODB_URI=mongodb+srv://username:password@cluster0.mongodb.net/sparkr_ai?retryWrites=true&w=majority
   
   # Or use individual parts:
   MONGODB_HOST=cluster0.mongodb.net
   MONGODB_USERNAME=your_user
   MONGODB_PASSWORD=your_password
   MONGODB_PROTOCOL=mongodb+srv
   MONGODB_OPTIONS=retryWrites=true&w=majority
   
   # AI Provider (choose one)
   AI_PROVIDER=groq
   GROQ_API_KEY=your_groq_api_key
   GROQ_MODEL=llama-3.3-70b-versatile
   
   # OR use xAI
   # AI_PROVIDER=xai
   # XAI_API_KEY=your_xai_key
   # XAI_MODEL=grok-4.3
   
   # Optional
   AI_TIMEOUT_MS=90000
   AI_MAX_TOKENS=1600
   AI_TEMPERATURE=0.75
   JSON_BODY_LIMIT=100kb
   CLIENT_ORIGIN=http://localhost:3000
   ```

4. **Start development server:**
   ```bash
   npm start
   ```
   Access at: `http://localhost:3000`

### MongoDB Setup

**Option A: MongoDB Atlas (Recommended)**
1. Create free cluster at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Add network access (IP whitelist)
3. Create database user and copy connection string
4. Set `MONGODB_URI` in `.env`

**Option B: Local MongoDB**
```bash
mongod
# Set MONGODB_URI=mongodb://127.0.0.1:27017/sparkr_ai
```

**Option C: JSON Fallback**
If no MongoDB URI configured, app automatically uses local JSON files in `data/` folder.

## 📡 API Endpoints

### Generation Endpoints
```
POST /api/generate/ideas          # Generate content ideas
POST /api/generate/script         # Generate video script
POST /api/generate/section        # Regenerate script section
POST /api/generate/hooks          # Generate viral hooks
POST /api/generate/title-pack     # Generate titles & thumbnails
POST /api/generate/repurpose      # Repurpose content
POST /api/generate/caption        # Generate captions & hashtags
POST /api/enhance-prompt          # Enhance weak prompts
POST /api/analyze/idea            # Score content ideas
```

### Data Management
```
GET  /api/state                   # Load app state (ideas, calendar, feeds)
POST /api/ideas                   # Save idea
DELETE /api/ideas/:id             # Delete saved idea
POST /api/calendar                # Add calendar entry
DELETE /api/calendar              # Remove calendar entry
POST /api/calendar/clear          # Clear entire week
POST /api/scripts                 # Save script
GET  /api/scripts                 # Get recent scripts
```

### Intelligence Endpoints
```
GET  /api/trends                  # Get trending topics
GET  /api/daily-feed              # Get current daily feed
POST /api/daily-feed/refresh      # Generate new daily feed
GET  /api/daily-feed/history      # Get feed snapshots
```

## 📊 Database Schema

### Collections (MongoDB)

**saved_ideas**
```javascript
{
  _id: ObjectId,
  title: String,
  category: String,
  viralScore: Number,
  platform: String,
  niche: String,
  tone: String,
  createdAt: Date,
  updatedAt: Date
}
```

**calendar_entries**
```javascript
{
  _id: ObjectId,
  day: String, // 'mon' to 'sun'
  title: String,
  createdAt: Date
}
```

**scripts**
```javascript
{
  _id: ObjectId,
  title: String,
  length: String,
  tone: String,
  platform: String,
  wordCount: Number,
  duration: String,
  sections: Array,
  createdAt: Date
}
```

**daily_feed**
```javascript
{
  _id: ObjectId,
  generatedAt: Date,
  items: [
    {
      title: String,
      topic: String,
      source: String,
      score: Number,
      angle: String,
      refUrl: String
    }
  ]
}
```

## 🔒 Security Features

- **Helmet.js** - HTTP security headers
- **CORS Policy** - Controlled cross-origin access
- **Rate Limiting** - API request throttling
- **JSON Body Limit** - 100KB max payload
- **API Key Protection** - Keys stored server-side only
- **Input Validation** - All user inputs sanitized
- **Error Handling** - Sensitive errors never exposed to client

## ⚙️ Configuration

### Environment Variables
```bash
# Server
PORT                    # Server port (default: 3000)
NODE_ENV                # 'development' or 'production'

# Database
MONGODB_URI             # Full connection string
MONGODB_HOST            # Cluster host
MONGODB_USERNAME        # Database user
MONGODB_PASSWORD        # Database password
MONGODB_PROTOCOL        # 'mongodb' or 'mongodb+srv'
MONGODB_OPTIONS         # Connection options
MONGODB_DB              # Database name (default: sparkr_ai)
MONGODB_TIMEOUT_MS      # Connection timeout (default: 8000)

# AI Provider
AI_PROVIDER             # 'groq' or 'xai' (default: auto-detect)
GROQ_API_KEY            # Groq API key
GROQ_MODEL              # Groq model (default: llama-3.3-70b-versatile)
XAI_API_KEY             # xAI API key
XAI_MODEL               # xAI model (default: grok-4.3)
AI_TIMEOUT_MS           # AI request timeout (default: 90000)
AI_MAX_TOKENS           # Max response tokens (default: 1600)
AI_TEMPERATURE          # Response creativity 0-1 (default: 0.75)

# Security
CLIENT_ORIGIN           # Allowed CORS origins (comma-separated)
JSON_BODY_LIMIT         # Max JSON request size (default: 100kb)
```

## 📋 Main Files Overview

### **app.js** (Frontend - 1,244 lines)
Primary file for sharing with frontend team
- Handles all UI interactions and events
- Manages state (savedIdeas, calendar, trends)
- Integrates API calls
- Controls theme, navigation, and modals

### **server.js** (Backend - 1,232 lines)
Primary file for sharing with backend team
- Express API server setup
- All generation endpoints (ideas, scripts, hooks, etc.)
- Rate limiting and security middleware
- AI provider integration
- Error handling

### **db.js** (Data Layer - 486 lines)
Database abstraction with MongoDB/JSON fallback
- Collection management
- CRUD operations
- Connection pooling
- Data persistence

## 🎯 Main File to Share with Manager

**For Full Architecture**: `server.js`
- Contains complete API structure
- Shows all AI integrations
- Demonstrates security implementation
- Shows data flow

**For Frontend Overview**: `app.js`
- Shows all user features
- Demonstrates state management
- Shows API integration patterns
- Displays interactivity

**For Investors/Stakeholders**: `README.md` + `index.html`
- Shows feature completeness
- Demonstrates UI/UX
- Explains value proposition

## 🚢 Deployment

### Vercel/Netlify (Frontend)
```bash
npm run build
# Deploy build folder
```

### Heroku (Backend)
```bash
git push heroku main
```

### Docker
```bash
docker build -t sparkr-ai .
docker run -p 3000:3000 sparkr-ai
```

## 🤝 Contributing

1. Fork repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push branch: `git push origin feature/amazing-feature`
5. Submit pull request

## 📄 License

MIT License - See LICENSE file for details

## 📞 Support

- GitHub Issues: [Report bugs](https://github.com/Mrvikas06/SPARKR-AI/issues)
- Email: vikas@sparkr.ai
- Discord: [Join community](https://discord.gg/sparkr)

## 🙌 Acknowledgments

- Built with ❤️ for creators
- Powered by Groq Cloud & xAI
- Inspired by modern content strategy platforms

---

**Last Updated**: May 31, 2026
**Version**: 1.0.0
**Status**: Production Ready ✅

- The server exposes only frontend assets, not backend source files.
- Set `CLIENT_ORIGIN` in production if the frontend is served from a different domain.

## Useful Endpoints

- `GET /api/health`
- `GET /api/state`
- `POST /api/generate/ideas`
- `POST /api/generate/script`
- `POST /api/generate/section`
- `GET /api/scripts`
