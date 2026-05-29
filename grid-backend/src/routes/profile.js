const express = require('express');
const db      = require('../lib/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/profile
router.get('/', async (req, res, next) => {
  try {
    const [user, profile] = await Promise.all([
      db.user.findUnique({ where: { id: req.user.id }, select: { id: true, email: true, name: true } }),
      db.userProfile.findUnique({ where: { userId: req.user.id } }),
    ]);
    res.json({ ...user, profile: profile || {} });
  } catch (err) { next(err); }
});

// PUT /api/profile
router.put('/', async (req, res, next) => {
  try {
    const { name, dob, gender, city, occupation, heightCm, weightKg, bio } = req.body;

    // Update name on user record
    if (name !== undefined) {
      await db.user.update({ where: { id: req.user.id }, data: { name } });
    }

    // Upsert profile details
    const profile = await db.userProfile.upsert({
      where:  { userId: req.user.id },
      create: { userId: req.user.id, dob, gender, city, occupation, heightCm: heightCm ? parseFloat(heightCm) : null, weightKg: weightKg ? parseFloat(weightKg) : null, bio },
      update: { dob, gender, city, occupation, heightCm: heightCm ? parseFloat(heightCm) : null, weightKg: weightKg ? parseFloat(weightKg) : null, bio },
    });

    res.json({ profile });
  } catch (err) { next(err); }
});

module.exports = router;
