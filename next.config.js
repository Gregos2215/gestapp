/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Désactiver ESLint pendant le build pour déployer malgré les warnings
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Désactiver la vérification des types pendant le build
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig
