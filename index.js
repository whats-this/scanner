// Required modules
const clam = require('clamscan')();
const crypto = require('crypto');
const freshclam = require('./lib/freshclam.js');
const fs = require('fs');
const path = require('path');
const S3 = require('./lib/S3.js');
const SQS = require('./lib/SQS.js');
const scanner = require('./lib/scanner.js');

// Check for required environment variables
for (let env of [
  'AWS_ACCESSKEY',
  'AWS_SECRETKEY',
  'AWS_SQSURL'
]) {
  if (!process.env.hasOwnProperty(env)) {
    throw new Error(`missing required environment variable "${env}"`);
  }
}

// TODO: loop freshclam

/**
 * Handle all errors.
 * @param {Error} error
 */
function handleError (error) {
  // TODO: error handling
}

/**
 * Check SQS for messages and process virus scanning.
 */
function pollSQS () {
  SQS.receiveMessage({
    MaxNumberOfMessages: 10,
    QueueUrl: process.env['AWS_SQSURL'],
    WaitTimeSeconds: 20
  }, function (err, data) {
    if (err) return handleError(error);
    let promises = [];
    (data.Records || []).forEach(msg => {
      promises.push(
        Promise.resolve(msg)
        .then(msg => JSON.parse(msg.Body))
        .then(body => { msg: msg, msgBody: body })
        .then(getObject)
        .then(writeTempFile)
        .then(clamScan)
        .then(unlinkTempFile)
        // .then(fireNotification)
        .then(deleteInfectedFromS3)
        .then(deleteSQSMessage)
        .catch(handleError)
      );
    });

    // Loop
    Promise.all(promises)
    .then(() => setImmediate(pollSQS))
    .catch(err => handleError(err) && setImmediate(pollSQS));
  });
}

/**
 * Get object from S3, promisified.
 * @param {Object} params
 * @return {Promise<Object, Error>}
 */
function getObject (data) {
  return new Promise((resolve, reject) => {
    S3.getObject({
      Bucket: body.s3.bucket.name,
      Key: body.s3.object.Key
    }, (err, res) => {
      if (err) return reject(err);
      data.Body = new Buffer(res.Body);
      resolve(data);
    });
  });
}

/**
 * Generate random key.
 * @return {string} 6 character key.
 */
function generateRandomKey () {
  const seed = String(Math.floor(Math.random() * 10) + Date.now());
  return crypto.createHash('md5').update(seed).digest('hex').substr(2, 6);
}

/**
 * Create a temporary file on disk for scanning.
 */
function writeTempFile (data) {
  return new Promise((resolve, reject) => {
    // Construct the filepath (including random key)
    const filepath = path.join('.', '_temp', data.Bucket, generateRandomKey() + data.Key.replace(/[^a-z0-9_.-]/gi, '_'));

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
    fs.unlink(filepath, (err) => {
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
    S3.deleteObject({ Bucket: data.Bucket, Key: data.Key }, (err, res) => {
      if (err) return reject(err);
      data.wasPermanentlyDeletedFromS3 = res.DeleteMarker;
      resolve(data);
    });
  });
}

/**
 * Delete processed SQS message.
 */
function deleteSQSMessage (data) {
  return new Promise((resolve, reject) => {
    SQS.deleteMessage({
      QueueUrl: process.env['AWS_SQSURL'],
      ReceiptHandle: data.msg.ReceiptHandle
    }, (err) => {
      if (err) return reject(err);
      resolve(data);
    });
  });
}
