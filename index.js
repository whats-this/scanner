// Required modules
const clam = require('clamscan')();
const debug = require('debug')('scanner:do');
const fs = require('fs');
const path = require('path');
const S3 = require('./lib/S3.js');
const SQS = require('./lib/SQS.js');

// Check for required environment variables
for (let env of [
  'AWS_ACCESSKEY',
  'AWS_REGION',
  'AWS_SECRETKEY',
  'AWS_SQSURL'
]) {
  if (!process.env.hasOwnProperty(env)) {
    throw new Error(`missing required environment variable "${env}"`);
  }
}

// Create _temp folder
if (!fs.existsSync('_temp')) {
  fs.mkdirSync('_temp');
}

// TODO: loop freshclam

/**
 * Handle all errors.
 * @param {Error} error
 */
function handleError (error) {
  // TODO: error handling
  console.error(error);
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
    if (err) return handleError(err);
    debug(`received data from SQS, ${(data.Messages || []).length} records`);
    let promises = [];
    (data.Messages || []).forEach(msg => {
      promises.push(
        Promise.resolve(msg)
        .then(msg => JSON.parse(msg.Body))
        .then(body => { return { msg: msg, msgBody: body }; })
        .then(validateMessageBody)
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

// Start the loop
pollSQS();

/**
 * Validate incoming SQS message body.
 */
function validateMessageBody (data) {
  // eslint-disable-next-line promise/param-names
  return new Promise((resolve, _reject) => {
    function reject (err) {
      deleteSQSMessage(data)
      .then(() => _reject(err))
      .catch(e => _reject([err, e]));
    }
    if (data.msgBody.Event === 's3:TestEvent') return reject(new Error('test event'));
    if (!Array.isArray(data.msgBody.Records)) return reject(new Error('invalid S3 message structure'));
    if (data.msgBody.Records.length !== 1) return reject(new Error('records count !== 1'));
    for (const item of data.msgBody.Records) {
      if (typeof item !== 'object' || item === null) return reject('invalid item in records');
      if (typeof item.eventName !== 'string' || item.eventName.indexOf('ObjectCreated') === -1) return reject('invalid event type on record');
    }
    resolve(data);
  });
}

/**
 * Get object from S3, promisified.
 */
function getObject (data) {
  return new Promise((resolve, reject) => {
    S3.getObject({
      Bucket: data.msgBody.Records[0].s3.bucket.name,
      Key: data.msgBody.Records[0].s3.object.key
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
      data.msgBody.Records[0].s3.bucket.name,
      data.msg.MessageId + data.msgBody.Records[0].s3.object.key.replace(/[^a-z0-9_.-]/gi, '_')
    );

    // Create bucket folder
    if (!fs.existsSync('_temp/' + data.msgBody.Records[0].s3.bucket.name)) {
      fs.mkdirSync('_temp/' + data.msgBody.Records[0].s3.bucket.name);
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
