const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * The desktop's remote server is plain HTTP: there is no TLS on the LAN
 * address, and none on the Tailscale one either — only the optional Funnel URL
 * is https. React Native's gradle plugin sets `usesCleartextTraffic` to false
 * for release builds, so a release APK could reach that Funnel URL and nothing
 * else, which is not how most shops pair. This sets the attribute on the
 * `<application>` element so the LAN and tailnet addresses work too.
 */
module.exports = function withCleartextTraffic(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:usesCleartextTraffic'] = 'true';
    }
    return config;
  });
};
