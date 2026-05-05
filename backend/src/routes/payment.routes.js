const router = require('express').Router();
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { createPlusPayment, getPlusPaymentStatus } = require('../controllers/payment.controller');

router.use(authenticate);

router.post(
  '/plus/create',
  [
    body('plan').optional().isIn(['month', 'year']).withMessage('План должен быть month или year'),
    body('returnUrl').optional().isURL({ require_tld: false }).withMessage('Некорректный returnUrl'),
  ],
  validate,
  createPlusPayment
);

router.get('/plus/:paymentId', getPlusPaymentStatus);

module.exports = router;
