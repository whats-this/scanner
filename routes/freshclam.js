// Required modules
const freshClam = require('../lib/freshclam.js');

/**
 * > GET /freshclam
 * Run freshclam to update the virus database.
 */
module.exports = function* freshclam () {
  yield freshClam();
  this.status = 200;
};
