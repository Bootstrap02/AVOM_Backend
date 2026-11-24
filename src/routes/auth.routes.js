const express = require('express');
const { body } = require('express-validator');
const c = require('../controllers/auth.controller');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/auth');
const { authLimiter } = require('../middlewares/rate-limiters');

const router = express.Router();
const email = body('email').isEmail().withMessage('Enter a valid email address').trim().toLowerCase();

router.post('/:audience/login', authLimiter, email, body('password').notEmpty().withMessage('Enter your password'), validate, c.login);
router.post('/:audience/refresh', authLimiter, c.refresh);
router.post('/:audience/logout', c.logout);
router.get('/me', authenticate(), c.me);

router.post('/activate', authLimiter, body('token').notEmpty(), body('password').notEmpty(), validate, c.activate);
router.post('/forgot-password', authLimiter, email, validate, c.forgotPassword);
router.post('/reset-password', authLimiter, body('token').notEmpty(), body('password').notEmpty(), validate, c.resetPassword);
router.post('/change-password', authenticate(), body('newPassword').notEmpty(), validate, c.changePassword);

module.exports = router;
