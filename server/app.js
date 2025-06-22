const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

// Import routes
const cronRoutes = require('./routes/cron');

// Import services
const dbService = require('./services/dbService');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for React development
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL || true 
    : ['http://localhost:3000', 'http://localhost:3001'],
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

// API Routes
app.use('/api/cron', cronRoutes);

// Products API routes
app.get('/api/products', async (req, res) => {
  try {
    const { category, status } = req.query;
    let products;

    if (category) {
      products = await dbService.getProductsByCategory(category);
    } else if (status) {
      products = await dbService.getProductsByStatus(status);
    } else {
      products = await dbService.getAllProducts();
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

// Admin API routes for maker approval/rejection
app.get('/api/makers', async (req, res) => {
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

app.post('/api/makers/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const success = await dbService.updateProductStatus(id, 'approved');
    
    if (success) {
      res.json({
        success: true,
        message: 'Maker approved successfully'
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

app.post('/api/makers/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const success = await dbService.updateProductStatus(id, 'rejected');
    
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

// Serve static React files in production
if (process.env.NODE_ENV === 'production') {
  // Serve static files from the React app build directory
  app.use(express.static(path.join(__dirname, '../client/build')));

  // Catch all handler: send back React's index.html file for client-side routing
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
} else {
  // Development mode - serve a simple API info page
  app.get('/', (req, res) => {
    res.json({
      name: 'Product Hunt Finder API',
      version: '1.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
      endpoints: {
        'POST /api/cron/fetch': 'Trigger RSS feed fetching for all categories (includes LinkedIn enrichment)',
        'POST /api/cron/fetch/:category': 'Trigger RSS feed fetching for specific category',
        'POST /api/cron/enrich': 'Trigger LinkedIn enrichment for pending products',
        'GET /api/cron/enrich/status': 'Get LinkedIn enrichment cache status and statistics',
        'POST /api/cron/enrich/clear-cache': 'Clear the LinkedIn search cache',
        'GET /api/cron/status': 'Get current status and statistics',
        'POST /api/cron/test/:category': 'Test RSS parsing for a category',
        'GET /api/products': 'Get all products (supports ?category and ?status filters)',
        'GET /api/products/category/:category': 'Get products by category',
        'GET /api/debug/enriched': 'Get all products with LinkedIn profiles (for testing)',
        'GET /api/stats': 'Get database statistics',
        'GET /api/health': 'Health check endpoint'
      },
      documentation: {
        categories: require('./config/rssCategories'),
        exampleRequests: {
          fetchAll: `POST ${req.protocol}://${req.get('host')}/api/cron/fetch`,
          fetchCategory: `POST ${req.protocol}://${req.get('host')}/api/cron/fetch/developer-tools`,
          getProducts: `GET ${req.protocol}://${req.get('host')}/api/products`,
          getByCategory: `GET ${req.protocol}://${req.get('host')}/api/products/category/saas`
        }
      }
    });
  });
}

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

// Start server
app.listen(PORT, () => {
  console.log('=================================');
  console.log('🚀 Product Hunt Finder Server');
  console.log('=================================');
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`URL: http://localhost:${PORT}`);
  console.log('=================================');
  console.log('Available endpoints:');
  console.log(`• POST /api/cron/fetch - Trigger RSS fetch`);
  console.log(`• GET /api/products - Get all products`);
  console.log(`• GET /api/stats - Get statistics`);
  console.log(`• GET /api/health - Health check`);
  console.log('=================================');
  
  // Log RSS categories
  const rssCategories = require('./config/rssCategories');
  console.log('RSS Categories configured:');
  rssCategories.forEach(category => console.log(`• ${category}`));
  console.log('=================================');
});

module.exports = app;
