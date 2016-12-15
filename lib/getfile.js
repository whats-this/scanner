module.exports = function getFile (S3, key) {
  return new Promise((resolve, reject) => {
    S3.getObject({
      Bucket: `${process.env.SERVICE}-filestore-${process.env.STAGE}-1`,
      Key: key
    }, (err, file) => {
      if (err) return void reject(err);
      resolve(file);
    });
  });
};
