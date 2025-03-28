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
        validate: {
          isDate: true
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
        comment: 'Type of account (bank, credit_card, investment, etc)'
      },
      source: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Source of import (csv, pdf, manual, etc)'
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
      originalText: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Original text or data from the imported file'
      },
      importSource: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Source file name or import method'
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
    });
    
    // Parse amount and fix the sign convention
    // For expenses (negative values in CSV): Store as positive, type = 'expense'
    // For income (positive values in CSV): Store as positive, type = 'income'
    let amount = parseFloat(normalizedRow.amount || 0);
    let type = 'expense';
    
    // Determine transaction type based on amount sign
    if (amount < 0) {
      // Negative amounts are considered expenses in most bank statements
      type = 'expense';
      amount = Math.abs(amount);
    } else {
      // Positive amounts are considered income
      type = 'income';
    }
    
    // Special handling for credit card transactions where:
    // - Positive values are charges (expenses)
    // - Negative values are payments (income)
    const accountType = (normalizedRow.accounttype || '').toLowerCase();
    const account = (normalizedRow.account || '').toLowerCase();
    
    const isLikelyCreditCard = 
      accountType === 'credit_card' ||
      account.includes('credit') || 
      account.includes('card') ||
      account.includes('amex') ||
      account.includes('mastercard') ||
      account.includes('visa');
      
    // If it's a credit card, flip the type
    if (isLikelyCreditCard) {
      type = type === 'income' ? 'expense' : 'income';
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
      console.log('📌 No tags found in data');
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
    
    // Create transaction object
    return {
      date: normalizedRow.date || new Date().toISOString().split('T')[0],
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
  }

  /**
   * Convert data from XML format to Transaction model format
   * @param {Object} xmlItem - XML data element
   * @returns {Object} Data formatted for Transaction model
   */
  static fromXML(xmlItem) {
    // Parse amount with correct sign convention (similar to CSV logic)
    let amount = parseFloat(xmlItem.amount || 0);
    let type = 'expense';
    
    if (amount < 0) {
      type = 'expense';
      amount = Math.abs(amount);
    } else {
      type = 'income';
    }
    
    // Try to detect if this is a credit card statement
    const account = ((xmlItem.account && xmlItem.account[0]) || '').toLowerCase();
    const isLikelyCreditCard = 
      account.includes('credit') || 
      account.includes('card') ||
      account.includes('amex') ||
      account.includes('mastercard') ||
      account.includes('visa');
      
    // If it's likely a credit card, flip the type
    if (isLikelyCreditCard) {
      type = type === 'income' ? 'expense' : 'income';
    }
    
    // Determine account type if not specified
    let accountType = (xmlItem.accountType && xmlItem.accountType[0]) || null;
    if (!accountType && xmlItem.account) {
      const accountLower = (xmlItem.account[0] || '').toLowerCase();
      if (accountLower.includes('credit') || accountLower.includes('card')) {
        accountType = 'credit_card';
      } else if (accountLower.includes('check') || accountLower.includes('saving') || accountLower.includes('bank')) {
        accountType = 'bank';
      } else if (accountLower.includes('invest') || accountLower.includes('401k') || accountLower.includes('ira')) {
        accountType = 'investment';
      } else if (accountLower.includes('cash')) {
        accountType = 'cash';
      } else if (accountLower.includes('paypal') || accountLower.includes('venmo') || accountLower.includes('wallet')) {
        accountType = 'wallet';
      } else {
        accountType = 'other';
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
    
    return {
      date: xmlItem.date?.[0] || xmlItem.transactionDate?.[0] || new Date().toISOString().split('T')[0],
      description: xmlItem.description?.[0] || 'Unknown transaction',
      amount: amount,
      type: type,
      merchant: xmlItem.merchant?.[0] || xmlItem.payee?.[0] || null,
      account: xmlItem.account?.[0] || null,
      accountType: accountType,
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