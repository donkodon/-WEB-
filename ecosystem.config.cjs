module.exports = {
  apps: [
    {
      name: 'smart-measure',
      script: 'npx',
      // LOCAL MODE: Uses local Cloudflare D1 database (development)
      args: 'wrangler pages dev dist --port 3000 --ip 0.0.0.0 --local',
      cwd: '/home/user/webapp/smart-measure',
      env: {
        NODE_ENV: 'production'
      },
      watch: false
    }
  ]
}
