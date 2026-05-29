// Local development server — Vercel uses api/index.js instead
const app  = require('./app');
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`\n🟢 Grid backend running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Env:    ${process.env.NODE_ENV || 'development'}\n`);
});
