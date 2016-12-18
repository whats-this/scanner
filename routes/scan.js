// Required modules
const clam = require('clamscan')({
  preference: 'clamscan'
});
const debug = require('debug')('scanner:do');
const fs = require('fs');
const path = require('path');
const S3 = require('../lib/S3.js');
const SNS = require('../lib/SNS.js');

// Create _temp folder
if (!fs.existsSync('_temp')) {
  fs.mkdirSync('_temp');
}

/**
 * Get object from S3, promisified.
 */
function getObject (data) {
  return new Promise((resolve, reject) => {
    S3.getObject({
      Bucket: data.Records[0].s3.bucket.name,
      Key: data.Records[0].s3.object.key
    }, (err, res) => {
      if (err) return reject(err);
      data.Body = new Buffer(res.Body);
      resolve(data);
    });
  });
}

/**
 * Create a temporary file on disk for scanning.
 */
function writeTempFile (data) {
  return new Promise((resolve, reject) => {
    // Construct the filepath (including random key)
    const filepath = path.join(
      '.',
      '_temp',
      data.Records[0].s3.bucket.name,
      data.Records[0].s3.object.key.replace(/[^a-z0-9_.-]/gi, '_')
    );

    // Create bucket folder
    if (!fs.existsSync('_temp/' + data.Records[0].s3.bucket.name)) {
      fs.mkdirSync('_temp/' + data.Records[0].s3.bucket.name);
    }

    // Write the file
    fs.writeFile(filepath, data.Body, err => {
      if (err) return reject(err);
      data.filepath = filepath;
      resolve(data);
    });
  });
}

/**
 * Scan the file for viruses.
 */
function clamScan (data) {
  return new Promise((resolve, reject) => {
    clam.is_infected(data.filepath, (err, _, isInfected) => {
      if (err) return reject(err);
      data.isInfected = isInfected;
      resolve(data);
    });
  });
}

/**
 * Unlink temporary file.
 */
function unlinkTempFile (data) {
  return new Promise((resolve, reject) => {
    fs.unlink(data.filepath, (err) => {
      if (err) return reject(err);
      resolve(data);
    });
  });
}

/**
 * Deleted infected files from S3.
 */
function deleteInfectedFromS3 (data) {
  return new Promise((resolve, reject) => {
    if (!data.isInfected) return resolve(data);
    S3.deleteObject({
      Bucket: data.Records[0].s3.bucket.name,
      Key: data.Records[0].s3.object.key
    }, (err, res) => {
      if (err) return reject(err);
      data.wasPermanentlyDeleted = res.DeleteMarker;
      resolve(data);
    });
  });
}

/**
 * Send a notification to a SNS topic if the file is infected.
 */
function fireInfectedNotification (data) {
  return new Promise((resolve, reject) => {
    if (!data.isInfected) return resolve(data);
    SNS.publish({
      TopicArn: process.env['AWS_INFECTEDSNSARN'],
      Message: JSON.stringify({
        event: 'scanner:result',
        infected: true,
        permanentlyDeletedFromSource: data.wasPermanentlyDeleted,
        sourceBucket: data.Records[0].s3.bucket.name,
        key: data.Records[0].s3.object.key
      })
    }, (err, data) => {
      if (err) return reject(err);
      resolve(data);
    });
  });
}

/**
 * > POST /scan
 * Scan the file specified in the S3 event in the body.
 */
module.exports = function scan (req, res, next) {
  debug('received data from SQS');

  // Reject incoming data
  function rejectData (msg) {
    res.status(400).json({
      code: 400,
      message: msg
    });
  }

  // Test incoming data
  if (req.body.Event === 's3:TestEvent') return rejectData('test event');
  if (!Array.isArray(req.body.Records)) return rejectData('invalid S3 message structure');
  if (req.body.Records.length !== 1) return rejectData('records count !== 1');
  for (const item of req.body.Records) {
    if (typeof item !== 'object' || item === null) return rejectData('invalid item in records');
    if (typeof item.eventName !== 'string' || item.eventName.indexOf('ObjectCreated') === -1) return rejectData('invalid event type on record');
  }

  // Promise chain for processing the scan
  Promise.resolve(req.body)
    .then(getObject)
    .then(writeTempFile)
    .then(clamScan)
    // TODO: .then(uploadInfectedToS3)
    .then(unlinkTempFile)
    .then(deleteInfectedFromS3)
    .then(fireInfectedNotification)
    .then(data => {
      res.status(200).json({
        processed: true,
        infected: data.isInfected || false,
        permanentlyDeleted: data.wasPermanentlyDeleted || false
      });
    })
    .catch(err => {
      console.error(err.stack);
      res.status(500).json({
        code: 500,
        message: 'internal server error',
        data: {
          type: err.type,
          name: err.name,
          arguments: err.arguments,
          message: err.message
        }
      });
    });
};
