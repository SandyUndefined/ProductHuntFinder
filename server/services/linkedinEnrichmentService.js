const { GoogleSearchResults } = require('google-search-results-nodejs');
const https = require('https');
const dbService = require('./dbService');

class LinkedInEnrichmentService {
  constructor() {
    this.serpApiKey = process.env.SERPAPI_API_KEY;
    this.searchCache = new Map(); // In-memory cache for maker searches
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
  }

  /**
   * Enrich products with LinkedIn profiles
   * @param {Array} products - Array of products to enrich (optional, will fetch if not provided)
   * @returns {Promise<Object>} - Enrichment results
   */
  async enrichProducts(products = null) {
    const startTime = Date.now();
    console.log('=== LinkedIn Enrichment Started ===');

    try {
      // Get products that need enrichment if not provided
      if (!products) {
        products = await dbService.getProductsNeedingEnrichment();
      }

      console.log(`Found ${products.length} products needing LinkedIn enrichment`);

      const results = {
        totalProcessed: 0,
        successfulEnrichments: 0,
        failedEnrichments: 0,
        cacheHits: 0,
        errors: []
      };

      // Process each product
      for (const product of products) {
        try {
          console.log(`Processing: ${product.name} (Maker: ${product.makerName})`);
          
          const linkedinUrl = await this.findLinkedInProfile(product.makerName);
          
          // Update product with LinkedIn information
          await dbService.updateProductLinkedIn(product.id, linkedinUrl);
          
          results.totalProcessed++;
          if (linkedinUrl) {
            results.successfulEnrichments++;
          } else {
            results.failedEnrichments++;
          }

          // Add delay between requests to be respectful
          await this.delay(500);

        } catch (error) {
          console.error(`Error enriching product ${product.name}:`, error.message);
          results.errors.push({
            productId: product.id,
            productName: product.name,
            makerName: product.makerName,
            error: error.message
          });
          results.failedEnrichments++;
        }
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log('=== LinkedIn Enrichment Completed ===');
      console.log(`Duration: ${duration}ms`);
      console.log(`Total processed: ${results.totalProcessed}`);
      console.log(`Successful: ${results.successfulEnrichments}`);
      console.log(`Failed: ${results.failedEnrichments}`);
      console.log(`Cache hits: ${results.cacheHits}`);

      return results;

    } catch (error) {
      console.error('LinkedIn enrichment failed:', error.message);
      throw error;
    }
  }

  /**
   * Find LinkedIn profile for a maker
   * @param {string} makerName - Name of the maker
   * @returns {Promise<string|null>} - LinkedIn profile URL or null
   */
  async findLinkedInProfile(makerName) {
    if (!makerName || makerName.trim().length === 0) {
      return null;
    }

    const cleanMakerName = this.cleanMakerName(makerName);
    
    // Check cache first
    if (this.searchCache.has(cleanMakerName)) {
      console.log(`Cache hit for: ${cleanMakerName}`);
      return this.searchCache.get(cleanMakerName);
    }

    try {
      let linkedinUrl = null;

      // Try SerpAPI first if available
      if (this.serpApiKey) {
        linkedinUrl = await this.searchWithSerpAPI(cleanMakerName);
      } else {
        // Fallback to simple search (limited functionality)
        console.log('No SerpAPI key found, using fallback search method');
        linkedinUrl = await this.searchWithFallback(cleanMakerName);
      }

      // Cache the result (even if null to avoid repeated searches)
      this.searchCache.set(cleanMakerName, linkedinUrl);
      
      return linkedinUrl;

    } catch (error) {
      console.error(`Error searching for LinkedIn profile of ${makerName}:`, error.message);
      
      // Cache null result to avoid repeated failed searches
      this.searchCache.set(cleanMakerName, null);
      return null;
    }
  }

  /**
   * Search using SerpAPI
   * @param {string} makerName - Cleaned maker name
   * @returns {Promise<string|null>} - LinkedIn profile URL or null
   */
  async searchWithSerpAPI(makerName) {
    const search = new GoogleSearchResults(this.serpApiKey);
    const searchQuery = `"${makerName}" site:linkedin.com/in`;

    console.log(`SerpAPI search: ${searchQuery}`);

    return new Promise((resolve, reject) => {
      search.json({
        q: searchQuery,
        num: 5, // Get top 5 results
        safe: 'active'
      }, (result) => {
        try {
          if (result.error) {
            console.error('SerpAPI error:', result.error);
            return resolve(null);
          }

          const organicResults = result.organic_results || [];
          
          // Find the best LinkedIn profile match
          const linkedinProfile = this.findBestLinkedInMatch(organicResults, makerName);
          
          if (linkedinProfile) {
            console.log(`Found LinkedIn profile: ${linkedinProfile}`);
          } else {
            console.log(`No LinkedIn profile found for: ${makerName}`);
          }

          resolve(linkedinProfile);

        } catch (error) {
          console.error('Error processing SerpAPI results:', error.message);
          resolve(null);
        }
      });
    });
  }

  /**
   * Fallback search method (limited functionality)
   * @param {string} makerName - Cleaned maker name
   * @returns {Promise<string|null>} - LinkedIn profile URL or null
   */
  async searchWithFallback(makerName) {
    // This is a very basic fallback - in production, you might want to use
    // other search APIs or scraping methods
    console.log(`Fallback search for: ${makerName}`);
    
    // For now, just return null as we can't effectively search without proper API
    // In a real implementation, you might use other search APIs or methods
    return null;
  }

  /**
   * Find the best LinkedIn profile match from search results
   * @param {Array} results - Search results
   * @param {string} makerName - Original maker name
   * @returns {string|null} - Best LinkedIn profile URL or null
   */
  findBestLinkedInMatch(results, makerName) {
    if (!results || results.length === 0) {
      return null;
    }

    // Filter LinkedIn results
    const linkedinResults = results.filter(result => 
      result.link && result.link.includes('linkedin.com/in/')
    );

    if (linkedinResults.length === 0) {
      return null;
    }

    // Score results based on title and snippet matching
    const scoredResults = linkedinResults.map(result => {
      const title = (result.title || '').toLowerCase();
      const snippet = (result.snippet || '').toLowerCase();
      const makerNameLower = makerName.toLowerCase();
      
      let score = 0;

      // Higher score for exact name match in title
      if (title.includes(makerNameLower)) {
        score += 10;
      }

      // Score for partial name matches
      const nameWords = makerNameLower.split(/\s+/);
      nameWords.forEach(word => {
        if (word.length > 2) { // Ignore very short words
          if (title.includes(word)) score += 2;
          if (snippet.includes(word)) score += 1;
        }
      });

      return {
        ...result,
        score
      };
    });

    // Sort by score (highest first)
    scoredResults.sort((a, b) => b.score - a.score);

    // Return the best match if it has a reasonable score
    if (scoredResults[0].score > 0) {
      return scoredResults[0].link;
    }

    return null;
  }

  /**
   * Clean maker name for searching
   * @param {string} makerName - Raw maker name
   * @returns {string} - Cleaned maker name
   */
  cleanMakerName(makerName) {
    return makerName
      .replace(/[^\w\s\-\.]/g, '') // Remove special characters except hyphens and dots
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .substring(0, 50); // Limit length
  }

  /**
   * Add delay between requests
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} - Promise that resolves after delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear the search cache
   */
  clearCache() {
    this.searchCache.clear();
    console.log('LinkedIn search cache cleared');
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache statistics
   */
  getCacheStats() {
    return {
      cacheSize: this.searchCache.size,
      cachedNames: Array.from(this.searchCache.keys())
    };
  }
}

module.exports = new LinkedInEnrichmentService();
