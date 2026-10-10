/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@telehealth/shared-types', '@telehealth/booking', '@telehealth/loading'],
};

export default nextConfig;
