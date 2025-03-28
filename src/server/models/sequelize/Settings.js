/**
 * Settings model representing user preferences and application settings
 */
const { Model, DataTypes } = require('sequelize');

class Settings extends Model {
  /**
   * Initialize the Settings model with Sequelize
   * @param {Sequelize} sequelize - Sequelize instance
   */
  static init(sequelize) {
    super.init({
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      currency: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'USD'
      },
      locale: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'en-US'
      },
      theme: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'dark'
      },
      dateFormat: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'MM/DD/YYYY'
      },
      categorySuggestionConfidence: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0.7,
        validate: {
          min: 0,
          max: 1
        }
      },
      defaultView: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'dashboard'
      },
      budgetStart: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1, // 1st day of month
        validate: {
          min: 1,
          max: 31
        }
      },
      notifications: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {
          emailAlerts: false,
          budgetWarnings: true,
          weeklyReports: false
        }
      },
      customPeriods: {
        type: DataTypes.JSONB,
        allowNull: true
      }
    }, {
      sequelize,
      modelName: 'settings',
      tableName: 'settings',
      underscored: true, // Use snake_case for column names
      timestamps: true // Add createdAt and updatedAt
    });

    return this;
  }

  /**
   * Define associations with other models
   * @param {Object} models - The models object containing all defined models
   */
  static associate(models) {
    // Currently no associations for settings
  }
}

module.exports = Settings;