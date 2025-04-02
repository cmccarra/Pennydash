/**
 * PostgreSQL database setup with Sequelize
 */
const { Sequelize } = require('sequelize');

// Import models
const Transaction = require('../models/sequelize/Transaction');
const Category = require('../models/sequelize/Category');
const Settings = require('../models/sequelize/Settings');
const Upload = require('../models/sequelize/Upload');
const Batch = require('../models/sequelize/Batch');

let sequelize;

/**
 * Initialize the database connection and models
 * @returns {Sequelize} The Sequelize instance
 */
const initDB = async () => {
  try {
    // Use environment variables for database connection with SQLite fallback
    const dbUrl = process.env.DATABASE_URL || 'sqlite:./database.sqlite';
    console.log(`Using database: ${dbUrl.startsWith('sqlite') ? 'SQLite (fallback)' : 'PostgreSQL'}`);

    // Determine dialect from URL
    const isPostgres = !dbUrl.startsWith('sqlite');
    const dialect = isPostgres ? 'postgres' : 'sqlite';

    // Create Sequelize instance with appropriate configuration
    sequelize = new Sequelize(dbUrl, {
      dialect,
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      
      // Dialect-specific options
      dialectOptions: isPostgres ? {
        // PostgreSQL specific options
        // Note: SSL is disabled for Replit environment
      } : {},
      
      // SQLite specific settings (only used for SQLite)
      storage: !isPostgres ? './database.sqlite' : undefined,
      
      // Connection pool configuration
      pool: {
        max: 5, 
        min: 0, 
        acquire: 30000,
        idle: 10000
      },

      // Improved retry logic for connections
      retry: {
        max: 3,
        match: [
          /ETIMEDOUT/,
          /ECONNRESET/,
          /ECONNREFUSED/,
          /ESOCKETTIMEDOUT/,
          /EHOSTUNREACH/,
          /EPIPE/,
          /EAI_AGAIN/,
          /SequelizeConnectionError/,
          /SequelizeConnectionRefusedError/,
          /SequelizeHostNotFoundError/,
          /SequelizeHostNotReachableError/,
          /SequelizeInvalidConnectionError/,
          /SequelizeConnectionTimedOutError/
        ],
        backoffBase: 1000,
        backoffExponent: 1.5
      }
    });

    // Initialize models
    const models = {
      Transaction: Transaction.init(sequelize),
      Category: Category.init(sequelize),
      Settings: Settings.init(sequelize),
      Upload: Upload.init(sequelize),
      Batch: Batch.init(sequelize)
    };
    
    // Make models available through sequelize.models
    sequelize.models = models;
    
    // Set up associations after all models are initialized
    Object.values(models).forEach(model => {
      if (typeof model.associate === 'function') {
        model.associate(models);
      }
    });

    // Test the connection
    await sequelize.authenticate();
    console.log('Connection to database has been established successfully.');

    // Database migration strategy
    // FORCE_SYNC will recreate all tables (dropping existing ones)
    // ALTER will attempt to modify tables to match models (safer option)
    const FORCE_SYNC = process.env.DB_FORCE_SYNC === 'true';
    const ALTER_SYNC = process.env.DB_ALTER_SYNC === 'true';
    
    // Sync options
    const syncOptions = {
      force: FORCE_SYNC, // Drop and recreate tables (destructive)
      alter: !FORCE_SYNC && ALTER_SYNC // Alter tables to match models (less destructive)
    };
    
    // Log the strategy
    console.log(`Database sync strategy: ${
      FORCE_SYNC ? 'FORCE (drop and recreate all tables)' : 
      ALTER_SYNC ? 'ALTER (modify existing tables)' : 
      'NORMAL (only create missing tables)'
    }`);
    
    // Perform the sync
    await sequelize.sync(syncOptions);
    console.log('Database synchronized successfully');

    // Create default settings if none exist
    const settingsCount = await Settings.count();
    if (settingsCount === 0) {
      await Settings.create({});
      console.log('Default settings created');
    }

    // Create default categories if none exist
    const categoryCount = await Category.count();
    if (categoryCount === 0) {
      await createDefaultCategories();
      console.log('Default categories created');
    }

    return sequelize;
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    throw error;
  }
};

/**
 * Create default categories for new database setup
 */
const createDefaultCategories = async () => {
  const incomeCategories = [
    { name: 'Salary', color: '#4CAF50', icon: 'money-bill', type: 'income', isDefault: true },
    { name: 'Freelance', color: '#8BC34A', icon: 'laptop', type: 'income', isDefault: true },
    { name: 'Investments', color: '#009688', icon: 'chart-line', type: 'income', isDefault: true },
    { name: 'Gifts', color: '#E91E63', icon: 'gift', type: 'income', isDefault: true },
    { name: 'Other Income', color: '#9C27B0', icon: 'plus-circle', type: 'income', isDefault: true }
  ];

  const expenseCategories = [
    { name: 'Housing', color: '#F44336', icon: 'home', type: 'expense', isDefault: true },
    { name: 'Food', color: '#FF9800', icon: 'utensils', type: 'expense', isDefault: true },
    { name: 'Transportation', color: '#795548', icon: 'car', type: 'expense', isDefault: true },
    { name: 'Utilities', color: '#607D8B', icon: 'bolt', type: 'expense', isDefault: true },
    { name: 'Entertainment', color: '#673AB7', icon: 'film', type: 'expense', isDefault: true },
    { name: 'Shopping', color: '#2196F3', icon: 'shopping-cart', type: 'expense', isDefault: true },
    { name: 'Health', color: '#00BCD4', icon: 'medkit', type: 'expense', isDefault: true },
    { name: 'Education', color: '#3F51B5', icon: 'graduation-cap', type: 'expense', isDefault: true },
    { name: 'Personal', color: '#9E9E9E', icon: 'user', type: 'expense', isDefault: true },
    { name: 'Subscriptions', color: '#FF5722', icon: 'repeat', type: 'expense', isDefault: true },
    { name: 'Travel', color: '#FFEB3B', icon: 'plane', type: 'expense', isDefault: true },
    { name: 'Gifts & Donations', color: '#E91E63', icon: 'gift', type: 'expense', isDefault: true },
    { name: 'Uncategorized', color: '#9E9E9E', icon: 'question-circle', type: 'expense', isDefault: true }
  ];

  // Create all default categories
  await Category.bulkCreate([...incomeCategories, ...expenseCategories]);
};

/**
 * Get Sequelize instance
 * @returns {Sequelize} The Sequelize instance
 */
const getDB = () => {
  if (!sequelize) {
    throw new Error('Database not initialized. Call initDB() first.');
  }
  return sequelize;
};

/**
 * Get models
 * @returns {Object} The Sequelize models
 */
const getModels = () => {
  if (!sequelize || !sequelize.models) {
    throw new Error('Models not initialized. Call initDB() first.');
  }
  return sequelize.models;
};

module.exports = {
  initDB,
  getDB,
  getModels
};