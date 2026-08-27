const multer = require('multer');

module.exports = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ok = /\.(csv|xlsx)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only .csv and .xlsx files are accepted'), ok);
  },
});
