// Minimal Nuxt 3 config. Real Nuxt apps add modules, runtime config, etc.
// For analyzer purposes the file mainly signals "this is a Nuxt project"
// (already detected via package.json deps).
export default {
  ssr: false,
  components: [{ path: '~/components', pathPrefix: false }],
};
