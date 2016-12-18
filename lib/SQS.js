// Required modules
const AWS = require('aws-sdk');

// Create SQS client
module.exports = new AWS.SQS({
  apiVersion: '2012-11-05',
  accessKeyId: process.env['AWS_ACCESSKEY'],
  region: process.env['AWS_REGION'],
  secretAccessKey: process.env['AWS_SECRETKEY']
});
