const crypto = require('crypto');

const YOOKASSA_API_URL = 'https://api.yookassa.ru/v3/payments';

const getPlusPlan = (plan = 'month') => {
  if (plan === 'year') {
    return {
      plan: 'year',
      amount: process.env.YOOKASSA_PLUS_YEAR_AMOUNT || '2990.00',
      description: 'Zwiteer Plus - annual subscription',
    };
  }

  return {
    plan: 'month',
    amount: process.env.YOOKASSA_PLUS_MONTH_AMOUNT || '299.00',
    description: 'Zwiteer Plus - monthly subscription',
  };
};

const getYooKassaAuthHeader = () => {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;

  if (!shopId || !secretKey) return null;
  return `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`;
};

const createPlusPayment = async (req, res, next) => {
  try {
    const authHeader = getYooKassaAuthHeader();
    if (!authHeader) {
      return res.status(503).json({ error: 'YooKassa не настроена. Укажите YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY.' });
    }

    const { plan = 'month', returnUrl } = req.body;
    const normalizedReturnUrl = typeof returnUrl === 'string' && returnUrl.startsWith('http')
      ? returnUrl
      : `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings`;
    const plusPlan = getPlusPlan(plan);
    const idempotenceKey = crypto.randomUUID();

    const response = await fetch(YOOKASSA_API_URL, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        'Idempotence-Key': idempotenceKey,
      },
      body: JSON.stringify({
        amount: {
          value: plusPlan.amount,
          currency: 'RUB',
        },
        capture: true,
        confirmation: {
          type: 'redirect',
          return_url: `${normalizedReturnUrl}${normalizedReturnUrl.includes('?') ? '&' : '?'}plusPayment=return`,
        },
        description: plusPlan.description,
        metadata: {
          userId: req.user.id,
          username: req.user.username,
          plan: plusPlan.plan,
        },
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        error: payload?.description || payload?.error || 'Не удалось создать платёж YooKassa',
        details: payload,
      });
    }

    return res.status(201).json({
      paymentId: payload.id,
      status: payload.status,
      confirmationUrl: payload.confirmation?.confirmation_url || null,
      test: Boolean(payload.test),
    });
  } catch (error) {
    next(error);
  }
};

const getPlusPaymentStatus = async (req, res, next) => {
  try {
    const authHeader = getYooKassaAuthHeader();
    if (!authHeader) {
      return res.status(503).json({ error: 'YooKassa не настроена. Укажите YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY.' });
    }

    const response = await fetch(`${YOOKASSA_API_URL}/${req.params.paymentId}`, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
    });
    const payload = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: payload?.description || payload?.error || 'Не удалось получить статус платежа',
        details: payload,
      });
    }

    return res.json({
      paymentId: payload.id,
      status: payload.status,
      paid: Boolean(payload.paid),
      test: Boolean(payload.test),
      metadata: payload.metadata || {},
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createPlusPayment,
  getPlusPaymentStatus,
};
