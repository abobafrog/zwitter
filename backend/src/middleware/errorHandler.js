// src/middleware/errorHandler.js
const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id,
  });

  // Prisma errors
  if (err.code === 'P2002') {
    // В некоторых версиях Prisma поле лежит в message
    const errMessage = err.message || '';
    
    let message = 'Никнейм или email уже заняты';
  
    if (errMessage.includes('username')) {
      message = 'Этот никнейм уже занят, попробуй другой';
    } else if (errMessage.includes('email')) {
      message = 'Этот email уже зарегистрирован, попробуй войти';
    }
  
    return res.status(409).json({ error: message });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Запись не найдена' });
  }

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Файл слишком большой' });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Недействительный токен' });
  }

  const status = err.status || err.statusCode || 500;
  const message =
    process.env.NODE_ENV === 'production' && status === 500
      ? 'Внутренняя ошибка сервера'
      : err.message || 'Внутренняя ошибка сервера';

  res.status(status).json({ error: message });
};

module.exports = errorHandler;
