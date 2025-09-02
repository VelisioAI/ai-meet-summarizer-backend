const app = require('./app')
const config = require('./utils/config')
const logger = require('./utils/logger')

// Debug: Print all registered routes
const printRoutes = (router, layer = '') => {
  console.log('\n=== ROUTE DEBUGGING ===');
  
  router._router.stack.forEach((middleware, i) => {
    console.log(`\n[Middleware ${i}]`);
    console.log(`Name: ${middleware.name}`);
    console.log(`Path: ${middleware.route?.path || 'N/A'}`);
    console.log(`Methods:`, middleware.route?.methods || 'N/A');
    console.log(`Regexp:`, middleware.regexp ? middleware.regexp.toString() : 'N/A');
    
    if (middleware.name === 'router') {
      console.log('\n  Nested routes:');
      middleware.handle.stack.forEach((handler, j) => {
        console.log(`  [Handler ${j}]`);
        console.log(`  Path:`, handler.route?.path || 'N/A');
        console.log(`  Methods:`, handler.route?.methods || 'N/A');
      });
    }
  });
  
  console.log('\n=== END ROUTE DEBUG ===\n');
};

// Export the Express API for Vercel serverless functions
module.exports = app;

// Only start the server if not in a serverless environment
if (process.env.NODE_ENV !== 'production') {
  const server = app.listen(config.PORT, () => {
    logger.info(`Server running on port ${config.PORT}`);
    printRoutes(app);
  });
}