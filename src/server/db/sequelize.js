/**
 * PostgreSQL database setup with Sequelize
 */
const { Sequelize } = require('sequelize');

// Import models
const Transaction = require('../models/sequelize/Transaction');
const Category = require('../models/sequelize/Category');
const Settings = require('../models/sequelize/Settings');

let sequelize;

/**
 * Initialize the database connection and models
 * @returns {Sequelize} The Sequelize instance
 */
const initDB = async () => {
  try {
    // Use environment variables for database connection
    const dbUrl = process.env.DATABASE_URL;

    if (!dbUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    // Create Sequelize instance
    sequelize = new Sequelize(dbUrl, {
      dialect: 'postgres',
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      dialectOptions: {
        // We're not using SSL in the Replit environment
      },
      pool: {
        max: 5, // Maximum number of connection in pool
        min: 0, // Minimum number of connection in pool
        acquire: 30000, // The maximum time, in milliseconds, that pool will try to get connection before throwing error
        idle: 10000 // The maximum time, in milliseconds, that a connection can be idle before being released
      }
    });

    // Initialize models
    const models = {
      Transaction: Transaction.init(sequelize),
      Category: Category.init(sequelize),
      Settings: Settings.init(sequelize)
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

    // Sync models with database with force option to apply schema changes
    // Set force to false to preserve existing data, true will recreate tables
    const force = false; // Only use true when you need to reset the schema
    await sequelize.sync({ force });
    console.log('Database synchronized with force =', force);

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