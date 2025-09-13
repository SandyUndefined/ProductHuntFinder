const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const fetch = require('node-fetch');

// Import routes
const cronRoutes = require('./routes/cron');

// Import services
const dbService = require('./services/dbService');
const googleSheetsService = require('./services/googleSheetsService');
const scheduleService = require('./services/scheduleService');
const cacheService = require('./services/cacheService');
const productHuntService = require('./services/productHuntService');

// Import middleware
const { auth, logAuthAttempt } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5000;
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT || '100', 10);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: true,
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientBuildPath));
  console.log(`Serving static files from: ${clientBuildPath}`);
}

// Rate limiting
app.use(rateLimit({ windowMs: 60_000, max: RATE_LIMIT }));

// API Routes
app.use('/api/cron', cronRoutes);

// OAuth callback for Product Hunt access token
app.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required' });
  }

  try {
    const response = await fetch('https://api.producthunt.com/v2/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.PRODUCT_HUNT_CLIENT_ID,
        client_secret: process.env.PRODUCT_HUNT_CLIENT_SECRET,
        redirect_uri: process.env.PRODUCT_HUNT_REDIRECT_URI,
        grant_type: 'authorization_code',
        code
      })
    });

    const data = await response.json();
    if (!response.ok || data.error) {
      console.error('OAuth token exchange failed:', data.error_description || response.statusText);
      return res.status(500).json({ error: 'Failed to exchange authorization code', details: data.error_description });
    }

    console.log('Access Token:', data.access_token);
    res.json({ success: true, access_token: data.access_token });
  } catch (error) {
    console.error('OAuth callback error:', error.message);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Product Hunt upvotes endpoint
app.get('/api/ph-upvotes', async (req, res) => {
  const { url, productId } = req.query;
  if (!url || !productId) {
    return res.status(400).json({
      success: false,
      error: { message: 'Missing required parameters', details: 'Both url and productId are required' }
    });
  }

  try {
    const result = await productHuntService.fetchUpvotes(productId, url);
    return res.json({
      success: true,
      productId,
      url,
      upvotes: result.votesCount
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      error: { message: error.message, details: error.message }
    });
  }
});

// LinkedIn API proxy
app.post('/api/linkedin/companies', async (req, res) => {
  try {
    const { linkedin_url } = req.body;
    if (!linkedin_url) {
      return res.status(400).json({ error: 'LinkedIn URL is required' });
    }
    
    const API_KEY = process.env.SPECTER_API_KEY || 'd6c0bfe4e7dab55384f8556b7c39e45aae439ce179fbb864b96545646b3577a4';
    
    console.log(`Enriching LinkedIn URL: ${linkedin_url}`);
    
    if (!linkedin_url.includes('linkedin.com/company/')) {
      return res.status(400).json({ 
        error: 'Invalid LinkedIn URL format',
        details: 'URL must contain "linkedin.com/company/"'
      });
    }
    
    const response = await fetch('https://app.tryspecter.com/api/v1/companies', { 
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY 
      },
      body: JSON.stringify({ linkedin_url })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Specter API error (${response.status}):`, errorText);
      throw new Error(`Specter API responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`Successfully enriched: ${linkedin_url}`);
    res.json(data);
  } catch (error) {
    console.error('Specter API proxy error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch Specter data',
      details: error.message 
    });
  }
});

