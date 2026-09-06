require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const isVideo = file.mimetype.startsWith('video');
    return {
      folder: 'an-moc-nhien',
      resource_type: isVideo ? 'video' : 'image',
      allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'mp4', 'mkv'],
    };
  },
});

const upload = multer({ storage: storage });

module.exports = { cloudinary, upload };