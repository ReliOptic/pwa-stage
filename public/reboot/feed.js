/* GET /api/feed 와 GET /api/discover 의 응답을 대신한다. 제품에서는 서버에서 온다. */
window.__FEED = {
 "me": {
  "id": "u1",
  "name": "견본 사용자"
 },
 "camps": [
  {
   "id": "dev",
   "title": "개발 소식",
   "color": "#0e1116",
   "isAd": false,
   "mine": true,
   "following": false,
   "visibility": "public",
   "mark": null,
   "vistas": [
    {
     "id": "lantern-2-0",
     "title": "lantern 2.0 공개",
     "durationMs": 12000,
     "src": "vistas/lantern-2-0.html",
     "poster": "posters/lantern-2-0.png"
    },
    {
     "id": "lantern-2-1",
     "title": "lantern 2.1, 검색과 밤 화면을 다듬었습니다",
     "durationMs": 12000,
     "src": "vistas/lantern-2-1.html",
     "poster": "posters/lantern-2-1.png"
    }
   ],
   "tags": [
    "news"
   ],
   "fresh": true
  },
  {
   "id": "city",
   "title": "맨시티",
   "color": "#0c1420",
   "isAd": false,
   "mine": false,
   "following": true,
   "visibility": "public",
   "mark": null,
   "vistas": [
    {
     "id": "city-fixtures",
     "title": "맨시티 리그 일정, 11월 21일 풀럼전부터",
     "durationMs": 12000,
     "src": "vistas/city-fixtures.html",
     "poster": "posters/city-fixtures.png"
    }
   ],
   "tags": [
    "news"
   ],
   "fresh": false
  },
  {
   "id": "bts",
   "title": "BTS 소식",
   "color": "#121016",
   "isAd": false,
   "mine": false,
   "following": true,
   "visibility": "public",
   "mark": null,
   "vistas": [
    {
     "id": "bts-1111",
     "title": "BTS 소식 · 11월 11일",
     "durationMs": 12000,
     "src": "vistas/bts-1111.html",
     "poster": "posters/bts-1111.png"
    }
   ],
   "tags": [
    "news"
   ],
   "fresh": false
  },
  {
   "id": "goods",
   "title": "오늘의 물건",
   "color": "#1a1410",
   "isAd": true,
   "mine": false,
   "following": true,
   "visibility": "public",
   "mark": null,
   "vistas": [
    {
     "id": "sol-mug",
     "title": "솔 머그",
     "durationMs": 12000,
     "src": "vistas/sol-mug.html",
     "poster": "posters/sol-mug.png"
    }
   ],
   "tags": [
    "goods"
   ],
   "fresh": false
  },
  {
   "id": "things",
   "title": "사물",
   "color": "#15130f",
   "isAd": false,
   "mine": false,
   "following": true,
   "visibility": "public",
   "mark": null,
   "vistas": [
    {
     "id": "small-box",
     "title": "작은 상자",
     "durationMs": 12000,
     "src": "vistas/small-box.html",
     "poster": "posters/small-box.png"
    }
   ],
   "tags": [
    "play"
   ],
   "fresh": false
  },
  {
   "id": "try",
   "title": "해 보기",
   "color": "#101418",
   "isAd": false,
   "mine": false,
   "following": true,
   "visibility": "public",
   "mark": null,
   "vistas": [
    {
     "id": "three-in-a-row",
     "title": "세 줄 잇기",
     "durationMs": 12000,
     "src": "vistas/three-in-a-row.html",
     "poster": "posters/three-in-a-row.png"
    }
   ],
   "tags": [
    "play"
   ],
   "fresh": false
  },
  {
   "id": "night",
   "title": "밤하늘",
   "color": "#0b0d14",
   "isAd": false,
   "mine": false,
   "following": true,
   "visibility": "public",
   "mark": null,
   "vistas": [
    {
     "id": "moon-phase",
     "title": "달의 위상",
     "durationMs": 12000,
     "src": "vistas/moon-phase.html",
     "poster": "posters/moon-phase.png"
    },
    {
     "id": "lunar-eclipse",
     "title": "월식",
     "durationMs": 12000,
     "src": "vistas/lunar-eclipse.html",
     "poster": "posters/lunar-eclipse.png"
    }
   ],
   "tags": [
    "sky"
   ],
   "fresh": true
  },
  {
   "id": "sky",
   "title": "하늘",
   "color": "#14100a",
   "isAd": false,
   "mine": false,
   "following": false,
   "visibility": "public",
   "mark": null,
   "vistas": [
    {
     "id": "solar-eclipse",
     "title": "일식",
     "durationMs": 12000,
     "src": "vistas/solar-eclipse.html",
     "poster": "posters/solar-eclipse.png"
    }
   ],
   "tags": [
    "sky"
   ],
   "fresh": false
  }
 ],
 "discover": {
  "chips": [
   {
    "id": "all",
    "title": "전체"
   },
   {
    "id": "news",
    "title": "소식"
   },
   {
    "id": "play",
    "title": "만지기"
   },
   {
    "id": "sky",
    "title": "하늘"
   },
   {
    "id": "goods",
    "title": "물건"
   }
  ],
  "shelves": [
   {
    "id": "jump",
    "shape": "grid"
   },
   {
    "id": "featured",
    "shape": "hero",
    "camp": "sky"
   },
   {
    "id": "new",
    "shape": "poster",
    "title": "새로 올라온 편",
    "items": [
     [
      "dev",
      "lantern-2-1"
     ],
     [
      "night",
      "lunar-eclipse"
     ],
     [
      "city",
      "city-fixtures"
     ],
     [
      "bts",
      "bts-1111"
     ],
     [
      "goods",
      "sol-mug"
     ]
    ]
   },
   {
    "id": "camps",
    "shape": "disk",
    "title": "캠프",
    "camps": [
     "sky",
     "night",
     "things",
     "try",
     "city",
     "bts",
     "goods",
     "dev"
    ]
   },
   {
    "id": "play",
    "shape": "poster",
    "title": "만지는 편",
    "items": [
     [
      "things",
      "small-box"
     ],
     [
      "try",
      "three-in-a-row"
     ]
    ]
   },
   {
    "id": "sky",
    "shape": "poster",
    "title": "하늘",
    "items": [
     [
      "night",
      "moon-phase"
     ],
     [
      "night",
      "lunar-eclipse"
     ],
     [
      "sky",
      "solar-eclipse"
     ]
    ]
   }
  ]
 }
};
