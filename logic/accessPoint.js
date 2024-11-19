require('dotenv').config();
const mysql = require('mysql2/promise');

const accessPoint = (hostType) => {
  const isProd = hostType.includes('api.');
  const pool = mysql.createPool({
    host: isProd ? process.env.REACT_APP_SPP_HOST : process.env.REACT_APP_DEV_SPP_HOST,
    port: isProd ? process.env.REACT_APP_SPP_PORT : process.env.REACT_APP_DEV_SPP_PORT,
    user: isProd ? process.env.REACT_APP_SPP_USER : process.env.REACT_APP_DEV_SPP_USER,
    password: isProd ? process.env.REACT_APP_SPP_PASSWORD : process.env.REACT_APP_DEV_SPP_PASSWORD,
    database: isProd ? process.env.REACT_APP_SPP_DATABASE : process.env.REACT_APP_DEV_SPP_DATABASE,
  });

  return pool;
}

module.exports = accessPoint;
