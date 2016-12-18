// Required modules
const express = require('express');

// Check for required environment variables
for (let env of [
  'AWS_ACCESSKEY', // Access key ID
  'AWS_INFECTEDSNSARN', // Notification SNS ARN
  'AWS_REGION', // AWS region
  'AWS_SECRETKEY' // Secret key
]) {
  if (!process.env.hasOwnProperty(env)) {
    throw new Error(`missing required environment variable "${env}"`);
  }
}

// Create Express app
const app = express();
app.disable('x-powered-by');
app.disable('etag');

/**
 * Parse request body.
 */
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'DELETE') {
    return next();
  }
  if (!req.is('application/json')) {
    return res.status(400).json({
      code: 400,
      message: 'invalid content type, should be application/json'
    });
  }

  let rawData = '';

  req.on('data', chunk => {
    rawData += chunk.toString();
  });
  req.on('end', () => {
    try {
      req.body = JSON.parse(rawData);
      next();
    } catch (err) {
      res.status(400).json({
        code: 400,
        message: 'invalid body data, should be a valid JSON string'
      });
    }
  });
});

/**
 * POST /scan
 * Scan the file specified in the S3 event in the body.
 */
app.post('/scan', require('./routes/scan.js'));

/**
 * GET /freshclam
 * Run freshclam to update the virus database.
 */
app.get('/freshclam', require('./routes/freshclam.js'));

/**
 * GET /health
 * Return a 200 OK response, so that Elastic Beanstalk can check if the server
 * is still online.
 */
app.get('/health', (req, res, next) => {
  res.status(200).end();
});

// Listen on 8080
app.listen(8080);