// Products API routes
app.get('/api/products', async (req, res) => {
  try {
    const { category, status, sort, limit } = req.query;
    let products;

    if (category) {
      products = await dbService.getProductsByCategory(category);
    } else if (status) {
      products = await dbService.getProductsByStatus(status);
    } else {
      products = await dbService.getAllProducts();
    }

    // Fetch and update upvotes for products missing them or with zero votes
    for (const product of products) {
      const phUrl = product.phLink || product.productHuntLink;
      const needsUpvotes =
        product.upvotes === undefined || product.upvotes === null || product.upvotes === 0;
      if (needsUpvotes && phUrl && /producthunt\.com\/(posts|products)\//.test(phUrl)) {
        try {
          const result = await productHuntService.fetchUpvotes(product.id, phUrl);
          product.upvotes = result.votesCount;
        } catch (err) {
          console.error(`Failed to fetch upvotes for product ${product.id}:`, err.message);
        }
      }
    }

    if (sort === 'upvotes') {
      products.sort((a, b) => {
        const votesA = a.upvotes || 0;
        const votesB = b.upvotes || 0;
        if (votesA !== votesB) {
          return votesB - votesA;
        }
        return new Date(b.publishedAt) - new Date(a.publishedAt);
      });
    }

    if (limit && !isNaN(limit)) {
      products = products.slice(0, parseInt(limit));
    }

    res.json({
      success: true,
      count: products.length,
      products
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch products',
        details: error.message
      }
    });
  }
});

// Update product fields
app.patch('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    const updated = await dbService.updateProductFields(id, fields);
    
    if (updated) {
      res.json({
        success: true,
        product: updated
      });
    } else {
      res.status(404).json({
        success: false,
        error: {
          message: 'Product not found'
        }
      });
    }
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to update product',
        details: error.message
      }
    });
  }
});

// Get products by category
app.get('/api/products/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const products = await dbService.getProductsByCategory(category);
    
    res.json({
      success: true,
      category,
      count: products.length,
      products
    });
  } catch (error) {
    console.error(`Error fetching products for category ${req.params.category}:`, error);
    res.status(500).json({
      success: false,
      error: {
        message: `Failed to fetch products for category: ${req.params.category}`,
        details: error.message
      }
    });
  }
});

// Get database statistics
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await dbService.getStats();
    const rssCategories = require('./config/rssCategories');
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      configuration: {
        categories: rssCategories
      },
      database: stats
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch statistics',
        details: error.message
      }
    });
  }
});

// Status endpoint
app.get('/api/status', async (req, res) => {
  try {
    const stats = await dbService.getStats();
    const scheduleStatus = await scheduleService.getScheduleStatus();
    const cacheStats = await cacheService.getCacheStats();
    
    const lastCronRun = scheduleStatus.jobs['rss-fetch']?.lastRun || null;
    
    const statusInfo = {
      success: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      system: {
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'development',
        platform: process.platform
      },
      lastCronRun: lastCronRun ? {
        timestamp: lastCronRun.timestamp,
        duration: lastCronRun.results?.duration,
        rssNewProducts: lastCronRun.results?.rss?.totalNew || 0,
        enrichmentSuccessful: lastCronRun.results?.enrichment?.successfulEnrichments || 0
      } : null,
      makers: {
        pending: stats.byStatus.pending || 0,
        approved: stats.byStatus.approved || 0,
        rejected: stats.byStatus.rejected || 0,
        total: stats.totalProducts
      },
      enrichment: {
        totalEnriched: stats.enrichedProducts,
        needingEnrichment: stats.needingEnrichment,
        linkedinFound: stats.linkedinFound
      },
      cache: {
        linkedinCacheSize: cacheStats.inMemory?.size || 0,
        databaseCacheEntries: cacheStats.database?.validEntries || 0
      },
      schedule: {
        nextCronAllowed: scheduleStatus.jobs['rss-fetch']?.nextRunAllowed || null,
        defaultIntervalHours: scheduleStatus.settings?.defaultIntervalHours || 4
      }
    };

    res.json(statusInfo);
  } catch (error) {
    console.error('Error fetching status:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch status',
        details: error.message
      }
    });
  }
});

// Admin API routes for maker approval/rejection
app.get('/api/makers', logAuthAttempt, auth, async (req, res) => {
  try {
    const { status } = req.query;
    let products;

    if (status) {
      products = await dbService.getProductsByStatus(status);
    } else {
      products = await dbService.getAllProducts();
    }

    res.json({
      success: true,
      count: products.length,
      makers: products
    });
  } catch (error) {
    console.error('Error fetching makers:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch makers',
        details: error.message
      }
    });
  }
});

