const accessPoint = require('../logic/accessPoint');

// Utility function to enforce a timeout on any async operation
const withTimeout = (promise, ms, connection) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Query timed out'));
        if (connection) connection.destroy(); // Forcefully close the connection on timeout
      }, ms);
    })
  ]);
};

const publicBrandList = async (args, context, dbAlias) => {
  const { brandNickname } = args;

  // Define the query using placeholders for safer parameterized queries
  const query = `
    SELECT id, nickname 
    FROM ${dbAlias}_organizations 
    WHERE id IN (3191, 3, 7165, 7164, 7729) AND nickname = ?
    ORDER BY FIELD(id, 3191) DESC;
 `;

  // Get request URL and initialize the MySQL pool
  const requestUrl = context.req.protocol + '://' + context.req.get('host') + context.req.originalUrl;
  const sppUrl = accessPoint(requestUrl);
  let connection;

  try {
    // Get connection from the pool
    connection = await sppUrl.getConnection();

    // Set a timeout for the query execution (e.g., 5 seconds)
    const timeoutMs = 5000;
    const [rows] = await withTimeout(
      connection.query(query, [ brandNickname ]),
      timeoutMs,
      connection // Pass the connection so we can destroy it on timeout
    );

    return rows;
  } catch (error) {
    console.error('Error executing MySQL query or timeout occurred:', error);
    throw new Error(error.message || 'Failed to fetch data');
  } finally {
    // Release the connection back to the pool or forcefully close if timed out
    if (connection) connection.release();
  }
};

module.exports = publicBrandList;