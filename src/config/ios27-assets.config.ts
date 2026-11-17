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

export const IOS27_DUO_OUTER_MASK_SVG_PATH =
  'M 10.26 0.00 L 390.37 0.00 C 416.67 0.00, 426.20 2.74, 435.82 7.88 ' +
  'C 445.43 13.02, 452.98 20.57, 458.12 30.18 C 463.26 39.80, 466.00 49.33, 466.00 75.63 ' +
  'L 466.00 602.37 C 466.00 628.67, 463.26 638.20, 458.12 647.82 ' +
  'C 452.98 657.43, 445.43 664.98, 435.82 670.12 C 426.20 675.26, 416.67 678.00, 390.37 678.00 ' +
  'L 10.26 678.00 C 6.69 678.00, 5.40 677.63, 4.09 676.93 ' +
  'C 2.79 676.23, 1.77 675.21, 1.07 673.91 C 0.37 672.60, 0.00 671.31, 0.00 667.74 ' +
  'L 0.00 10.26 C 0.00 6.69, 0.37 5.40, 1.07 4.09 ' +
  'C 1.77 2.79, 2.79 1.77, 4.09 1.07 C 5.40 0.37, 6.69 0.00, 10.26 0.00 Z';

export const IOS27_NOTCH_03_SVG_PATH =
  'M 175.56 0.00 C 174.91 0.01, 174.24 0.04, 173.54 0.18 C 172.39 0.39, 171.39 0.83, 170.62 1.58 ' +
  'C 169.85 2.34, 169.39 3.32, 169.15 4.47 C 168.90 5.65, 168.92 6.75, 168.88 7.80 ' +
  'C 168.81 10.17, 168.78 12.38, 168.39 14.83 C 168.01 17.19, 167.34 19.34, 166.28 21.43 ' +
  'C 164.99 23.94, 163.17 26.24, 160.97 28.14 C 158.71 30.08, 156.17 31.52, 153.42 32.40 ' +
  'C 148.91 33.86, 144.43 33.67, 139.68 33.67 L 36.32 33.67 ' +
  'C 31.57 33.67, 27.09 33.86, 22.58 32.40 C 19.83 31.52, 17.28 30.08, 15.03 28.14 ' +
  'C 12.83 26.24, 11.01 23.94, 9.72 21.43 C 8.66 19.34, 7.99 17.19, 7.61 14.83 ' +
  'C 7.22 12.38, 7.19 10.17, 7.11 7.80 C 7.08 6.75, 7.10 5.65, 6.85 4.47 ' +
  'C 6.61 3.32, 6.15 2.34, 5.38 1.58 C 4.61 0.83, 3.61 0.39, 2.46 0.18 ' +
  'C 1.76 0.04, 1.09 0.01, 0.44 0.00 Z';
