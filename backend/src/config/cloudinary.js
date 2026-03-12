// src/config/cloudinary.js
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'twitter-clone/avatars',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
  },
});

const bannerStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'twitter-clone/banners',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1500, height: 500, crop: 'fill' }],
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

const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
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
  uploadAvatar,
  uploadTweetImage,
  uploadMessageImage,
  uploadBanner: multer({ storage: bannerStorage, limits: { fileSize: 10 * 1024 * 1024 } }),
};