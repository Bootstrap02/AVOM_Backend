const { body } = require('express-validator');

const submitRules = [
  body('fullName').trim().isLength({ min: 3, max: 120 }).withMessage('Enter your full name'),
  body('email').trim().toLowerCase().isEmail().withMessage('Enter a valid email address'),
  body('phone').trim().isLength({ min: 6, max: 25 }).withMessage('Enter a phone or WhatsApp number'),
  body('country').trim().notEmpty().withMessage('Select your country'),
  body('city').trim().notEmpty().withMessage('Enter your city'),
  body('gender').optional({ values: 'falsy' }).isIn(['male', 'female']).withMessage('Choose male or female'),
  body('studyMode').optional({ values: 'falsy' }).isIn(['online', 'modular', 'on_ground']).withMessage('Choose a study mode'),
  body('programme').optional({ values: 'falsy' }).isMongoId().withMessage('Choose a valid programme'),
  body('testimony').optional().isLength({ max: 3000 }),
  body('reason').optional().isLength({ max: 3000 }),
];

const acceptRules = [
  body('programme').optional({ values: 'falsy' }).isMongoId(),
  body('batch').optional({ values: 'falsy' }).isMongoId(),
  body('studyMode').optional({ values: 'falsy' }).isIn(['online', 'modular', 'on_ground']),
];

const rejectRules = [body('reason').trim().isLength({ min: 3, max: 1000 }).withMessage('Please give a reason for rejecting')];

module.exports = { submitRules, acceptRules, rejectRules };
