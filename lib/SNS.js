// Required modules
const AWS = require('aws-sdk');

// Create SNS client
module.exports = new AWS.SNS({
  apiVersion: '2010-03-31',
  accessKeyId: process.env['AWS_ACCESSKEY'],
  region: process.env['AWS_REGION'],
  secretAccessKey: process.env['AWS_SECRETKEY']
});
