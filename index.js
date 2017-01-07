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
const route = require('koa-route');

// Error handler
app.use(function* (next) {
  try {
    yield next;
  } catch (err) {
    if (err.isBoom) {
      this.status = err.output.statusCode || 500;
      this.body = err.output.payload || '';
      this.set('content-type', 'application/json; charset=utf-8');
      for (const header in err.output.headers || {}) {
        this.set(header, err.output.headers[header]);
      }
    } else {
      this.status = err.status || 500;
      this.body = err.message || '';
    }

    if (this.status > 499) this.app.emit('error', err, this);
  }
});

/**
 * Parse request body.
 */
app.use(function* (next) {
  if (this.req.method === 'GET' || this.req.method === 'DELETE') {
    yield next;
    return;
  }
  if (!this.headers['content-type'] || !~this.headers['content-type'].indexOf('application/json')) {
    this.status = 400;
    this.body = {
      code: 400,
      message: 'invalid content type, should be application/json'
    };
    return;
  }

  try {
    const body = yield new Promise((resolve, reject) => {
      let rawData = '';
      this.req.on('data', chunk => {
        rawData += chunk.toString();
      });
      this.req.on('end', () => {
        try {
          resolve(JSON.parse(rawData));
        } catch (err) {
          reject({
            code: 400,
            message: 'invalid body data, should be a valid JSON string'
          });
        }
      });
    });
    this.req.body = body;
    yield next;
  } catch (e) {
    this.status = 400;
    this.body = e;
    return;
  }
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
