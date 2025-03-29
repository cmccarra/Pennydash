const fs = require('fs');
const { parse: csvParse } = require('csv-parse');
const xml2js = require('xml2js');
const XLSX = require('xlsx');
const pdfParse = require('pdf-parse');
const Transaction = require('../models/transaction');
const path = require('path');

/**
 * Helper function to format OFX date format (YYYYMMDD) to standard format (YYYY-MM-DD)
 * @param {string} ofxDate - Date in OFX format
 * @returns {string} Date in standard format
 */
function formatOFXDate(ofxDate) {
  // Handle OFX date formats which are often YYYYMMDD or YYYYMMDDHHMMSS
  if (ofxDate && ofxDate.length >= 8) {
    const year = ofxDate.substring(0, 4);
    const month = ofxDate.substring(4, 6);
    const day = ofxDate.substring(6, 8);
    return `${year}-${month}-${day}`;
  }
  return ofxDate;
}

/**
 * Service to parse different file formats (CSV, XML) into transaction objects
 */
class FileParser {
  /**
   * Parse a CSV file into an array of transaction objects
   * @param {string} filePath - Path to the CSV file
   * @returns {Promise<Transaction[]>} Array of transaction objects
   */
  static parseCSV(filePath) {
    return new Promise((resolve, reject) => {
      const transactions = [];
      
      // Read file content and log sample for debugging
      try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const sampleLines = fileContent.split('\n').slice(0, 5);
        console.log(`CSV file sample (first 5 lines):\n${sampleLines.join('\n')}`);
      } catch (error) {
        console.error(`Error reading sample from CSV file: ${error.message}`);
      }
      
      fs.createReadStream(filePath)
        .pipe(csvParse({
          columns: true, // Treat the first line as header
          trim: true,    // Trim whitespace
          skip_empty_lines: true,
          cast: true,    // Attempt to convert values to native types
          relax_column_count: true, // More forgiving of CSV format variations
          skip_records_with_error: true // Skip records that cause errors instead of failing
        }))
        .on('data', (row) => {
          try {
            console.log('Raw CSV row:', JSON.stringify(row));
            const transaction = Transaction.fromCSV(row);
            
            // Generate a batchId for the transaction for better grouping
            let month = 'unknown';
            try {
              const txDate = new Date(transaction.date);
              if (!isNaN(txDate.getTime())) {
                month = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
              }
            } catch (e) {
              console.log(`Could not parse date for batching: ${transaction.date}`);
            }
            
            // Create batch ID based on type and month
            transaction.batchId = `batch_${transaction.type || 'unknown'}_${month}`;
            
            transactions.push(transaction);
          } catch (error) {
            console.error('Error processing CSV row:', error);
            // Continue processing other rows
          }
        })
        .on('error', (error) => {
          console.error(`CSV parsing error: ${error.message}`);
          
          // Instead of rejecting, try an alternate parsing method
          console.log('Attempting alternate CSV parsing method...');
          this.parseCSVFallback(filePath)
            .then(fallbackTransactions => {
              if (fallbackTransactions.length > 0) {
                console.log(`Fallback parsing successful, found ${fallbackTransactions.length} transactions`);
                resolve(fallbackTransactions);
              } else {
                reject(new Error(`CSV parsing error: ${error.message}`));
              }
            })
            .catch(fallbackError => {
              console.error('Fallback parsing also failed:', fallbackError);
              reject(new Error(`CSV parsing error: ${error.message}. Fallback also failed: ${fallbackError.message}`));
            });
        })
        .on('end', () => {
          if (transactions.length > 0) {
            // Group transactions by batch for debugging
            const batchMap = {};
            transactions.forEach(t => {
              if (!batchMap[t.batchId]) {
                batchMap[t.batchId] = [];
              }
              batchMap[t.batchId].push(t);
            });
            
            console.log(`Grouped ${transactions.length} transactions into ${Object.keys(batchMap).length} batches:`);
            Object.keys(batchMap).forEach(batchId => {
              console.log(`  ${batchId}: ${batchMap[batchId].length} transactions`);
            });
            
            resolve(transactions);
          } else {
            // If no transactions were found, try the fallback method
            console.log('No transactions found with primary parser, trying fallback method');
            this.parseCSVFallback(filePath)
              .then(fallbackTransactions => {
                if (fallbackTransactions.length > 0) {
                  console.log(`Fallback parsing successful, found ${fallbackTransactions.length} transactions`);
                  resolve(fallbackTransactions);
                } else {
                  resolve([]); // Return empty array if both methods fail to find transactions
                }
              })
              .catch(fallbackError => {
                console.error('Fallback parsing failed:', fallbackError);
                resolve([]); // Return empty array if both methods fail
              });
          }
        });
    });
  }

  /**
   * Fallback method for parsing CSV files when the main parser fails
   * @param {string} filePath - Path to the CSV file
   * @returns {Promise<Transaction[]>} Array of transaction objects
   */
  static parseCSVFallback(filePath) {
    return new Promise((resolve, reject) => {
      try {
        console.log('Using fallback CSV parser for:', filePath);
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        const transactions = [];
        
        if (lines.length < 2) { // Need at least header + one row
          console.log('Not enough lines in CSV for fallback parser');
          return resolve([]);
        }
        
        // Get headers - first line
        const headers = lines[0].split(',').map(h => h.trim());
        console.log('CSV fallback headers:', headers);
        
        // Map common header variations
        const headerMap = {
          // Date variations
          'date': ['date', 'transaction date', 'trans date', 'date posted', 'date processed', 'posting date', 'trans_date'],
          // Description/Merchant variations
          'description': ['description', 'merchant', 'details', 'transaction', 'name', 'memo', 'payee', 'description/memo', 'trans_desc'],
          // Amount variations
          'amount': ['amount', 'transaction amount', 'debit', 'credit', 'value', 'trans_amount'],
          // Type variations (if explicit)
          'type': ['type', 'transaction type', 'trans_type']
        };
        
        // Find which columns contain our needed data
        const columnMap = {};
        headers.forEach((header, index) => {
          const lowerHeader = header.toLowerCase();
          
          // Check each of our required fields
          Object.keys(headerMap).forEach(fieldName => {
            if (headerMap[fieldName].some(variant => lowerHeader.includes(variant))) {
              columnMap[fieldName] = index;
            }
          });
        });
        
        console.log('CSV fallback column mapping:', columnMap);
        
        // Process each data row
        for (let i = 1; i < lines.length; i++) {
          try {
            const values = lines[i].split(',').map(v => v.trim());
            
            // Skip if not enough values
            if (values.length < Math.max(...Object.values(columnMap)) + 1) {
              continue;
            }
            
            // Extract values
            const date = columnMap.date !== undefined ? values[columnMap.date] : '';
            const description = columnMap.description !== undefined ? values[columnMap.description] : '';
            let amount = columnMap.amount !== undefined ? values[columnMap.amount] : '0';
            
            // Remove currency symbols from amount
            amount = amount.replace(/[$€£\s]/g, '');
            
            // Determine transaction type
            let type;
            if (columnMap.type !== undefined) {
              const typeValue = values[columnMap.type].toLowerCase();
              type = typeValue.includes('debit') || typeValue.includes('expense') || typeValue.includes('payment') ? 
                'expense' : 'income';
            } else {
              // Infer from amount format if type column doesn't exist
              type = amount.startsWith('-') ? 'expense' : 'income';
            }
            
            // Create transaction object
            if (date && description) {
              const transaction = new Transaction({
                date,
                description,
                amount: Math.abs(parseFloat(amount.replace(',', '.'))),
                type,
                source: 'csv-fallback',
                importSource: path.basename(filePath)
              });
              
              // Generate batchId
              let month = 'unknown';
              try {
                const txDate = new Date(transaction.date);
                if (!isNaN(txDate.getTime())) {
                  month = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
                }
              } catch (e) {
                console.log(`Could not parse date for batching: ${transaction.date}`);
              }
              
              transaction.batchId = `batch_${transaction.type || 'unknown'}_${month}`;
              transactions.push(transaction);
            }
          } catch (error) {
            console.error(`Error in fallback parser, row ${i}:`, error);
            // Continue with other rows
          }
        }
        
        console.log(`CSV fallback parser found ${transactions.length} transactions`);
        
        // Group by batch for logging
        if (transactions.length > 0) {
          const batchMap = {};
          transactions.forEach(t => {
            if (!batchMap[t.batchId]) {
              batchMap[t.batchId] = [];
            }
            batchMap[t.batchId].push(t);
          });
          
          console.log(`Fallback parser grouped into ${Object.keys(batchMap).length} batches:`);
          Object.keys(batchMap).forEach(batchId => {
            console.log(`  ${batchId}: ${batchMap[batchId].length} transactions`);
          });
        }
        
        resolve(transactions);
      } catch (error) {
        console.error('CSV fallback parsing error:', error);
        reject(error);
      }
    });
  }
  
  /**
   * Parse an XML file into an array of transaction objects
   * @param {string} filePath - Path to the XML file
   * @returns {Promise<Transaction[]>} Array of transaction objects
   */
  static parseXML(filePath) {
    return new Promise((resolve, reject) => {
      const parser = new xml2js.Parser({ explicitArray: true });
      
      fs.readFile(filePath, (err, data) => {
        if (err) {
          return reject(new Error(`Error reading XML file: ${err.message}`));
        }
        
        parser.parseString(data, (parseErr, result) => {
          if (parseErr) {
            return reject(new Error(`XML parsing error: ${parseErr.message}`));
          }
          
          try {
            const transactions = [];
            
            // This implementation assumes a specific XML structure
            // It would need to be adjusted based on the actual format
            let transactionItems = [];
            
            // Try to find transactions in the XML tree
            // Example paths to check for different bank export formats
            const possiblePaths = [
              result?.Transactions?.Transaction,
              result?.transactions?.transaction,
              result?.bankTransactions?.transaction,
              result?.StatementData?.Transaction,
              result?.document?.transactions?.transaction
            ];
            
            for (const path of possiblePaths) {
              if (Array.isArray(path)) {
                transactionItems = path;
                break;
              }
            }
            
            // If transactions not found through common paths, try to search deeper
            if (transactionItems.length === 0) {
              console.warn('Could not find transactions with common XML paths');
            }
            
            // Process found transactions
            for (const item of transactionItems) {
              try {
                const transaction = Transaction.fromXML(item);
                transactions.push(transaction);
              } catch (itemError) {
                console.error('Error processing XML item:', itemError);
                // Continue processing other items
              }
            }
            
            resolve(transactions);
          } catch (processError) {
            reject(new Error(`Error processing XML data: ${processError.message}`));
          }
        });
      });
    });
  }

  /**
   * Parse an Excel file (XLSX/XLS) into an array of transaction objects
   * @param {string} filePath - Path to the Excel file
   * @returns {Promise<Transaction[]>} Array of transaction objects
   */
  static parseExcel(filePath) {
    return new Promise((resolve, reject) => {
      try {
        // Read the Excel file
        const workbook = XLSX.readFile(filePath);
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false });
        
        if (data.length < 2) {
          return resolve([]);  // Not enough data to parse
        }
        
        // Extract header row and determine column mapping
        const headerRow = data[0];
        const rows = data.slice(1);
        
        // Process each row
        const transactions = [];
        for (const row of rows) {
          try {
            // Convert row to object with header names as keys
            const rowObj = {};
            for (let i = 0; i < headerRow.length; i++) {
              if (i < row.length && headerRow[i]) {  // Ensure we have data for this column
                rowObj[headerRow[i]] = row[i];
              }
            }
            
            // Create transaction 
            const transaction = Transaction.fromCSV(rowObj);  // Reuse CSV parsing logic
            transaction.source = 'excel';
            transactions.push(transaction);
          } catch (error) {
            console.error('Error processing Excel row:', error);
            // Continue processing other rows
          }
        }
        
        resolve(transactions);
      } catch (error) {
        reject(new Error(`Excel parsing error: ${error.message}`));
      }
    });
  }
  
  /**
   * Parse a PDF file into an array of transaction objects 
   * @param {string} filePath - Path to the PDF file
   * @returns {Promise<Transaction[]>} Array of transaction objects
   */
  static async parsePDF(filePath) {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
      
      // Extract text content
      const text = pdfData.text;
      
      // This is a simplified approach that attempts to identify transaction patterns in the text
      // A more robust implementation would need to handle various bank statement formats
      
      const transactions = [];
      const lines = text.split('\n').filter(line => line.trim().length > 0);
      
      // Try to identify transaction lines using regex patterns
      // This is a simplified example - real implementation would need more sophistication
      const datePattern = /\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/;  // Matches common date formats
      const amountPattern = /[$€£]?\s*-?\d+[.,]\d{2}/;  // Matches currency amounts
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // If line contains a date and an amount, it might be a transaction
        if (datePattern.test(line) && amountPattern.test(line)) {
          try {
            // Extract date
            const dateMatch = line.match(datePattern);
            const date = dateMatch ? dateMatch[0] : '';
            
            // Extract amount 
            const amountMatch = line.match(amountPattern);
            let amount = amountMatch ? amountMatch[0].replace(/[$€£\s]/g, '') : '0';
            
            // Remove date and amount to get description
            let description = line
              .replace(datePattern, '')
              .replace(amountPattern, '')
              .trim();
              
            // Remove multiple spaces
            description = description.replace(/\s+/g, ' ');
            
            // Determine transaction type based on amount
            const isNegative = amount.includes('-');
            const type = isNegative ? 'expense' : 'income';
            
            // Create transaction object
            const transaction = new Transaction({
              date,
              description,
              amount: Math.abs(parseFloat(amount.replace(',', '.'))),
              type,
              source: 'pdf',
              sourceFileName: path.basename(filePath)
            });
            
            transactions.push(transaction);
          } catch (error) {
            console.error('Error processing PDF line:', error);
            // Continue processing other lines
          }
        }
      }
      
      return transactions;
    } catch (error) {
      throw new Error(`PDF parsing error: ${error.message}`);
    }
  }
  
  /**
   * Parse OFX/QFX files (Financial Exchange Format)
   * @param {string} filePath - Path to the OFX/QFX file
   * @returns {Promise<Transaction[]>} Array of transaction objects
   */
  static parseOFX(filePath) {
    // OFX is typically an XML-based format, but with a different structure
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
          return reject(new Error(`Error reading OFX file: ${err.message}`));
        }
        
        try {
          // Extract XML portion (OFX often has a non-XML header)
          const xmlStart = data.indexOf('<OFX>');
          const xmlData = xmlStart >= 0 ? data.substring(xmlStart) : data;
          
          // Use XML parser
          const parser = new xml2js.Parser({ explicitArray: true });
          parser.parseString(xmlData, (parseErr, result) => {
            if (parseErr) {
              return reject(new Error(`OFX parsing error: ${parseErr.message}`));
            }
            
            try {
              const transactions = [];
              
              // Navigate to transactions in OFX structure
              // Common path for transactions in OFX format
              let transactionItems = [];
              const possiblePaths = [
                result?.OFX?.BANKMSGSRSV1?.[0]?.STMTTRNRS?.[0]?.STMTRS?.[0]?.BANKTRANLIST?.[0]?.STMTTRN,
                result?.OFX?.CREDITCARDMSGSRSV1?.[0]?.CCSTMTTRNRS?.[0]?.CCSTMTRS?.[0]?.BANKTRANLIST?.[0]?.STMTTRN
              ];
              
              for (const path of possiblePaths) {
                if (Array.isArray(path)) {
                  transactionItems = path;
                  break;
                }
              }
              
              if (transactionItems.length === 0) {
                console.warn('Could not find transactions in OFX file');
                return resolve([]);
              }
              
              // Process each transaction
              for (const item of transactionItems) {
                try {
                  const date = item.DTPOSTED?.[0] || '';
                  const description = item.MEMO?.[0] || item.NAME?.[0] || '';
                  const amount = item.TRNAMT?.[0] || '0';
                  const type = parseFloat(amount) >= 0 ? 'income' : 'expense';
                  const account = item.ACCTID?.[0] || '';
                  const reference = item.FITID?.[0] || item.CHECKNUM?.[0] || null;
                  
                  const transaction = new Transaction({
                    date: formatOFXDate(date),
                    description,
                    amount: Math.abs(parseFloat(amount)),
                    type,
                    account,
                    reference,
                    source: 'ofx',
                    sourceFileName: path.basename(filePath)
                  });
                  
                  transactions.push(transaction);
                } catch (itemError) {
                  console.error('Error processing OFX transaction:', itemError);
                  // Continue processing other items
                }
              }
              
              resolve(transactions);
            } catch (processError) {
              reject(new Error(`Error processing OFX data: ${processError.message}`));
            }
          });
        } catch (error) {
          reject(new Error(`OFX processing error: ${error.message}`));
        }
      });
    });
  }
  
  /**
   * Parse a file based on its extension
   * @param {string} filePath - Path to the file
   * @returns {Promise<Transaction[]>} Array of transaction objects
   */
  static parseFile(filePath) {
    if (!fs.existsSync(filePath)) {
      return Promise.reject(new Error(`File not found: ${filePath}`));
    }
    
    const fileExtension = path.extname(filePath).toLowerCase().slice(1);
    
    switch (fileExtension) {
      case 'csv':
        return this.parseCSV(filePath);
      case 'xml':
        return this.parseXML(filePath);
      case 'xlsx':
      case 'xls':
        return this.parseExcel(filePath);
      case 'pdf':
        return this.parsePDF(filePath);
      case 'ofx':
      case 'qfx':
        return this.parseOFX(filePath);
      default:
        return Promise.reject(new Error(`Unsupported file format: ${fileExtension}`));
    }
  }

  /**
   * Extract filename from a file path
   * @param {string} filePath - Full path to the file
   * @returns {string} Just the filename
   */
  static getFileName(filePath) {
    return path.basename(filePath);
  }
}

module.exports = FileParser;
