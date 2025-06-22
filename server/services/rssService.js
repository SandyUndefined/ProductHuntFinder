const Parser = require('rss-parser');
const rssCategories = require('../config/rssCategories');
const dbService = require('./dbService');

class RSSService {
  constructor() {
    this.parser = new Parser({
      customFields: {
        item: [
          ['content:encoded', 'content'],
          ['description', 'rawDescription'],
          ['creator', 'creator'],
          ['author', 'author']
        ]
      }
    });
    this.baseUrl = 'https://www.producthunt.com/feed';
  }

  /**
   * Fetch and process RSS feeds for all configured categories
   * @returns {Promise<Object>} - Summary of processing results
   */
  async fetchAllCategories() {
    const results = {
      categories: [],
      totalProcessed: 0,
      totalNew: 0,
      totalDuplicates: 0,
      errors: []
    };

    console.log(`Starting RSS fetch for ${rssCategories.length} categories...`);

    for (const category of rssCategories) {
      try {
        console.log(`Processing category: ${category}`);
        const categoryResult = await this.fetchCategory(category);
        
        results.categories.push({
          category,
          processed: categoryResult.processed,
          newProducts: categoryResult.newProducts,
          duplicates: categoryResult.duplicates
        });

        results.totalProcessed += categoryResult.processed;
        results.totalNew += categoryResult.newProducts;
        results.totalDuplicates += categoryResult.duplicates;

      } catch (error) {
        console.error(`Error processing category ${category}:`, error.message);
        results.errors.push({
          category,
          error: error.message
        });
      }
    }

    console.log(`RSS fetch completed. Total: ${results.totalProcessed} processed, ${results.totalNew} new, ${results.totalDuplicates} duplicates`);
    return results;
  }

  /**
   * Fetch and process RSS feed for a specific category
   * @param {string} category - Product Hunt category
   * @returns {Promise<Object>} - Processing results for the category
   */
  async fetchCategory(category) {
    const url = `${this.baseUrl}?category=${category}`;
    console.log(`Fetching RSS feed: ${url}`);

    try {
      const feed = await this.parser.parseURL(url);
      console.log(`Found ${feed.items.length} items in ${category} feed`);

      const results = {
        processed: 0,
        newProducts: 0,
        duplicates: 0
      };

      for (const item of feed.items) {
        try {
          const productData = this.extractProductData(item, category);
          
          if (productData) {
            const savedProduct = await dbService.saveProduct(productData);
            results.processed++;
            
            // Check if it was a new product or duplicate
            if (savedProduct.createdAt === savedProduct.updatedAt) {
              results.newProducts++;
            } else {
              results.duplicates++;
            }
          }
        } catch (error) {
          console.error(`Error processing item in ${category}:`, error.message);
          console.error('Item data:', JSON.stringify(item, null, 2));
        }
      }

      return results;
    } catch (error) {
      console.error(`Failed to fetch RSS feed for ${category}:`, error.message);
      throw error;
    }
  }

  /**
   * Extract product data from RSS item
   * @param {Object} item - RSS feed item
   * @param {string} category - Product category
   * @returns {Object|null} - Extracted product data or null if invalid
   */
  extractProductData(item, category) {
    try {
      // Basic validation
      if (!item.title || !item.link) {
        console.warn('Skipping item: missing title or link');
        return null;
      }

      // Extract maker name from various possible fields
      let makerName = null;
      if (item.creator) {
        makerName = item.creator;
      } else if (item.author) {
        makerName = item.author;
      } else if (item.content || item.rawDescription) {
        // Try to extract maker from content or description
        makerName = this.extractMakerFromContent(item.content || item.rawDescription);
      }

      // Clean and format the data
      const productData = {
        name: this.cleanTitle(item.title),
        description: this.cleanDescription(item.description || item.rawDescription || ''),
        category: category,
        publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
        phLink: item.link,
        makerName: makerName ? this.cleanMakerName(makerName) : null
      };

      // Validate that we have meaningful data
      if (productData.name.length < 3) {
        console.warn('Skipping item: title too short');
        return null;
      }

      return productData;
    } catch (error) {
      console.error('Error extracting product data:', error.message);
      return null;
    }
  }

  /**
   * Clean and format product title
   * @param {string} title - Raw title from RSS
   * @returns {string} - Cleaned title
   */
  cleanTitle(title) {
    // Remove common Product Hunt prefixes/suffixes and clean up
    return title
      .replace(/^Product Hunt:\s*/i, '')
      .replace(/\s*-\s*Product Hunt$/i, '')
      .trim()
      .substring(0, 200); // Limit length
  }

  /**
   * Clean and format product description
   * @param {string} description - Raw description from RSS
   * @returns {string} - Cleaned description
   */
  cleanDescription(description) {
    // Remove HTML tags and clean up
    return description
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .substring(0, 500); // Limit length
  }

  /**
   * Extract maker name from content
   * @param {string} content - Content to search
   * @returns {string|null} - Extracted maker name or null
   */
  extractMakerFromContent(content) {
    if (!content) return null;

    // Try to find maker patterns in content
    const patterns = [
      /by\s+([^<>\n,]+)/i,
      /maker[:\s]+([^<>\n,]+)/i,
      /created by\s+([^<>\n,]+)/i,
      /from\s+([^<>\n,]+)/i
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return this.cleanMakerName(match[1]);
      }
    }

    return null;
  }

  /**
   * Clean and format maker name
   * @param {string} maker - Raw maker name
   * @returns {string} - Cleaned maker name
   */
  cleanMakerName(maker) {
    return maker
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/[@#]/g, '') // Remove @ and # symbols
      .trim()
      .substring(0, 100); // Limit length
  }

  /**
   * Get RSS feed URL for a category
   * @param {string} category - Product Hunt category
   * @returns {string} - Full RSS URL
   */
  getFeedUrl(category) {
    return `${this.baseUrl}?category=${category}`;
  }

  /**
   * Test RSS parsing for a single category (for debugging)
   * @param {string} category - Category to test
   * @returns {Promise<Object>} - Test results
   */
  async testCategory(category) {
    console.log(`Testing RSS parsing for category: ${category}`);
    
    try {
      const url = this.getFeedUrl(category);
      const feed = await this.parser.parseURL(url);
      
      const testResult = {
        category,
        url,
        feedTitle: feed.title,
        itemCount: feed.items.length,
        sampleItems: feed.items.slice(0, 3).map(item => ({
          title: item.title,
          link: item.link,
          pubDate: item.pubDate,
          hasDescription: !!item.description,
          hasContent: !!item.content
        }))
      };

      console.log('Test result:', JSON.stringify(testResult, null, 2));
      return testResult;
    } catch (error) {
      console.error(`Test failed for ${category}:`, error.message);
      throw error;
    }
  }
}

module.exports = new RSSService();
