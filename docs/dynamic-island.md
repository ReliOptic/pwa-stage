# Idle Dynamic Island geometry

The table uses Apple’s 612 × 760 front-facing comparison images. Measure the lit front display edge to edge on a horizontal scanline below the top corners. Measure the pill across its widest row, its height at its center and the gap from the lit display to the pill. Include the camera within the black silhouette. Divide each distance by the lit display width and multiply by the portrait logical width. Round once to whole logical points. JPEG edges and the boundary between dark wallpaper and black bezel introduce uncertainty of a few points.

| Model | Logical width (pt) | Lit width (image px) | Pill W × H, gap (image px) | Rendered W × H, gap (pt) | Apple source |
|---|---:|---:|---|---|---|
| 18 Pro | 402 | 290 | 68 × 26, 10 | 94 × 36, 14 | [Front view](https://www.apple.com/v/iphone/compare/an/images/overview/compare_iphone_18_pro_silver__w26x0ab2ln6a_large_2x.jpg) |
| 18 Pro Max | 440 | 317 | 68 × 25, 11 | 94 × 35, 15 | [Front view](https://www.apple.com/v/iphone/compare/an/images/overview/compare_iphone_18_pro_max_silver__bkvexz4dqd36_large_2x.jpg) |
| 17 | 402 | 290 | 89 × 25, 11 | 123 × 35, 15 | [Front view](https://www.apple.com/v/iphone/compare/an/images/overview/compare_iphone17_white__cddjqf5mzlaq_large_2x.jpg) |
| 17 Pro | 402 | 290 | 91 × 26, 11 | 126 × 36, 15 | [Front view](https://www.apple.com/v/iphone/compare/an/images/overview/compare_iphone17_pro_silver__c7bbt5uwieye_large_2x.jpg) |
| 17 Pro Max | 440 | 317 | 91 × 26, 10 | 126 × 36, 14 | [Front view](https://www.apple.com/v/iphone/compare/an/images/overview/compare_iphone17_pro_max_silver__dtw5i9e8osmu_large_2x.jpg) |
| Air | 420 | 303 | 89 × 26, 15 | 123 × 36, 21 | [Front view](https://www.apple.com/v/iphone/compare/an/images/overview/compare_iphone_air_cloud_white__fay39sc7sru6_large_2x.jpg) |
| 16 | 393 | 283 | 89 × 26, 9 | 124 × 36, 12 | [Front view](https://www.apple.com/v/iphone/compare/an/images/overview/compare_iphone16_white__dcn5vobxo7ki_large_2x.jpg) |
| 16 Plus | 430 | 310 | 90 × 26, 9 | 125 × 36, 12 | [Front view](https://www.apple.com/v/iphone/compare/an/images/overview/compare_iphone16_plus_white__rqden70u9uqi_large_2x.jpg) |

The Air image shows the lens at the left end. The other seven images show it on the right. Landscape uses the same silhouette rotated counterclockwise with the lens and top-edge gap. The portrait status bar aligns its vertical center and side regions to the model geometry.

The iPhone 18 and 18e projected presets retain their 122 × 36 pt, 11 pt inset assumptions. The eight image-derived entries above have independent sources. Viewport aliases describe web layout sizes only. Notch, Touch ID and Duo presets retain their respective hardware treatments. Native Live Activities, expanded/compact content presentations and system animation are outside this idle-hardware measurement. Xcode Safari viewport probes do not measure the physical sensor housing. The catalogue Electron test checks rendered bounds in logical coordinates and captures compositor pixels for visual review.
