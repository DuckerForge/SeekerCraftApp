// Expo config plugin: removes unnecessary permissions from AndroidManifest.xml
const { withAndroidManifest } = require('@expo/config-plugins');

const REMOVE_PERMISSIONS = [
  'android.permission.RECORD_AUDIO',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.MODIFY_AUDIO_SETTINGS',
];

module.exports = (config) =>
  withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults;
    if (!manifest.manifest['uses-permission']) return mod;
    manifest.manifest['uses-permission'] = manifest.manifest['uses-permission'].filter(
      (perm) => !REMOVE_PERMISSIONS.includes(perm.$['android:name'])
    );
    return mod;
  });
