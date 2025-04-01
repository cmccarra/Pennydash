/**
 * Transaction model representing a financial transaction using Sequelize
 */
const { Model, DataTypes } = require('sequelize');

class Transaction extends Model {
  /**
   * Initialize the Transaction model with Sequelize
   * @param {Sequelize} sequelize - Sequelize instance
   */
  static init(sequelize) {
    super.init({
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        get() {
          // Return the date in YYYY-MM-DD format
          const value = this.getDataValue('date');
          if (!value) return null;
          
          // Handle string dates (already in YYYY-MM-DD format)
          if (typeof value === 'string') {
            return value;
          }
          
          // Handle Date objects
          if (value instanceof Date) {
            return value.toISOString().split('T')[0];
          }
          
          // Unknown format - return as is
          return value;
        },
        set(value) {
          // Handle common date formats before storing
          if (typeof value === 'string') {
            // Handle "DD MMM YYYY" format (e.g. "02 Sep 2024")
            const ddMmmYyyyMatch = value.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
            if (ddMmmYyyyMatch) {
              const day = ddMmmYyyyMatch[1].padStart(2, '0');
              const monthStr = ddMmmYyyyMatch[2];
              const year = ddMmmYyyyMatch[3];
              
              const monthMap = {
                'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
                'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
              };
              
              const month = monthMap[monthStr];
              if (month) {
                // Store as YYYY-MM-DD
                this.setDataValue('date', `${year}-${month}-${day}`);
                return;
              }
            }
          }
          
          // Default handling
          this.setDataValue('date', value);
        }
      },
      description: {
        type: DataTypes.STRING,
        allowNull: false
      },
      amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Always stored as positive. Use type field to determine income/expense.'
      },
      type: {
        type: DataTypes.ENUM('income', 'expense'),
        allowNull: false,
        defaultValue: 'expense'
      },
      merchant: {
        type: DataTypes.STRING,
        allowNull: true
      },
      account: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Account name (e.g. Chase Checking, Amex Platinum)'
      },
      accountType: {
        type: DataTypes.ENUM('bank', 'credit_card', 'investment', 'cash', 'wallet', 'other'),
        allowNull: true,
        defaultValue: 'other',
        comment: 'Type of account (bank, credit card, investment, etc.)'
      },
      source: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Source of import (csv, pdf, manual, etc.)'
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      isRecurring: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      tags: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: true,
        defaultValue: [],
        comment: 'Array of tags for transaction'
      },
      categoryId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'categories',
          key: 'id'
        }
      },
      subcategoryId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'categories',
          key: 'id'
        },
        comment: 'Reference to a subcategory (which is still just a category with a parentId)'
      },
      balance: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        comment: 'Account balance after this transaction (if available)'
      },
      currency: {
        type: DataTypes.STRING(3),
        defaultValue: 'USD',
        allowNull: false
      },
      // Fields for AI category suggestion
      suggestedCategoryId: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Category suggested by AI based on transaction description'
      },
      suggestionApplied: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether the AI suggestion was automatically applied'
      },
      originalText: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Original text or data from the imported file'
      },
      importSource: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Source file name or import method'
      },
      uploadId: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'ID of the upload batch this transaction belongs to',
        references: {
          model: 'uploads',
          key: 'id'
        }
      },
      batchId: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'ID of the specific batch within an upload this transaction belongs to',
        references: {
          model: 'batches',
          key: 'id'
        }
      },
      enrichmentStatus: {
        type: DataTypes.ENUM('pending', 'enriched', 'completed'),
        allowNull: true,
        defaultValue: null,
        comment: 'Status of transaction enrichment process'
      },
      categoryConfidence: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: null,
        comment: 'Confidence score (0-1) for the assigned category'
      },
      needsReview: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Flag indicating if transaction needs manual review'
      }
    }, {
      sequelize,
      modelName: 'transaction',
      tableName: 'transactions',
      underscored: true, // Use snake_case for column names
      timestamps: true, // Add createdAt and updatedAt
      indexes: [
        {
          fields: ['date']
        },
        {
          fields: ['category_id']
        },
        {
          fields: ['subcategory_id']
        },
        {
          fields: ['account']
        },
        {
          fields: ['account_type']
        },
        {
          fields: ['type']
        },
        {
          fields: ['upload_id']
        },
        {
          fields: ['batch_id']
        },
        {
          fields: ['enrichment_status']
        }
      ]
    });

    return this;
  }

  /**
   * Define associations with other models
   * @param {Object} models - The models object containing all defined models
   */
  static associate(models) {
    // Transaction belongs to a main Category
    if (models.Category) {
      this.belongsTo(models.Category, {
        foreignKey: 'categoryId',
        as: 'category'
      });
      
      // Transaction can also belong to a subcategory
      this.belongsTo(models.Category, {
        foreignKey: 'subcategoryId',
        as: 'subcategory'
      });
    }
    
    // Transaction belongs to an Upload
    if (models.Upload) {
      this.belongsTo(models.Upload, {
        foreignKey: 'uploadId',
        as: 'upload'
      });
    }
    
    // Transaction belongs to a Batch
    if (models.Batch) {
      this.belongsTo(models.Batch, {
        foreignKey: 'batchId',
        as: 'batch'
      });
    }
  }

  /**
   * Convert data from CSV format to Transaction model format
   * @param {Object} csvRow - Row data from CSV file
   * @returns {Object} Data formatted for Transaction model
   */
  static fromCSV(csvRow) {
    // Normalize field names (handle different case variations)
    const normalizedRow = {};
    Object.keys(csvRow).forEach(key => {
      normalizedRow[key.toLowerCase()] = csvRow[key];
      
      // Preserve original keys as well to handle fields with mixed case
      normalizedRow[key] = csvRow[key];
    });
    
    // Parse amount and fix the sign convention
    // We always store positive amounts in the database and use the type field to determine
    // whether it's an income or expense
    let amount = parseFloat(normalizedRow.amount || 0);
    let type = 'expense';
    
    // Detect account type early to correctly interpret the amount sign
    const accountType = (normalizedRow.accounttype || '').toLowerCase();
    const account = (normalizedRow.account || '').toLowerCase();
    
    const isLikelyCreditCard = 
      accountType === 'credit_card' ||
      account.includes('credit') || 
      account.includes('card') ||
      account.includes('amex') ||
      account.includes('mastercard') ||
      account.includes('visa');
    
    // For regular bank accounts:
    // - Negative values are expenses (money going out)
    // - Positive values are income (money coming in)
    //
    // For credit cards:
    // - Positive values are expenses (charges to the card)
    // - Negative values are income (payments to the card)
    
    if (isLikelyCreditCard) {
      // Credit card logic - positive means expense, negative means income
      if (amount < 0) {
        type = 'income';  // Payment to the credit card
        amount = Math.abs(amount);
      } else {
        type = 'expense'; // Charge on the credit card
      }
    } else {
      // Regular bank account logic - negative means expense, positive means income
      if (amount < 0) {
        type = 'expense'; // Money leaving the account
        amount = Math.abs(amount);
      } else {
        type = 'income';  // Money entering the account
      }
    }
    
    // Determine account type if not explicitly specified
    let finalAccountType = normalizedRow.accounttype || null;
    if (!finalAccountType && normalizedRow.account) {
      const accountLower = normalizedRow.account.toLowerCase();
      if (accountLower.includes('credit') || accountLower.includes('card')) {
        finalAccountType = 'credit_card';
      } else if (accountLower.includes('check') || accountLower.includes('saving') || accountLower.includes('bank')) {
        finalAccountType = 'bank';
      } else if (accountLower.includes('invest') || accountLower.includes('401k') || accountLower.includes('ira')) {
        finalAccountType = 'investment';
      } else if (accountLower.includes('cash')) {
        finalAccountType = 'cash';
      } else if (accountLower.includes('paypal') || accountLower.includes('venmo') || accountLower.includes('wallet')) {
        finalAccountType = 'wallet';
      } else {
        finalAccountType = 'other';
      }
    }
    
    // Extract tags if any, supporting multiple separator formats
    let tags = [];
    
    // Show detailed debugging - raw values including capitalized Tags
    console.log('🔍 CSV row object:', Object.keys(csvRow));
    console.log('🔍 Looking for "tags" (lowercase):', normalizedRow.tags);
    console.log('🔍 Looking for "Tags" (capitalized):', normalizedRow.Tags);
    console.log('🔍 All keys in normalized row:', Object.keys(normalizedRow));
    
    // Check for Tags first in original case format and directly use it if found
    if (csvRow.Tags) {
      console.log('📌 FOUND "Tags" (uppercase) in original CSV row:', csvRow.Tags);
      
      // Process Tags directly from the original CSV row
      if (typeof csvRow.Tags === 'string') {
        if (csvRow.Tags.includes(';')) {
          tags = csvRow.Tags.split(';').map(tag => tag.trim());
          console.log('📌 Direct tags from CSV.Tags (semicolon):', JSON.stringify(tags));
        } else if (csvRow.Tags.includes(',')) {
          tags = csvRow.Tags.split(',').map(tag => tag.trim());
          console.log('📌 Direct tags from CSV.Tags (comma):', JSON.stringify(tags)); 
        } else {
          tags = [csvRow.Tags.trim()];
          console.log('📌 Direct tags from CSV.Tags (single):', JSON.stringify(tags));
        }
      }
    }
    
    if (normalizedRow.tags) {
      if (typeof normalizedRow.tags === 'string') {
        console.log(`📌 Tags string value: "${normalizedRow.tags}"`);
        
        // Support multiple separator formats
        if (normalizedRow.tags.includes(';')) {
          tags = normalizedRow.tags.split(';').map(tag => tag.trim());
          console.log('📌 Split by semicolon:', JSON.stringify(tags));
        } else if (normalizedRow.tags.includes(',')) {
          tags = normalizedRow.tags.split(',').map(tag => tag.trim());
          console.log('📌 Split by comma:', JSON.stringify(tags));
        } else {
          tags = [normalizedRow.tags.trim()];
          console.log('📌 Single tag:', JSON.stringify(tags));
        }
      } else if (Array.isArray(normalizedRow.tags)) {
        tags = normalizedRow.tags;
        console.log('📌 Tags already array:', JSON.stringify(tags));
      } else {
        console.log('📌 Tags unknown type:', typeof normalizedRow.tags);
      }
    } else {
      console.log('📌 No tags field found in CSV data');
      
      // Special case: Check for "Tags" (capital T) since CSV headers might be case-sensitive
      if (normalizedRow.Tags) {
        console.log(`📌 Found "Tags" (capital T): ${normalizedRow.Tags}`);
        if (typeof normalizedRow.Tags === 'string') {
          if (normalizedRow.Tags.includes(';')) {
            tags = normalizedRow.Tags.split(';').map(tag => tag.trim());
            console.log('📌 Split by semicolon:', JSON.stringify(tags));
          } else if (normalizedRow.Tags.includes(',')) {
            tags = normalizedRow.Tags.split(',').map(tag => tag.trim());
            console.log('📌 Split by comma:', JSON.stringify(tags));
          } else {
            tags = [normalizedRow.Tags.trim()];
            console.log('📌 Single tag:', JSON.stringify(tags));
          }
        }
      }
    }
    
    // Parse balance if provided
    let balance = null;
    if (normalizedRow.balance) {
      try {
        balance = parseFloat(normalizedRow.balance);
      } catch (e) {
        console.warn('Could not parse balance:', normalizedRow.balance);
      }
    }
    
    // Format date properly
    let formattedDate = normalizedRow.date || new Date().toISOString().split('T')[0];
    
    // Handle date format like "DD MMM YYYY" (e.g., "02 Sep 2024")
    if (typeof formattedDate === 'string' && /^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}$/.test(formattedDate)) {
      try {
        const parts = formattedDate.split(' ');
        const day = parts[0].padStart(2, '0');
        const monthMap = {
          'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
          'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
        };
        const month = monthMap[parts[1]];
        const year = parts[2];
        
        if (month) {
          formattedDate = `${year}-${month}-${day}`;
        }
      } catch (error) {
        console.error('Date parsing error:', error);
        // Keep original date if parsing fails
      }
    }
    
    // Create transaction object
    const txObject = {
      date: formattedDate,
      description: normalizedRow.description || 'Unknown transaction',
      amount: amount,
      type: type,
      merchant: normalizedRow.merchant || normalizedRow.payee || null,
      account: normalizedRow.account || null,
      accountType: finalAccountType,
      balance: balance,
      currency: normalizedRow.currency || 'USD',
      tags: tags,
      source: 'csv',
      importSource: normalizedRow.importsource || 'CSV Import',
      originalText: JSON.stringify(csvRow)
    };
    
    console.log('📦 Final transaction object with tags:', JSON.stringify({
      description: txObject.description,
      tags: txObject.tags
    }));
    
    return txObject;
  }

  /**
   * Convert data from XML format to Transaction model format
   * @param {Object} xmlItem - XML data element
   * @returns {Object} Data formatted for Transaction model
   */
  static fromXML(xmlItem) {
    // Parse amount with correct sign convention
    let amount = parseFloat(xmlItem.amount || 0);
    let type = 'expense';
    
    // Try to detect if this is a credit card statement
    const account = ((xmlItem.account && xmlItem.account[0]) || '').toLowerCase();
    const rawAccountType = (xmlItem.accountType && xmlItem.accountType[0] || '').toLowerCase();
    
    const isLikelyCreditCard = 
      rawAccountType === 'credit_card' ||
      account.includes('credit') || 
      account.includes('card') ||
      account.includes('amex') ||
      account.includes('mastercard') ||
      account.includes('visa');
    
    // For regular bank accounts:
    // - Negative values are expenses (money going out)
    // - Positive values are income (money coming in)
    //
    // For credit cards:
    // - Positive values are expenses (charges to the card)
    // - Negative values are income (payments to the card)
    
    if (isLikelyCreditCard) {
      // Credit card logic - positive means expense, negative means income
      if (amount < 0) {
        type = 'income';  // Payment to the credit card
        amount = Math.abs(amount);
      } else {
        type = 'expense'; // Charge on the credit card
      }
    } else {
      // Regular bank account logic - negative means expense, positive means income
      if (amount < 0) {
        type = 'expense'; // Money leaving the account
        amount = Math.abs(amount);
      } else {
        type = 'income';  // Money entering the account
      }
    }
    
    // Determine final account type if not specified
    let finalAccountType = (xmlItem.accountType && xmlItem.accountType[0]) || null;
    if (!finalAccountType && xmlItem.account) {
      const accountLower = (xmlItem.account[0] || '').toLowerCase();
      if (accountLower.includes('credit') || accountLower.includes('card')) {
        finalAccountType = 'credit_card';
      } else if (accountLower.includes('check') || accountLower.includes('saving') || accountLower.includes('bank')) {
        finalAccountType = 'bank';
      } else if (accountLower.includes('invest') || accountLower.includes('401k') || accountLower.includes('ira')) {
        finalAccountType = 'investment';
      } else if (accountLower.includes('cash')) {
        finalAccountType = 'cash';
      } else if (accountLower.includes('paypal') || accountLower.includes('venmo') || accountLower.includes('wallet')) {
        finalAccountType = 'wallet';
      } else {
        finalAccountType = 'other';
      }
    }
    
    // Extract tags if any
    let tags = [];
    if (xmlItem.tags && xmlItem.tags[0]) {
      if (Array.isArray(xmlItem.tags[0])) {
        tags = xmlItem.tags[0];
      } else if (typeof xmlItem.tags[0] === 'string') {
        tags = xmlItem.tags[0].split(',').map(tag => tag.trim());
      }
    }
    
    // Get date and format it properly
    let dateValue = xmlItem.date?.[0] || xmlItem.transactionDate?.[0] || new Date().toISOString().split('T')[0];
    
    // Handle date format like "DD MMM YYYY" (e.g., "02 Sep 2024")
    if (typeof dateValue === 'string' && /^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}$/.test(dateValue)) {
      try {
        const parts = dateValue.split(' ');
        const day = parts[0].padStart(2, '0');
        const monthMap = {
          'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
          'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
        };
        const month = monthMap[parts[1]];
        const year = parts[2];
        
        if (month) {
          dateValue = `${year}-${month}-${day}`;
        }
      } catch (error) {
        console.error('XML date parsing error:', error);
        // Keep original date if parsing fails
      }
    }
    
    return {
      date: dateValue,
      description: xmlItem.description?.[0] || 'Unknown transaction',
      amount: amount,
      type: type,
      merchant: xmlItem.merchant?.[0] || xmlItem.payee?.[0] || null,
      account: xmlItem.account?.[0] || null,
      accountType: finalAccountType,
      balance: xmlItem.balance?.[0] || null,
      currency: xmlItem.currency?.[0] || 'USD',
      tags: tags,
      source: 'xml',
      importSource: 'XML Import',
      originalText: JSON.stringify(xmlItem)
    };
  }
}

module.exports = Transaction;