// Required modules
const exec = require('child_process').exec;
const debug = require('debug')('scanner:freshclam');

/**
 * Run `freshclam` using child_process in order to refresh the ClamAV virus
 * database on the system.
 * @return {Promise<undefined, Error>}
 */
module.exports = () => {
  return new Promise((resolve, reject) => {
    debug('updating virus database using freshclam');
    exec('freshclam', [], { stdio: 'inherit' })
      .on('error', reject)
      .on('exit', code => {
        if (code !== 0) return void reject(new Error(`freshclam exited with code ${code}`));
        debug('finished updating virus database');
        resolve();
      });
  });
};
