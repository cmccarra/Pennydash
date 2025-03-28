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
        allowNull: false
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
      source: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Source of the transaction (e.g., bank name, credit card)'
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      isRecurring: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      categoryId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'categories',
          key: 'id'
        }
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
    // Transaction belongs to a Category
    if (models.Category) {
      this.belongsTo(models.Category, {
        foreignKey: 'categoryId',
        as: 'category'
      });
    }
  }

  /**
   * Convert data from CSV format to Transaction model format
   * @param {Object} csvRow - Row data from CSV file
   * @returns {Object} Data formatted for Transaction model
   */
  static fromCSV(csvRow) {
    const amount = parseFloat(csvRow.amount || 0);
    const type = amount >= 0 ? 'income' : 'expense';
    
    return {
      date: csvRow.date || new Date().toISOString().split('T')[0],
      description: csvRow.description || 'Unknown transaction',
      amount: Math.abs(amount),
      type,
      merchant: csvRow.merchant || null,
      source: csvRow.source || null,
      importSource: 'CSV Import',
      originalText: JSON.stringify(csvRow)
    };
  }

  /**
   * Convert data from XML format to Transaction model format
   * @param {Object} xmlItem - XML data element
   * @returns {Object} Data formatted for Transaction model
   */
  static fromXML(xmlItem) {
    const amount = parseFloat(xmlItem.amount || 0);
    const type = amount >= 0 ? 'income' : 'expense';
    
    return {
      date: xmlItem.date || new Date().toISOString().split('T')[0],
      description: xmlItem.description || 'Unknown transaction',
      amount: Math.abs(amount),
      type,
      merchant: xmlItem.merchant || xmlItem.payee || null,
      source: xmlItem.source || xmlItem.account || null,
      importSource: 'XML Import',
      originalText: JSON.stringify(xmlItem)
    };
  }
}

module.exports = Transaction;