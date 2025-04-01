/**
 * Sequelize model for transaction batches
 */
const { Model, DataTypes } = require('sequelize');

class Batch extends Model {
  /**
   * Initialize the model with Sequelize
   * @param {Sequelize} sequelize - Sequelize instance
   * @returns {Model} Initialized model
   */
  static init(sequelize) {
    return super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        title: {
          type: DataTypes.STRING,
          allowNull: false,
          defaultValue: 'Untitled Batch'
        },
        description: {
          type: DataTypes.TEXT,
          allowNull: true
        },
        status: {
          type: DataTypes.ENUM('pending', 'skipped', 'completed', 'enriched'),
          defaultValue: 'pending'
        },
        type: {
          type: DataTypes.STRING, // e.g., 'merchant', 'date', 'amount', 'category'
          allowNull: true
        },
        startDate: {
          type: DataTypes.DATEONLY,
          allowNull: true
        },
        endDate: {
          type: DataTypes.DATEONLY,
          allowNull: true
        },
        transactionCount: {
          type: DataTypes.INTEGER,
          defaultValue: 0
        },
        totalAmount: {
          type: DataTypes.DECIMAL(10, 2),
          defaultValue: 0
        },
        dominantMerchant: {
          type: DataTypes.STRING,
          allowNull: true
        },
        metadata: {
          type: DataTypes.JSONB,
          defaultValue: {}
        },
        uploadId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: 'uploads',
            key: 'id'
          }
        }
      },
      {
        sequelize,
        modelName: 'batch',
        tableName: 'batches',
        underscored: true,
        timestamps: true
      }
    );
  }

  /**
   * Set up model associations
   * @param {Object} models - All models
   */
  static associate(models) {
    // Batch belongs to an Upload
    if (models.Upload) {
      this.belongsTo(models.Upload, {
        foreignKey: 'uploadId',
        as: 'upload'
      });
    }

    // Batch has many Transactions
    if (models.Transaction) {
      this.hasMany(models.Transaction, {
        foreignKey: 'batchId',
        as: 'transactions'
      });
    }
  }
}

module.exports = Batch;