const clam = require('clamscan')();
const fs = require('fs');
const path = require('path');
const getFile = require('./getfile');

module.exports = function scanFile (notif, S3) {
  return new Promise((resolve, reject) => {
    const key = notif.Records[0].s3.object.key;
    getFile(S3, key).then(file => {
      const filepath = path.resolve(path.join(__dirname, '/files/', key));
      fs.writeFile(filepath, file.body, (err) => {
        if (err) return void reject(err);
        clam.is_infected(filepath, (err, _, isInfected) => {
          fs.unlink(filepath, (unlinkErr) => {
            if (err || unlinkErr) return void reject(err || unlinkErr);
            resolve({infected: isInfected});
          });
        });
      });
    }, reject);
  });
};
