/**
 * PM2 Configuration for Local Development
 * 
 * This is the ONLY ecosystem config file.
 * DO NOT create ecosystem-*.config.cjs variants.
 * 
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 logs --nostream
 *   pm2 delete smart-measure
 */
module.exports = {
  apps: [
    {
      name: 'smart-measure',
      script: 'npx',
      // LOCAL MODE: Uses local SQLite D1 database (local development data)
      // Use --local flag to avoid remote D1 connection issues
      args: 'wrangler pages dev dist --d1=measure-master-db --local --port 3000 --ip 0.0.0.0',
      cwd: '/home/user/webapp/smart-measure',
      env: {
        NODE_ENV: 'production'
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}