app.post('/api/makers/:id/approve', logAuthAttempt, auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const product = await dbService.getItem(`product:${id}`);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Maker not found'
        }
      });
    }

    const success = await dbService.updateProductFields(id, { status: 'approved' });
    
    if (!success) {
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to update product status'
        }
      });
    }

    let sheetsResult = { synced: false, error: null };
    
    try {
      const syncSuccess = await googleSheetsService.addApprovedMaker(product);
      if (syncSuccess) {
        await dbService.updateProductFields(id, { sheetsSynced: true });
        sheetsResult.synced = true;
        console.log(`Successfully synced approved maker to Google Sheets: ${product.name}`);
      } else {
        sheetsResult.error = 'Google Sheets service not available';
        console.log('Google Sheets service not available, approval completed without sync');
      }
    } catch (sheetsError) {
      console.error('Failed to sync to Google Sheets:', sheetsError.message);
      sheetsResult.error = sheetsError.message;
    }

    res.json({
      success: true,
      message: 'Maker approved successfully',
      sheets: sheetsResult
    });
  } catch (error) {
    console.error('Error approving maker:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to approve maker',
        details: error.message
      }
    });
  }
});

app.post('/api/makers/:id/reject', logAuthAttempt, auth, async (req, res) => {
  try {
    const { id } = req.params;
    const success = await dbService.updateProductFields(id, { status: 'rejected' });
    
    if (success) {
      res.json({
        success: true,
        message: 'Maker rejected successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        error: {
          message: 'Maker not found'
        }
      });
    }
  } catch (error) {
    console.error('Error rejecting maker:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to reject maker',
        details: error.message
      }
    });
  }
});

// Google Sheets resync endpoint
app.post('/api/cron/resync-sheets', logAuthAttempt, auth, async (req, res) => {
  try {
    const needingSyncProducts = await dbService.getApprovedProductsNeedingSync();
    
    if (needingSyncProducts.length === 0) {
      return res.json({
        success: true,
        message: 'No products need syncing to Google Sheets',
        processed: 0,
        results: []
      });
    }

    const results = [];
    let successCount = 0;
    let failureCount = 0;

    for (const product of needingSyncProducts) {
      try {
        const syncSuccess = await googleSheetsService.addApprovedMaker(product);
        if (syncSuccess) {
          await dbService.updateProductFields(product.id, { sheetsSynced: true });
          
          results.push({
            productId: product.id,
            productName: product.name,
            success: true
          });
          successCount++;
          
          console.log(`Successfully synced to Google Sheets: ${product.name}`);
        } else {
          results.push({
            productId: product.id,
            productName: product.name,
            success: false,
            error: 'Google Sheets service not available'
          });
          failureCount++;
          
          console.log(`Google Sheets service not available for: ${product.name}`);
        }
      } catch (error) {
        results.push({
          productId: product.id,
          productName: product.name,
          success: false,
          error: error.message
        });
        failureCount++;
        
        console.error(`Failed to sync ${product.name} to Google Sheets:`, error.message);
      }
    }

    res.json({
      success: true,
      message: `Processed ${needingSyncProducts.length} products`,
      processed: needingSyncProducts.length,
      successCount,
      failureCount,
      results
    });
  } catch (error) {
    console.error('Error during sheets resync:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to resync to Google Sheets',
        details: error.message
      }
    });
  }
});

// Google Sheets status endpoint
app.get('/api/sheets/status', async (req, res) => {
  try {
    const sheetsStatus = await googleSheetsService.getSyncStatus();
    const dbStats = await dbService.getStats();
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      googleSheets: sheetsStatus,
      database: {
        approvedProducts: dbStats.approvedProducts,
        syncedToSheets: dbStats.syncedToSheets,
        needingSheetsSync: dbStats.needingSheetsSync
      }
    });
  } catch (error) {
    console.error('Error fetching sheets status:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch sheets status',
        details: error.message
      }
    });
  }
});

