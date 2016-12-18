// Required modules
const freshClam = require('../lib/freshclam.js');

/**
 * > GET /freshclam
 * Run freshclam to update the virus database.
 */
module.exports = function freshclam (req, res, next) {
  freshClam().then(() => {
    res.status(200).end();
  }).catch(err => {
    console.error('failed to update virus definitions');
    console.error(err);
    res.status(500).end();
  });
};
