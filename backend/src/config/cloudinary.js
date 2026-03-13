// src/config/cloudinary.js
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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
    transformation: [{ width: 1200, height: 675, crop: 'limit' }],
  },
});

const messageImageStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'twitter-clone/messages',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 800, crop: 'limit' }],
  },
});

const uploadProfileMedia = multer({
  storage: profileMediaStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const uploadTweetImage = multer({
  storage: tweetImageStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const uploadMessageImage = multer({
  storage: messageImageStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

module.exports = {
  cloudinary,
  uploadProfileMedia,
  uploadTweetImage,
  uploadMessageImage
};
