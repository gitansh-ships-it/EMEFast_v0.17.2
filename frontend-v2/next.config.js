/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/routing/traffic-tile/:z/:x/:y.png',
        destination: 'https://api.tomtom.com/traffic/map/4/tile/flow/relative0/:z/:x/:y.png?key=FtEclPAu7Ksrt5sy6f5XvnHr4JmDZ8uB',
      },
    ];
  },
};

module.exports = nextConfig;
