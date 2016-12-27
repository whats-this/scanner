// Required modules
const freshClam = require('../lib/freshclam.js');

/**
 * > GET /freshclam
 * Run freshclam to update the virus database.
 */
module.exports = function* freshclam() {
  freshClam().then(() => {
    this.status = 200;
  }).catch(err => {
    console.error('failed to update virus definitions');
    console.error(err);
    this.status = 500;
  });
}
