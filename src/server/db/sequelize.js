/**
 * PostgreSQL database setup with Sequelize
 */
const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');

// Create Sequelize instance
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false, // Set to console.log to see SQL queries
  define: {
    timestamps: true, // Add createdAt and updatedAt timestamps to models
    underscored: true, // Use snake_case for model attributes
  }
});

// Test connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');
    return true;
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
    return false;
  }
};

// Initialize models
const initializeModels = async () => {
  // Get all model files
  const modelsDir = path.join(__dirname, '../models');
  const modelFiles = fs.readdirSync(modelsDir)
    .filter(file => file.endsWith('.js') && file !== 'index.js')
    .map(file => path.join(modelsDir, file));

  // Initialize models with sequelize
  for (const file of modelFiles) {
    const model = require(file);
    if (model.init && typeof model.init === 'function') {
      model.init(sequelize);
    }
  }

  // Set up model associations
  for (const file of modelFiles) {
    const model = require(file);
    if (model.associate && typeof model.associate === 'function') {
      model.associate();
    }
  }
};

// Sync database (create tables if they don't exist)
const syncDatabase = async (force = false) => {
  try {
    await sequelize.sync({ force });
    console.log(`✅ Database synced${force ? ' (tables recreated)' : ''}`);
    return true;
  } catch (error) {
    console.error('❌ Error syncing database:', error);
    return false;
  }
};

module.exports = {
  sequelize,
  testConnection,
  initializeModels,
  syncDatabase,
  models: sequelize.models
};