const exec = require('child_process').exec;
const debug = require("debug")("scanner");

module.exports = function refresh() {
  return new Promise((resolve, reject) => {
    debug('Updating virus database')
    const proc = exec('freshclam', [], {stdio: 'inherit'});
    proc.on('error', reject);
    proc.on('exit', code => {
      if (code !== 0) return void reject(new Error(`Clamscan exited with code ${code}`));
      debug('Finished updating');
      resolve();
    })
  });
}