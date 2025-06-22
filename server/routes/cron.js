const express = require('express');
const router = express.Router();
const rssService = require('../services/rssService');
const dbService = require('../services/dbService');

/**
 * POST /cron/fetch
 * Trigger RSS feed fetching for all configured categories
 * This endpoint is designed to be called by external cron services
 */
router.post('/fetch', async (req, res) => {
  const startTime = Date.now();
  console.log('=== RSS Fetch Cron Job Started ===');
  console.log('Timestamp:', new Date().toISOString());

  try {
    // Fetch all RSS feeds
    const results = await rssService.fetchAllCategories();
    
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Log results
    console.log('=== RSS Fetch Cron Job Completed ===');
    console.log(`Duration: ${duration}ms`);
    console.log(`Total processed: ${results.totalProcessed}`);
    console.log(`New products: ${results.totalNew}`);
    console.log(`Duplicates: ${results.totalDuplicates}`);
    console.log(`Errors: ${results.errors.length}`);

    // Get database stats
    const stats = await dbService.getStats();

    // Return success response
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      results: {
        categories: results.categories,
        summary: {
          totalProcessed: results.totalProcessed,
          totalNew: results.totalNew,
          totalDuplicates: results.totalDuplicates,
          errorCount: results.errors.length
        },
        errors: results.errors
      },
      database: stats
    });

  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.error('=== RSS Fetch Cron Job Failed ===');
    console.error('Error:', error.message);
    console.error('Duration:', `${duration}ms`);
    console.error('Stack:', error.stack);

    res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      error: {
        message: error.message,
        type: error.name || 'UnknownError'
      }
    });
  }
});

/**
 * POST /cron/fetch/:category
 * Trigger RSS feed fetching for a specific category
 * Useful for testing or selective updates
 */
router.post('/fetch/:category', async (req, res) => {
  const { category } = req.params;
  const startTime = Date.now();

  console.log(`=== RSS Fetch for Category: ${category} ===`);
  console.log('Timestamp:', new Date().toISOString());

  try {
    // Validate category
    const rssCategories = require('../config/rssCategories');
    if (!rssCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Invalid category: ${category}`,
          validCategories: rssCategories
        }
      });
    }

    // Fetch specific category
    const result = await rssService.fetchCategory(category);
    
    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`=== Category ${category} Fetch Completed ===`);
    console.log(`Duration: ${duration}ms`);
    console.log(`Processed: ${result.processed}`);
    console.log(`New: ${result.newProducts}`);
    console.log(`Duplicates: ${result.duplicates}`);

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      category,
      result
    });

  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.error(`=== Category ${category} Fetch Failed ===`);
    console.error('Error:', error.message);
    console.error('Duration:', `${duration}ms`);

    res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      category,
      error: {
        message: error.message,
        type: error.name || 'UnknownError'
      }
    });
  }
});

/**
 * GET /cron/status
 * Get current status and statistics
 * Useful for monitoring and health checks
 */
router.get('/status', async (req, res) => {
  try {
    const stats = await dbService.getStats();
    const rssCategories = require('../config/rssCategories');

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      status: 'healthy',
      configuration: {
        categories: rssCategories,
        database: stats.totalProducts > 0 ? 'connected' : 'empty'
      },
      database: stats
    });

  } catch (error) {
    console.error('Status check failed:', error.message);
    
    res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
      status: 'unhealthy',
      error: {
        message: error.message,
        type: error.name || 'UnknownError'
      }
    });
  }
});

/**
 * POST /cron/test/:category
 * Test RSS parsing for a specific category without saving to database
 * Useful for debugging and configuration validation
 */
router.post('/test/:category', async (req, res) => {
  const { category } = req.params;
  
  console.log(`=== RSS Test for Category: ${category} ===`);

  try {
    const result = await rssService.testCategory(category);
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      test: result
    });

  } catch (error) {
    console.error(`Test failed for ${category}:`, error.message);
    
    res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
      category,
      error: {
        message: error.message,
        type: error.name || 'UnknownError'
      }
    });
  }
});

module.exports = router;
