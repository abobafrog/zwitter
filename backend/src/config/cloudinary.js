// src/config/cloudinary.js
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const uploadRoot = path.join(__dirname, '..', '..', 'uploads');
const publicPrefix = '/uploads';
const hasCloudinaryConfig = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

const safeName = (value = 'file') => value
  .replace(/\.[^.]+$/, '')
  .replace(/[^a-zA-Z0-9._-]/g, '_')
  .slice(0, 80) || 'file';

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });

const resolveLocalFolder = (req, file) => {
  if (file.fieldname === 'avatar') return 'avatars';
  if (file.fieldname === 'banner') return 'banners';

  if (file.fieldname === 'attachment') {
    if (req.baseUrl?.includes('/tweets')) return 'tweets';
    if (req.baseUrl?.includes('/chats')) return 'messages';
    return 'attachments';
  }

  return 'uploads';
};

class LocalStorageEngine {
  _handleFile(req, file, cb) {
    try {
      const folder = resolveLocalFolder(req, file);
      const destination = path.join(uploadRoot, folder);
      ensureDir(destination);

      const extension = path.extname(file.originalname).slice(0, 12);
      const filename = `${Date.now()}-${crypto.randomUUID()}-${safeName(file.originalname)}${extension}`;
      const target = path.join(destination, filename);
      const out = fs.createWriteStream(target);

      file.stream.pipe(out);
      out.on('error', cb);
      out.on('finish', () => {
        cb(null, {
          destination,
          filename,
          path: `${publicPrefix}/${folder}/${filename}`,
          size: out.bytesWritten,
        });
      });
    } catch (error) {
      cb(error);
    }
  }

  _removeFile(req, file, cb) {
    const relativePath = (file.path || '').replace(/^\/+/, '');
    const absolutePath = relativePath.startsWith('uploads/')
      ? path.join(uploadRoot, relativePath.replace(/^uploads\//, ''))
      : path.join(uploadRoot, relativePath);

    fs.unlink(absolutePath, cb);
  }
}

const allowedImageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const imageFileFilter = (req, file, cb) => {
  if (!allowedImageMimeTypes.has(file.mimetype)) {
    return cb(new Error('Неподдерживаемый тип изображения'));
  }
  return cb(null, true);
};

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const makeStorage = (cloudinaryParams, localParams) => (
  hasCloudinaryConfig
    ? new CloudinaryStorage({
        cloudinary,
        params: cloudinaryParams,
      })
    : new LocalStorageEngine(localParams)
);

const profileMediaStorage = makeStorage(
  async (req, file) => {
    const isAvatar = file.fieldname === 'avatar';
    return {
      folder: isAvatar ? 'twitter-clone/avatars' : 'twitter-clone/banners',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: isAvatar
        ? [{ width: 400, height: 400, crop: 'fill', gravity: 'face', fetch_format: 'auto', quality: 'auto:good' }]
        : [{ width: 2400, crop: 'limit', fetch_format: 'auto', quality: 'auto:best' }],
    };
  }
);

const tweetImageStorage = makeStorage({
  folder: 'twitter-clone/tweets',
  allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
  transformation: [{ width: 1200, height: 675, crop: 'limit', fetch_format: 'auto', quality: 'auto:good' }],
});

const messageImageStorage = makeStorage({
  folder: 'twitter-clone/messages',
  allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
  transformation: [{ width: 800, crop: 'limit', fetch_format: 'auto', quality: 'auto:good' }],
});

const attachmentStorage = makeStorage(
  async (req, file) => ({
    folder: 'twitter-clone/attachments',
    resource_type: 'auto',
    public_id: `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
  })
);

const uploadProfileMedia = multer({
  storage: profileMediaStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

const uploadTweetImage = multer({
  storage: tweetImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

const uploadMessageImage = multer({
  storage: messageImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

const uploadAttachment = multer({
  storage: attachmentStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
});

module.exports = {
  cloudinary,
  hasCloudinaryConfig,
  uploadProfileMedia,
  uploadTweetImage,
  uploadMessageImage,
  uploadAttachment,
};