// Debug route for enriched entries
app.get('/api/debug/enriched', async (req, res) => {
  try {
    const allProducts = await dbService.getAllProducts();
    const enrichedProducts = allProducts.filter(product => product.linkedin !== null);
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      count: enrichedProducts.length,
      products: enrichedProducts.map(product => ({
        id: product.id,
        name: product.name,
        category: product.category,
        makerName: product.makerName,
        linkedin: product.linkedin,
        publishedAt: product.publishedAt,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt
      }))
    });
  } catch (error) {
    console.error('Error fetching enriched products:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch enriched products',
        details: error.message
      }
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    status: 'healthy',
    version: '1.0.0',
    uptime: process.uptime()
  });
});

// API info page for development
app.get('/', (req, res) => {
  res.json({
    name: 'Product Hunt Finder API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    note: 'Frontend is served by Vite on a separate port (5173 in development)',
    endpoints: {
      'POST /api/cron/fetch': 'Trigger RSS feed fetching for all categories (includes LinkedIn enrichment)',
      'POST /api/cron/fetch/:category': 'Trigger RSS feed fetching for specific category',
      'GET /api/products': 'Get all products (supports ?category and ?status filters)',
      'PATCH /api/products/:id': 'Update product fields (e.g., linkedInData, status, upvotes)',
      'GET /api/products/category/:category': 'Get products by category',
      'GET /api/makers': 'Get all makers (supports ?status filter) [AUTH REQUIRED]',
      'POST /api/makers/:id/approve': 'Approve a maker (auto-syncs to Google Sheets) [AUTH REQUIRED]',
      'POST /api/makers/:id/reject': 'Reject a maker [AUTH REQUIRED]',
      'GET /api/sheets/status': 'Get Google Sheets sync status and statistics',
      'GET /api/debug/enriched': 'Get all products with LinkedIn profiles (for testing)',
      'GET /api/stats': 'Get database statistics',
      'GET /api/status': 'Get system status including cron runs and maker counts',
      'GET /api/health': 'Health check endpoint',
      'GET /api/ph-upvotes': 'Get Product Hunt upvote count for a specific product',
      'GET /callback': 'OAuth callback for Product Hunt access token'
    },
    authentication: {
      method: process.env.AUTH_METHOD || 'basic',
      info: process.env.AUTH_METHOD === 'token' 
        ? 'Use ?token=YOUR_TOKEN or X-Auth-Token header for protected endpoints'
        : 'Use HTTP Basic Auth (username:password) for protected endpoints marked [AUTH REQUIRED]'
    },
    documentation: {
      categories: require('./config/rssCategories'),
      exampleRequests: {
        fetchAll: `POST ${req.protocol}://${req.get('host')}/api/cron/fetch`,
        fetchCategory: `POST ${req.protocol}://${req.get('host')}/api/cron/fetch/developer-tools`,
        getProducts: `GET ${req.protocol}://${req.get('host')}/api/products`,
        getByCategory: `GET ${req.protocol}://${req.get('host')}/api/products/category/saas`,
        getStatus: `GET ${req.protocol}://${req.get('host')}/api/status`,
        getUpvotes: `GET ${req.protocol}://${req.get('host')}/api/ph-upvotes?url=https://www.producthunt.com/products/oh-dear/launches&productId=123`
      }
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: {
      message: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    }
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: 'API endpoint not found',
      path: req.path
    }
  });
});

