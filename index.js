/** 
  All endpoints are primary used for new stack admin dashboard
**/
const { ApolloServer } = require('apollo-server-express');
const express = require('express');
const serverless = require('serverless-http');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const Sentry = require('@sentry/node');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();
// const admin = require('firebase-admin');
const authMiddleware = require('./authMiddleware');
const typeDefs = require('./typeDefs');
const mysql = require('mysql2/promise');
const zlib = require('zlib');
const rateLimit = require('express-rate-limit');
const accessPoint = require('./logic/accessPoint');
const publicTeamStanding = require('./queries/publicTeamStanding');
const publicTeamStandingGameResult = require('./queries/publicTeamStandingGameResult');
const publicBoxScore = require('./queries/publicBoxScore');
const publicBrandList = require('./queries/publicBrandList');
const publicTSLevelDivision = require('./queries/levelDivision');
const admin = require('./firebase-admin-config');

const app = express();

const SECRET_KEY = process.env.REACT_APP_SECRET_KEY;
const DEV_API_URL = 'https://dev.sportspassports.com';
const PROD_API_URL = 'https://sportspassports.com';
const dbAlias = process.env.REACT_APP_DEV_SPP_TABLE_ALIAS;

// Determine the base URL for the API
const getApiUrl = () => {
  return process.env.NODE_ENV === 'production' ? PROD_API_URL : DEV_API_URL;
};

const allowedOrigins = [
  'https://admin.sportspassports.com',
  'https://sportspassports.com',
  'http://engineerings.sportspassports.com:8081'
];

const corsOptions = {
  origin: (origin, callback) => {
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  optionsSuccessStatus: 200
};

// Rate limit rule
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 500,
  message: 'Too many requests from this IP, please try again later.',
});

app.use(bodyParser.json());
app.use(limiter);

const resolvers = {
  Query: {
    hello: () => 'Hello 3001',
    welcome: () => 'Welcome SPP',
  },
  Mutation: {
    eventSearch: async (_, { condition }, context) => {
      await new Promise((resolve, reject) => {
        authMiddleware(context.req, context.req.res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const query = `SELECT * FROM ${dbAlias}_events ${condition}`;
      const requestUrl = context.req.protocol + '://' + context.req.get('host') + context.req.originalUrl;
      const sppUrl = accessPoint(requestUrl);
      
      try {
        const [rows] = await sppUrl.query(query);
        return rows;
      } catch (error) {
        console.error('Error executing MySQL query:', error);
        throw new Error('Failed to fetch data');
      }
    },
    eventPublic: async (_, { condition }, context) => {
      const query = `SELECT * FROM ${dbAlias}_events ${condition}`;
      const requestUrl = context.req.protocol + '://' + context.req.get('host') + context.req.originalUrl;
      const sppUrl = accessPoint(requestUrl);
      
      try {
        const [rows] = await sppUrl.query(query);
        return rows;
      } catch (error) {
        console.error('Error executing MySQL query:', error);
        throw new Error('Failed to fetch data');
      }
    },
    // Public: Team Standing
    publicTeamStanding: async (_, args, context) => {
      try {
        // Call the publicTeamStanding function with the args, context, and dbAlias
        const standings = await publicTeamStanding(args, context, dbAlias);

        // Return the results of the query
        return standings;
      } catch (error) {
        console.error('Error fetching team standings:', error);
        throw new Error('Failed to fetch team standings');
      }
    },
    // Public: Team Standing Game Result
    publicTeamStandingGameResult: async (_, args, context) => {
      try {
        const gameResult = await publicTeamStandingGameResult(args, context, dbAlias);

        // Return the results of the query
        return gameResult;
      } catch (error) {
        console.error('Error fetching team game results:', error);
        throw new Error('Failed to fetch team game results');
      }
    },
    // Public: Team Standing BoxScore
    publicBoxScore: async (_, args, context) => {
      try {
        const gameResult = await publicBoxScore(args, context, dbAlias);

        // Return the results of the query
        return gameResult;
      } catch (error) {
        console.error('Error fetching boxscores results:', error);
        throw new Error('Failed to fetch boxscores results');
      }
    },
    // Public: Brand list
    publicBrandList: async (_, args, context) => {
      try {
        const brandList = await publicBrandList(args, context, dbAlias);

        // Return the results of the query
        return brandList;
      } catch (error) {
        console.error('Error fetching brand results:', error);
        throw new Error('Failed to fetch brand results');
      }
    },
    // Public: Team standing levels and divisions
    publicTSLevelDivision: async (_, args, context) => {
      try {
        const levelDivision = await publicTSLevelDivision(args, context, dbAlias);

        // Return the results of the query
        return levelDivision;
      } catch (error) {
        console.error('Error fetching levels and divisions results:', error);
        throw new Error('Failed to fetch levels and divisions results');
      }
    },
    eventCalendar: async (_, { condition }, context) => {
      const query = `SELECT * FROM ${dbAlias}_events ${condition}`;
      const requestUrl = context.req.protocol + '://' + context.req.get('host') + context.req.originalUrl;
      const sppUrl = accessPoint(requestUrl);
      
      try {
        const [rows] = await sppUrl.query(query);
        return rows;
      } catch (error) {
        console.error('Error executing MySQL query:', error);
        throw new Error('Failed to fetch data');
      }
    },
    playerDirectory: async (_, { condition }, context) => {
      const query = `SELECT id, name, city, state FROM ${dbAlias}_players ${condition}`;
      const requestUrl = context.req.protocol + '://' + context.req.get('host') + context.req.originalUrl;
      const sppUrl = accessPoint(requestUrl);

      try {
        const [rows] = await sppUrl.query(query);
        const jsonData = JSON.stringify(rows);
        const compressedData = zlib.gzipSync(jsonData).toString('base64');
        return { data: compressedData };
      } catch (error) {
        console.error('Error executing MySQL query:', error);
        throw new Error('Failed to fetch data');
      }
    },
    organizationDirectory: async (_, { condition }, context) => {
      const query = `SELECT id, name, profile_img FROM ${dbAlias}_players ${condition}`;
      const requestUrl = context.req.protocol + '://' + context.req.get('host') + context.req.originalUrl;
      const sppUrl = accessPoint(requestUrl);

      try {
        const [rows] = await sppUrl.query(query);
        const jsonData = JSON.stringify(rows);
        const compressedData = zlib.gzipSync(jsonData).toString('base64');
        return { data: compressedData };
      } catch (error) {
        console.error('Error executing MySQL query:', error);
        throw new Error('Failed to fetch data');
      }
    },
    signIn: async (_, { idToken }) => {
      try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const email = decodedToken.email;

        const token = jwt.sign({ email }, SECRET_KEY, { expiresIn: '72h' });
        return token;
      } catch (error) {
        console.error('Error during sign-in:', error);
        throw new Error('Invalid token');
      }
    },
  }
};

// Initialize Apollo Server
const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: ({ req }) => ({ req })
});

// Start Apollo Server and Express
server.start().then(() => {
  server.applyMiddleware({ app });

  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
});

// Export handler for AWS Lambda
module.exports.handler = serverless(app);