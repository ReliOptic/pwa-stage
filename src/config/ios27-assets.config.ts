export interface Ios27StatusIconPaths {
  readonly cellularLight: string;
  readonly cellularDark: string;
  readonly wifiLight: string;
  readonly wifiDark: string;
  readonly batteryLight: string;
  readonly batteryDark: string;
}

export interface Ios27ChromeAssetSet {
  readonly phone11: string;
  readonly phone12: string;
  readonly phoneAir: string;
  readonly phone14DuoInner: string;
  readonly phone14DuoInnerWide: string;
  readonly phone15DuoOuter: string;
  readonly notchSensorBar03: string;
}

export const IOS27_STATUS_ICONS: Ios27StatusIconPaths = {
  cellularLight: './assets/ios27/status-cellular-light.png',
  cellularDark: './assets/ios27/status-cellular-dark.png',
  wifiLight: './assets/ios27/status-wifi-light.png',
  wifiDark: './assets/ios27/status-wifi-dark.png',
  batteryLight: './assets/ios27/status-battery-light.png',
  batteryDark: './assets/ios27/status-battery-dark.png'
};

export const IOS27_CHROME_ASSETS: Ios27ChromeAssetSet = {
  phone11: './assets/ios27/chrome-phone11.png',
  phone12: './assets/ios27/chrome-phone12.png',
  phoneAir: './assets/ios27/chrome-phone-air.png',
  phone14DuoInner: './assets/ios27/chrome-phone14.png',
  phone14DuoInnerWide: './assets/ios27/chrome-phone14-wide.png',
  phone15DuoOuter: './assets/ios27/chrome-phone15.png',
  notchSensorBar03: './assets/ios27/notch-sensor-bar-03.png'
};

// Original rounded rectangle and quadratic sensor housing, authored here.
// Coordinates are UI estimates, not traced vendor artwork.
export const IOS27_DUO_OUTER_MASK_SVG_PATH =
  'M 12 0 H 390 Q 466 0 466 76 V 602 Q 466 678 390 678 H 12 Q 0 678 0 666 V 12 Q 0 0 12 0 Z';
export const IOS27_NOTCH_03_SVG_PATH =
  'M 0 0 H 176 Q 168 0 168 9 V 13 Q 168 34 145 34 H 31 Q 8 34 8 13 V 9 Q 8 0 0 0 Z';
