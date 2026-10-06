const express = require('express');
const db      = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');

const router = express.Router();
router.use(requireAuth);

const text = (n) => z.string().trim().max(n).nullish();
const profileSchema = z.object({
  name:       text(120),
  dob:        text(10),
  gender:     text(30),
  city:       text(120),
  occupation: text(120),
  heightCm:   z.coerce.number().min(0).max(300).nullish(),
  weightKg:   z.coerce.number().min(0).max(500).nullish(),
  bio:        text(1000),
});

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
router.put('/', validate(profileSchema), async (req, res, next) => {
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
