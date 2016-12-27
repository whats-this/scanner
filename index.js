// Required modules
const koa = require('koa');

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

// Create Koa app
const app = koa();
const route = require("koa-route");

/**
 * Parse request body.
 */
app.use(next => {
  if (req.method === 'GET' || req.method === 'DELETE') {
    yield next;
    return;
  }
  if (!this.headers['application/json']) {
    this.status = 400;
    this.body = {
      code: 400,
      message: 'invalid content type, should be application/json'
    };
    yield next;
    return;
  }

  let rawData = '';

  this.req.on('data', chunk => {
    rawData += chunk.toString();
  });
  this.req.on('end', () => {
    try {
      this.req.body = JSON.parse(rawData);
      yield next;
      return;
    } catch (err) {
      this.body = {
        code: 400,
        message: 'invalid body data, should be a valid JSON string'
      };
      this.status = 400;
    }
  });
});

/**
 * POST /scan
 * Scan the file specified in the S3 event in the body.
 */
app.use(route.post('/scan', require('./routes/scan.js')));

/**
 * GET /freshclam
 * Run freshclam to update the virus database.
 */
app.use(route.get('/freshclam', require('./routes/freshclam.js')));

/**
 * GET /health
 * Return a 200 OK response, so that Elastic Beanstalk can check if the server
 * is still online.
 */
app.use(route.get('/health', () => {
  this.status = 200;
}));

// Listen on 8080
app.listen(8080);
