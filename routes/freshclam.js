// Required modules
const freshClam = require('../lib/freshclam.js');

/**
 * > GET /freshclam
 * Run freshclam to update the virus database.
 */
module.exports = function* freshclam(next) {
  freshClam().then(() => {
    this.body = null;
    this.status = 200;
    yield;
  }).catch(err => {
    console.error('failed to update virus definitions');
    console.error(err);
    this.body = null;
    this.status = 500;
    yield;
  });
}
