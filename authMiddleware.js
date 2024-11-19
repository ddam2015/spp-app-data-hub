const jwt = require('jsonwebtoken');
require('dotenv').config();

const SECRET_KEY = process.env.REACT_APP_SECRET_KEY;

const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.split(' ')[1];
  if (!token) return res.status(401).send('Access Denied. No token provided.');

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded;
    next();
  } catch (ex) {
    res.status(400).send('Invalid token.');
  }
};

module.exports = authMiddleware;
