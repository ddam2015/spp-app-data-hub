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

const publicTSLevelDivision = async (args, context, dbAlias) => {
  const { brand } = args;

  // Define the query using placeholders for safer parameterized queries
  const query = `
    SELECT divisions AS lv_dv
    FROM (
      SELECT DISTINCT divisions
      FROM ${dbAlias}_events
      WHERE org = ? AND type = 1
    ) AS unique_divisions;
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
      connection.query(query, [ brand ]),
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

module.exports = publicTSLevelDivision;