// src/config/cloudinary.js
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const allowedImageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const imageFileFilter = (req, file, cb) => {
  if (!allowedImageMimeTypes.has(file.mimetype)) {
    return cb(new Error('Неподдерживаемый тип изображения'));
  }
  return cb(null, true);
};

const profileMediaStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const isAvatar = file.fieldname === 'avatar';
    return {
      folder: isAvatar ? 'twitter-clone/avatars' : 'twitter-clone/banners',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: isAvatar
        ? [{ width: 400, height: 400, crop: 'fill', gravity: 'face', fetch_format: 'auto', quality: 'auto:good' }]
        : [{ width: 2400, crop: 'limit', fetch_format: 'auto', quality: 'auto:best' }],
    };
  },
});


const tweetImageStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'twitter-clone/tweets',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 1200, height: 675, crop: 'limit', fetch_format: 'auto', quality: 'auto:good' }],
  },
});

const messageImageStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'twitter-clone/messages',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 800, crop: 'limit', fetch_format: 'auto', quality: 'auto:good' }],
  },
});

const attachmentStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: 'twitter-clone/attachments',
    resource_type: 'auto',
    public_id: `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
  }),
});

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
  uploadProfileMedia,
  uploadTweetImage,
  uploadMessageImage,
  uploadAttachment,
};
