# Product Hunt Finder - Phase 2

A serverless-friendly web application that processes Product Hunt RSS feeds by category and enriches them with LinkedIn profiles for each product's maker.

## Phase 2 Features 🆕

Phase 2 extends the original RSS processing app with LinkedIn profile finding functionality:

- **LinkedIn Profile Search**: Automatically finds LinkedIn profiles for product makers
- **Google Search Integration**: Uses SerpAPI for intelligent LinkedIn profile matching
- **Smart Caching**: Avoids duplicate searches for the same maker names
- **Automatic Enrichment**: Runs LinkedIn enrichment after each RSS fetch
- **Fallback Support**: Works with or without SerpAPI (limited functionality without API)
- **Debug Routes**: Special endpoints for testing and monitoring enrichment

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ 
- npm or yarn
- Optional: [SerpAPI](https://serpapi.com/) account for LinkedIn search (free tier available)

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd ProductHuntFinder
```

2. Install dependencies
```bash
npm install
```

3. Configure environment variables
```bash
cp .env.example .env
# Edit .env and add your SerpAPI key (optional)
```

4. Start the development server
```bash
npm run dev
```

The server will start on `http://localhost:3000`

## 🔧 Configuration

### Environment Variables

```bash
# LinkedIn Enrichment Configuration
SERPAPI_API_KEY=your_serpapi_key_here  # Optional but recommended

# Other existing configurations...
NODE_ENV=development
PORT=3000
```

### SerpAPI Setup (Recommended)

1. Sign up at [SerpAPI](https://serpapi.com/)
2. Get your free API key (100 searches/month)
3. Add the key to your `.env` file
4. Without SerpAPI, the system will use a basic fallback method with limited functionality

## 📊 Database Schema

Products now include LinkedIn information:

```javascript
{
  id: "uuid",
  name: "Product Name",
  description: "Product description",
  category: "saas",
  publishedAt: "2023-01-01T00:00:00.000Z",
  phLink: "https://www.producthunt.com/posts/product",
  makerName: "John Doe",
  linkedin: "https://linkedin.com/in/johndoe", // NEW in Phase 2
  status: "pending",
  createdAt: "2023-01-01T00:00:00.000Z",
  updatedAt: "2023-01-01T00:00:00.000Z"
}
```

## 🔌 API Endpoints

### RSS & Enrichment (Combined)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/cron/fetch` | Fetch RSS + LinkedIn enrichment for all categories |
| `POST` | `/api/cron/fetch/:category` | Fetch RSS for specific category |

### LinkedIn Enrichment (Standalone)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/cron/enrich` | Run LinkedIn enrichment for pending products |
| `GET` | `/api/cron/enrich/status` | Get enrichment cache status and statistics |
| `POST` | `/api/cron/enrich/clear-cache` | Clear the LinkedIn search cache |

### Products & Data

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/products` | Get all products (supports `?category` and `?status` filters) |
| `GET` | `/api/products/category/:category` | Get products by category |
| `GET` | `/api/debug/enriched` | Get all products with LinkedIn profiles (testing) |
| `GET` | `/api/stats` | Get database statistics including enrichment stats |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/cron/status` | System status and configuration |

## 🧪 Testing the LinkedIn Enrichment

### 1. Fetch RSS Data First
```bash
curl -X POST http://localhost:3000/api/cron/fetch
```

This will:
- Fetch new products from RSS feeds
- Automatically run LinkedIn enrichment on products with maker names
- Return combined results

### 2. Check Enrichment Status
```bash
curl http://localhost:3000/api/cron/enrich/status
```

### 3. View Enriched Products
```bash
curl http://localhost:3000/api/debug/enriched
```

### 4. Run Standalone Enrichment
```bash
curl -X POST http://localhost:3000/api/cron/enrich
```

### 5. Check Database Statistics
```bash
curl http://localhost:3000/api/stats
```

## 🔍 How LinkedIn Search Works

### Search Process

1. **Input**: Product with `makerName` and `status = "pending"`
2. **Cache Check**: Look for previously searched maker names
3. **Google Search**: Query `"MakerName" site:linkedin.com/in` via SerpAPI
4. **Smart Matching**: Score results based on name similarity
5. **Storage**: Save LinkedIn URL (or null) to database
6. **Caching**: Cache result to avoid duplicate searches

### Search Query Examples

```
"John Doe" site:linkedin.com/in
"Sarah Johnson" site:linkedin.com/in
"Tech Startup Founder" site:linkedin.com/in
```

### Matching Algorithm

The system scores LinkedIn profiles based on:
- Exact name match in profile title (high score)
- Partial name matches in title/snippet (medium score)
- Word-by-word matching (low score)
- Returns the highest-scoring result above threshold

## 📈 Monitoring & Debugging

### Database Statistics

The `/api/stats` endpoint now includes enrichment metrics:

```json
{
  "database": {
    "totalProducts": 150,
    "enrichedProducts": 45,
    "needingEnrichment": 23,
    "byCategory": {...},
    "byStatus": {...}
  }
}
```

### Cache Management

- **View Cache**: `GET /api/cron/enrich/status`
- **Clear Cache**: `POST /api/cron/enrich/clear-cache`
- **Cache Size**: Monitored automatically

### Error Handling

- LinkedIn enrichment errors don't block RSS processing
- Individual product enrichment failures are logged but don't stop the batch
- Failed searches are cached to avoid repeated attempts
- Detailed error reporting in API responses

## 🎯 Phase 2 Objectives Status

✅ **Extended Product Schema**: Added `linkedin` field to all products  
✅ **Enrichment Logic**: Implemented smart LinkedIn profile search  
✅ **LinkedIn Caching**: In-memory cache prevents duplicate API calls  
✅ **Updated Cron Pipeline**: RSS fetch automatically triggers enrichment  
✅ **Logging Route**: `/api/debug/enriched` for testing enriched entries  
✅ **Non-blocking Processing**: Errors don't stop overall pipeline  
✅ **Modular Code**: Enrichment can be triggered independently  

## 🔧 Development

### Project Structure

```
server/
├── services/
│   ├── dbService.js              # Database operations (extended)
│   ├── rssService.js             # RSS processing (unchanged)
│   └── linkedinEnrichmentService.js  # NEW: LinkedIn search logic
├── routes/
│   └── cron.js                   # API routes (extended)
└── app.js                        # Main application (extended)
```

### Key Services

- **`linkedinEnrichmentService.js`**: Core LinkedIn search and enrichment logic
- **`dbService.js`**: Extended with LinkedIn field support and enrichment queries
- **`cron.js`**: Enhanced with enrichment endpoints and combined processing

## 🚀 Deployment

### Environment Setup

Production deployments should include:

```bash
NODE_ENV=production
SERPAPI_API_KEY=your_production_key
# ... other production configs
```

### Scaling Considerations

- **API Limits**: SerpAPI free tier: 100 searches/month
- **Rate Limiting**: Built-in delays between requests (500ms)
- **Caching**: Reduces API calls for repeated maker names
- **Error Handling**: Graceful degradation without SerpAPI

## 📝 Usage Examples

### Automated RSS + LinkedIn Processing

```bash
# Set up a cron job to run every hour
0 * * * * curl -X POST https://your-app.com/api/cron/fetch
```

### Manual Enrichment for Existing Data

```bash
# Enrich products that weren't enriched during RSS fetch
curl -X POST https://your-app.com/api/cron/enrich
```

### Monitoring Dashboard Data

```bash
# Get comprehensive statistics
curl https://your-app.com/api/stats | jq '.'

# Check what products have LinkedIn profiles
curl https://your-app.com/api/debug/enriched | jq '.products[]'
```

## 🎯 What's Next?

Phase 2 is complete! The system now automatically:

- Fetches Product Hunt RSS feeds by category
- Finds LinkedIn profiles for product makers
- Caches search results to optimize API usage
- Provides comprehensive monitoring and debugging tools

Future phases could include:
- Phase 3: Approval UI for reviewing enriched products
- Phase 4: Google Sheets export functionality
- Phase 5: Advanced analytics and reporting

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.
