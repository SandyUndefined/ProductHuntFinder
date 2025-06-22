const { google } = require('googleapis');
const path = require('path');

class GoogleSheetsService {
  constructor() {
    this.auth = null;
    this.sheets = null;
    this.spreadsheetId = process.env.GOOGLE_SHEETS_ID;
    this.sheetName = process.env.GOOGLE_SHEET_NAME || 'Approved Makers';
    this.initialized = false;
  }

  /**
   * Initialize Google Sheets authentication
   */
  async initialize() {
    try {
      if (this.initialized) {
        return true;
      }

      // Check if we have the required environment variables
      if (!this.spreadsheetId) {
        console.warn('Google Sheets integration disabled: GOOGLE_SHEETS_ID not configured');
        return false;
      }

      let credentials;
      
      // Try to load credentials from file first (for local development)
      try {
        const credentialsPath = path.join(process.cwd(), 'google-credentials.json');
        credentials = require(credentialsPath);
        console.log('Using Google credentials from file');
      } catch (fileError) {
        // Try to load from environment variables (for Replit/production)
        try {
          if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
            credentials = {
              type: 'service_account',
              client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
              private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
              project_id: process.env.GOOGLE_PROJECT_ID || 'product-hunt-finder'
            };
            console.log('Using Google credentials from environment variables');
          } else {
            throw new Error('No Google credentials found in environment');
          }
        } catch (envError) {
          console.warn('Google Sheets integration disabled: No valid credentials found');
          console.warn('Please set up google-credentials.json or environment variables');
          return false;
        }
      }

      // Create auth client
      this.auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });

      // Initialize Sheets API
      this.sheets = google.sheets({ version: 'v4', auth: this.auth });

      // Test the connection
      await this.testConnection();
      
      this.initialized = true;
      console.log('Google Sheets service initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize Google Sheets service:', error.message);
      return false;
    }
  }

  /**
   * Test the Google Sheets connection
   */
  async testConnection() {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId
      });
      console.log(`Connected to Google Sheet: ${response.data.properties.title}`);
      return true;
    } catch (error) {
      throw new Error(`Failed to connect to Google Sheet: ${error.message}`);
    }
  }

  /**
   * Ensure the header row exists in the sheet
   */
  async ensureHeaderRow() {
    try {
      if (!this.initialized) {
        const success = await this.initialize();
        if (!success) return false;
      }

      // Define the expected headers
      const headers = [
        'Date Approved',
        'Maker Name', 
        'LinkedIn',
        'Product Name',
        'Category',
        'Product Hunt Link'
      ];

      // Check if sheet exists and has headers
      try {
        const response = await this.sheets.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range: `${this.sheetName}!A1:F1`
        });

        if (!response.data.values || response.data.values.length === 0) {
          // No headers exist, add them
          await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: `${this.sheetName}!A1:F1`,
            valueInputOption: 'RAW',
            resource: {
              values: [headers]
            }
          });
          console.log('Added header row to Google Sheet');
        }
      } catch (sheetError) {
        // Sheet might not exist, try to create it
        if (sheetError.code === 400) {
          await this.createSheet();
          // Add headers to the new sheet
          await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: `${this.sheetName}!A1:F1`,
            valueInputOption: 'RAW',
            resource: {
              values: [headers]
            }
          });
          console.log('Created new sheet with headers');
        } else {
          throw sheetError;
        }
      }

      return true;
    } catch (error) {
      console.error('Error ensuring header row:', error.message);
      return false;
    }
  }

  /**
   * Create a new sheet in the spreadsheet
   */
  async createSheet() {
    try {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        resource: {
          requests: [{
            addSheet: {
              properties: {
                title: this.sheetName
              }
            }
          }]
        }
      });
      console.log(`Created new sheet: ${this.sheetName}`);
    } catch (error) {
      if (error.message.includes('already exists')) {
        // Sheet already exists, that's fine
        return;
      }
      throw error;
    }
  }

  /**
   * Check if a maker already exists in the sheet to avoid duplicates
   */
  async checkForDuplicate(productName, makerName) {
    try {
      if (!this.initialized) {
        const success = await this.initialize();
        if (!success) return false;
      }

      // Get all data from the sheet
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A:F`
      });

      if (!response.data.values || response.data.values.length <= 1) {
        return false; // No data rows (only headers or empty)
      }

      // Check for duplicates (skip header row)
      const rows = response.data.values.slice(1);
      for (const row of rows) {
        const [, existingMakerName, , existingProductName] = row;
        if (existingProductName === productName && existingMakerName === makerName) {
          return true; // Duplicate found
        }
      }

      return false; // No duplicate found
    } catch (error) {
      console.error('Error checking for duplicates:', error.message);
      return false; // Assume no duplicate on error to allow the addition
    }
  }

  /**
   * Add a new approved maker to the Google Sheet
   */
  async addApprovedMaker(productData) {
    try {
      if (!this.initialized) {
        const success = await this.initialize();
        if (!success) {
          throw new Error('Google Sheets service not available');
        }
      }

      // Ensure headers exist
      await this.ensureHeaderRow();

      // Check for duplicates
      const isDuplicate = await this.checkForDuplicate(productData.name, productData.makerName);
      if (isDuplicate) {
        console.log(`Skipping duplicate entry: ${productData.name} by ${productData.makerName}`);
        return true; // Return success to avoid retries
      }

      // Prepare the row data
      const rowData = [
        new Date().toISOString().split('T')[0], // Date Approved (YYYY-MM-DD format)
        productData.makerName || 'Unknown',
        productData.linkedin || '',
        productData.name || '',
        productData.category || '',
        productData.phLink || ''
      ];

      // Append the row to the sheet
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A:F`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: [rowData]
        }
      });

      console.log(`Added approved maker to Google Sheet: ${productData.name} by ${productData.makerName}`);
      return true;
    } catch (error) {
      console.error('Error adding approved maker to Google Sheet:', error.message);
      throw error;
    }
  }

  /**
   * Get sync status and statistics
   */
  async getSyncStatus() {
    try {
      if (!this.initialized) {
        const success = await this.initialize();
        if (!success) {
          return {
            available: false,
            error: 'Service not initialized'
          };
        }
      }

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A:F`
      });

      const totalRows = response.data.values ? response.data.values.length - 1 : 0; // Subtract header row

      return {
        available: true,
        spreadsheetId: this.spreadsheetId,
        sheetName: this.sheetName,
        totalRows,
        lastUpdate: new Date().toISOString()
      };
    } catch (error) {
      return {
        available: false,
        error: error.message
      };
    }
  }
}

module.exports = new GoogleSheetsService();