// Serve React app for all non-API routes in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// Startup validation
async function validateStartup() {
  console.log('=== STARTUP VALIDATION ===');
  
  console.log('Checking dependencies...');
  try {
    const GoogleSearchResults = require('google-search-results-nodejs');
    console.log('✓ google-search-results-nodejs:', typeof GoogleSearchResults);
    
    const { google } = require('googleapis');
    console.log('✓ googleapis:', typeof google);
  } catch (error) {
    console.log('✗ Dependency check failed:', error.message);
  }
  
  console.log('\nEnvironment Variables:');
  console.log('• NODE_ENV:', process.env.NODE_ENV || 'development');
  console.log('• PORT:', process.env.PORT || '5000');
  console.log('• SERPAPI_API_KEY:', !!process.env.SERPAPI_API_KEY ? '[SET]' : '[NOT SET]');
  console.log('• GOOGLE_SHEETS_ID:', !!process.env.GOOGLE_SHEETS_ID ? '[SET]' : '[NOT SET]');
  console.log('• GOOGLE_SERVICE_ACCOUNT_EMAIL:', !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ? '[SET]' : '[NOT SET]');
  console.log('• GOOGLE_PRIVATE_KEY:', !!process.env.GOOGLE_PRIVATE_KEY ? '[SET]' : '[NOT SET]');
  console.log('• PRODUCT_HUNT_CLIENT_ID:', !!process.env.PRODUCT_HUNT_CLIENT_ID ? '[SET]' : '[NOT SET]');
  console.log('• PRODUCT_HUNT_CLIENT_SECRET:', !!process.env.PRODUCT_HUNT_CLIENT_SECRET ? '[SET]' : '[NOT SET]');
  console.log('• PRODUCT_HUNT_REDIRECT_URI:', !!process.env.PRODUCT_HUNT_REDIRECT_URI ? '[SET]' : '[NOT SET]');
  console.log('• PRODUCT_HUNT_API_TOKEN:', !!process.env.PRODUCT_HUNT_API_TOKEN ? '[SET]' : '[NOT SET]');
  
  console.log('\nTesting Google Sheets service...');
  try {
    const sheetsStatus = await googleSheetsService.getSyncStatus();
    if (sheetsStatus.available) {
      console.log('✓ Google Sheets service: Available');
    } else {
      console.log('✗ Google Sheets service: Not available -', sheetsStatus.error);
    }
  } catch (error) {
    console.log('✗ Google Sheets service: Error -', error.message);
  }
  
  console.log('=== STARTUP VALIDATION COMPLETE ===\n');
}

// Start server
app.listen(PORT, async () => {
  console.log('=================================');
  console.log('🚀 Product Hunt Finder Server');
  console.log('=================================');
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`URL: http://localhost:${PORT}`);
  console.log('=================================');

  try {
    await dbService.ensureProductsTable();
  } catch (err) {
    console.error('Database initialization failed:', err.message);
  }

  await validateStartup();
  
  console.log('Available endpoints:');
  console.log(`• POST /api/cron/fetch - Trigger RSS fetch`);
  console.log(`• GET /api/products - Get all products`);
  console.log(`• PATCH /api/products/:id - Update product fields`);
  console.log(`• GET /api/products/category/:category - Get products by category`);
  console.log(`• GET /api/makers - Get makers (admin)`);
  console.log(`• POST /api/makers/:id/approve - Approve a maker (admin)`);
  console.log(`• POST /api/makers/:id/reject - Reject a maker (admin)`);
  console.log(`• POST /api/cron/resync-sheets - Resync approved products to Google Sheets (admin)`);
  console.log(`• GET /api/sheets/status - Get Google Sheets sync status`);
  console.log(`• GET /api/debug/enriched - Get enriched products (debug)`);
  console.log(`• GET /api/stats - Get database statistics`);
  console.log(`• GET /api/status - Get system status`);
  console.log(`• GET /api/health - Health check`);
  console.log(`• GET /api/ph-upvotes - Get Product Hunt upvote count`);
  console.log(`• GET /callback - OAuth callback for Product Hunt access token`);
});

module.exports = app;
