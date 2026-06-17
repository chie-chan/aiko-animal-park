export type RecipeZukanEntry = {
  index: number;
  key: string;
  title: string;
  originalTitle: string;
  category: string;
  tags: string[];
  summary: string;
  url: string;
  price: number;
  likeCount: number;
  publishAt: string;
  eyecatch: string;
  kind: "guide" | "recipe";
};

export const recipeZukanCategories = [
  "すべて",
  "無料公開",
  "お花・自然",
  "かわいい変身",
  "ファンタジー",
  "アート表現",
  "季節・世界観",
  "写真風・日常",
  "その他"
];

export const recipeZukanEntries: RecipeZukanEntry[] = [
  {
    "index": 1,
    "key": "n088b5dec33b4",
    "title": "うちのこAIスタジオ｜初めての方へ",
    "originalTitle": "うちのこAIスタジオ｜初めての方へ",
    "category": "無料公開",
    "tags": [
      "無料公開",
      "水彩",
      "ハート",
      "グッズ化"
    ],
    "summary": "1. ご挨拶（Concept） ここは、「うちの子」をアートにする小さなスタジオです。 はじめまして。「AIうちのこデザインスタジオ」へようこそ！ 「うちのこAIスタジオ」を運営している、あいこです。 ここでは、あなたの愛犬・愛猫のお写?",
    "url": "https://note.com/aiko_animal/n/n088b5dec33b4",
    "price": 0,
    "likeCount": 4,
    "publishAt": "2026-01-05T17:06:03+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/241602319/rectangle_large_type_2_78bdf8f85041cfeb1d14703a22682088.png?fit=bounds&quality=85&width=1280",
    "kind": "guide"
  },
  {
    "index": 2,
    "key": "n943523fd9fe0",
    "title": "写真1枚で、愛猫・愛犬の写真から\"あみぐるみ\"を作る魔法のレシピ",
    "originalTitle": "【コピペOK】写真1枚で、愛猫・愛犬の写真から\"あみぐるみ\"を作る魔法のレシピ",
    "category": "無料公開",
    "tags": [
      "無料公開",
      "刺繍",
      "あみぐるみ",
      "グッズ化"
    ],
    "summary": "今回はうちの子が可愛くあみぐるみになるプロンプトをお届け🌸",
    "url": "https://note.com/aiko_animal/n/n943523fd9fe0",
    "price": 0,
    "likeCount": 0,
    "publishAt": "2026-04-07T20:36:53+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/265625936/rectangle_large_type_2_d2089f5effa07c76f3195782d4990a6c.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 3,
    "key": "nd027c2f71465",
    "title": "うちの子着せ替えサロン、可愛く七変化",
    "originalTitle": "【魔法のレシピ】うちの子着せ替えサロン、可愛く七変化",
    "category": "かわいい変身",
    "tags": [
      "メンバー限定",
      "貴婦人",
      "グッズ化"
    ],
    "summary": "今回はうちの子が可愛くドレスアップできるプロンプトをお届け🌸",
    "url": "https://note.com/aiko_animal/n/nd027c2f71465",
    "price": 500,
    "likeCount": 2,
    "publishAt": "2026-04-07T09:30:32+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/265478903/rectangle_large_type_2_cb480c9b8fd0fedcd8cc9e5124be95aa.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 4,
    "key": "n1767aae5ad21",
    "title": "お花、スイーツで彩るうちのこ刺繍プロンプト",
    "originalTitle": "【魔法のレシピ】お花、スイーツで彩るうちのこ刺繍プロンプト",
    "category": "お花・自然",
    "tags": [
      "メンバー限定",
      "刺繍",
      "お花",
      "スイーツ",
      "リース",
      "グッズ化"
    ],
    "summary": "お花、スイーツで彩るうちのこ刺繍プロンプトの作例とレシピをまとめたnote記事です。",
    "url": "https://note.com/aiko_animal/n/n1767aae5ad21",
    "price": 500,
    "likeCount": 3,
    "publishAt": "2026-04-07T08:34:22+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/265471183/rectangle_large_type_2_508ffb2899cf372efe45e4dd3bbce1b2.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 5,
    "key": "n5ed66d482f59",
    "title": "花のリースで作る、うちの子のステンドグラス風デザイン",
    "originalTitle": "【魔法のレシピ】花のリースで作る、うちの子のステンドグラス風デザイン",
    "category": "お花・自然",
    "tags": [
      "メンバー限定",
      "水彩",
      "ステンドグラス",
      "リース",
      "グッズ化"
    ],
    "summary": "今回は 白背景に咲く、うちの子のステンドグラスのプロンプトをお届け🌸",
    "url": "https://note.com/aiko_animal/n/n5ed66d482f59",
    "price": 500,
    "likeCount": 2,
    "publishAt": "2026-04-07T04:11:08+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/265443937/rectangle_large_type_2_09c6cc506d20f8bcc5899fb7e83883c3.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 6,
    "key": "n28197e7cfab9",
    "title": "マクロレンズで覗く、葉の上の小さな妖精の世界",
    "originalTitle": "【魔法のレシピ】マクロレンズで覗く、葉の上の小さな妖精の世界",
    "category": "ファンタジー",
    "tags": [
      "メンバー限定",
      "マクロ",
      "妖精",
      "グッズ化"
    ],
    "summary": "今回は 花びらの上のコサージュ、朝露のきらめき、 たわむ葉っぱのリアルな重力感―― まるで本当にお庭に妖精がいるような一枚が作れます🌸",
    "url": "https://note.com/aiko_animal/n/n28197e7cfab9",
    "price": 500,
    "likeCount": 3,
    "publishAt": "2026-04-07T03:08:33+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/265439086/rectangle_large_type_2_3f4e8c35903c9a8b68ee887e6ce830bd.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 7,
    "key": "n30804238c47d",
    "title": "ガラスの中の小さな世界！スノードームプロンプト集",
    "originalTitle": "【魔法のレシピ】ガラスの中の小さな世界！スノードームプロンプト集",
    "category": "ファンタジー",
    "tags": [
      "メンバー限定",
      "スノードーム",
      "グッズ化"
    ],
    "summary": "今回は「うちの子スノードーム」ガラスの中にうちの子を閉じ込めた、ミニチュアジオラマ風のプロンプトを紹介します。",
    "url": "https://note.com/aiko_animal/n/n30804238c47d",
    "price": 500,
    "likeCount": 1,
    "publishAt": "2026-04-07T01:47:07+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/265416840/rectangle_large_type_2_cc15c3d32caec8a9e4d40434dc41d543.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 8,
    "key": "n685363d49a8c",
    "title": "シルクスクリーン風ペットアート！ポップアートプロンプト集",
    "originalTitle": "【魔法のレシピ】シルクスクリーン風ペットアート！ポップアートプロンプト集",
    "category": "アート表現",
    "tags": [
      "メンバー限定",
      "ポップ",
      "グッズ化"
    ],
    "summary": "今回は「うちの子、アートになる。」シルクスクリーン風のプロンプトを紹介します。今回はchatGPTで作るのがおすすめだよ",
    "url": "https://note.com/aiko_animal/n/n685363d49a8c",
    "price": 500,
    "likeCount": 0,
    "publishAt": "2026-04-06T22:51:05+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/265395772/rectangle_large_type_2_8b78aba4c89ac9f12d1f92ebc168f394.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 9,
    "key": "na32b81f61be1",
    "title": "うちのことボタニカル。フローラルポートレート ― 春",
    "originalTitle": "【魔法のレシピ】うちのことボタニカル。フローラルポートレート ― 春",
    "category": "お花・自然",
    "tags": [
      "メンバー限定",
      "桜",
      "グッズ化"
    ],
    "summary": "今回は シネマティックな光で撮る春の花フォトリアルポートレート うちの子を同一個体固定 で、桜・菜の花・ネモフィラ・チューリップ・藤の5シーンを\"花と光を変えるだけで量産できる\"フローラルポートレート ― 春のプロンプトをまとめました。",
    "url": "https://note.com/aiko_animal/n/na32b81f61be1",
    "price": 500,
    "likeCount": 0,
    "publishAt": "2026-04-06T20:17:06+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/265345155/rectangle_large_type_2_d5da42e9dac37208e435fd70ef1a67ce.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 10,
    "key": "n63356e954d80",
    "title": "うちの子とお酒。お洒落なバーで、大人スタイル",
    "originalTitle": "【魔法のレシピ】うちの子とお酒。お洒落なバーで、大人スタイル",
    "category": "かわいい変身",
    "tags": [
      "メンバー限定",
      "グッズ化"
    ],
    "summary": "今回はちょっぴり大人なお酒をテーマに作ってみました",
    "url": "https://note.com/aiko_animal/n/n63356e954d80",
    "price": 500,
    "likeCount": 0,
    "publishAt": "2026-04-06T08:17:21+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/265184868/rectangle_large_type_2_b724f4fe3f4ef9edb5333cf76665818d.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 11,
    "key": "n3f411e333706",
    "title": "うちの子のヴィンテージな休日50's ダイアリー",
    "originalTitle": "【魔法のレシピ】うちの子のヴィンテージな休日50's ダイアリー",
    "category": "かわいい変身",
    "tags": [
      "メンバー限定",
      "水彩",
      "ポップ",
      "ヴィンテージ",
      "写真風",
      "グッズ化"
    ],
    "summary": "今回はレトロなアメリカンスタイルのプロンプトをご用意しました",
    "url": "https://note.com/aiko_animal/n/n3f411e333706",
    "price": 500,
    "likeCount": 0,
    "publishAt": "2026-04-06T05:43:32+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/265179137/rectangle_large_type_2_8b5f7931037f81f1247c1047aba00ec2.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 12,
    "key": "nb903093b0d23",
    "title": "きみのかたちに、世界が咲くうちの子ダブルエクスポージャー",
    "originalTitle": "【魔法のレシピ】きみのかたちに、世界が咲くうちの子ダブルエクスポージャー",
    "category": "アート表現",
    "tags": [
      "メンバー限定",
      "グッズ化"
    ],
    "summary": "今回は「シルエットの中に美しい世界が広がる」おしゃれなプロンプトを紹介します。今回はchatGPTで作るのがおすすめだよ",
    "url": "https://note.com/aiko_animal/n/nb903093b0d23",
    "price": 500,
    "likeCount": 1,
    "publishAt": "2026-04-06T04:52:58+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/265176490/rectangle_large_type_2_6995403624e515b6c5aa1eab138f19b5.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 13,
    "key": "n697493dd9567",
    "title": "深夜の犯行現場。うちの子監視カメラ",
    "originalTitle": "【魔法のレシピ】深夜の犯行現場。うちの子監視カメラ ",
    "category": "写真風・日常",
    "tags": [
      "メンバー限定",
      "グッズ化"
    ],
    "summary": "今回は容疑者はモフモフ！？遊び心あふれるプロンプトです",
    "url": "https://note.com/aiko_animal/n/n697493dd9567",
    "price": 500,
    "likeCount": 0,
    "publishAt": "2026-04-06T04:24:31+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/265174980/rectangle_large_type_2_7b7f9cfddf0d9a32fbd60b6887a17219.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 14,
    "key": "nac57ff0d4a33",
    "title": "うちのこハッピーイースター2026！パステル柄たまご",
    "originalTitle": "【魔法のレシピ】うちのこハッピーイースター2026！パステル柄たまご",
    "category": "ファンタジー",
    "tags": [
      "メンバー限定",
      "イースター",
      "グッズ化"
    ],
    "summary": "今回は パステル柄のイースターエッグ（ドット＋ストライプ中心） うちの子を同一個体固定 で、スタジオ写真みたいに“きれいに量産できる”イースターテーマのプロンプトをまとめました。",
    "url": "https://note.com/aiko_animal/n/nac57ff0d4a33",
    "price": 500,
    "likeCount": 1,
    "publishAt": "2026-04-05T17:54:23+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/265024121/rectangle_large_type_2_c48ed0457f7cbbdc1f128eeac727ba04.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 15,
    "key": "nf0bdff3705fe",
    "title": "うちの子、主役。花をまとう。【魔法のレシピ】うちの子ので作る花冠で可愛く変身",
    "originalTitle": "うちの子、主役。花をまとう。【魔法のレシピ】うちの子ので作る花冠で可愛く変身",
    "category": "お花・自然",
    "tags": [
      "メンバー限定",
      "花冠",
      "桜",
      "グッズ化"
    ],
    "summary": "こんにちは！今回はうちの子×花冠デザインです 似合わないわけがない・・・！約束された可愛さができるのでぜひ作ってみてくださいねฅ^•ω•^ฅ",
    "url": "https://note.com/aiko_animal/n/nf0bdff3705fe",
    "price": 500,
    "likeCount": 14,
    "publishAt": "2026-03-19T20:16:32+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/260410965/rectangle_large_type_2_4ade3505a7a13645b8dbb31931666bf9.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 16,
    "key": "ne6348caa6561",
    "title": "うちの子ので作る花冠で可愛くフラワーフォト",
    "originalTitle": "【魔法のレシピ】うちの子ので作る花冠で可愛くフラワーフォト",
    "category": "お花・自然",
    "tags": [
      "メンバー限定",
      "花冠",
      "グッズ化"
    ],
    "summary": "Nanobananaで作成 複数匹も可愛いよฅ^•ω•^ฅ 「ふわっふわの白チュールの中で、花冠を付けたうちのこが見上げてくる」 この“ブライダルっぽい可愛さ”は、何回作っても飽きません…！ 今回は 白チュール背景 （ホワイト〜アイボリ?",
    "url": "https://note.com/aiko_animal/n/ne6348caa6561",
    "price": 500,
    "likeCount": 8,
    "publishAt": "2026-02-28T09:00:58+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/255219073/rectangle_large_type_2_59d056d1a53de820b97a7ff61c33532f.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 17,
    "key": "ne83ddca7b58e",
    "title": "自転車にのったうちの子と花かご　水彩風",
    "originalTitle": "【魔法のレシピ】自転車にのったうちの子と花かご　水彩風",
    "category": "お花・自然",
    "tags": [
      "メンバー限定",
      "水彩",
      "グッズ化"
    ],
    "summary": "自転車にのったうちの子と花かご　水彩風の作例とレシピをまとめたnote記事です。",
    "url": "https://note.com/aiko_animal/n/ne83ddca7b58e",
    "price": 500,
    "likeCount": 3,
    "publishAt": "2026-02-22T00:29:01+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/253567798/rectangle_large_type_2_9a67405e5f4530ab3e0baa7071221ccb.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 18,
    "key": "n0a60e8b1c3f5",
    "title": "ネオンスプラッシュでスタイリッシュなうちのこ",
    "originalTitle": "【魔法のレシピ】ネオンスプラッシュでスタイリッシュなうちのこ",
    "category": "かわいい変身",
    "tags": [
      "メンバー限定",
      "グッズ化"
    ],
    "summary": "ネオンスプラッシュでスタイリッシュなうちのこの作例とレシピをまとめたnote記事です。",
    "url": "https://note.com/aiko_animal/n/n0a60e8b1c3f5",
    "price": 500,
    "likeCount": 3,
    "publishAt": "2026-02-21T23:03:51+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/253541493/rectangle_large_type_2_e8c5c31ec5538f9abb6b788b498d7b73.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 19,
    "key": "n36cf39ea4175",
    "title": "バレンタインのハート穴から覗くうちの子",
    "originalTitle": "【魔法のレシピ】バレンタインのハート穴から覗くうちの子",
    "category": "アート表現",
    "tags": [
      "メンバー限定",
      "ハート",
      "バレンタイン",
      "グッズ化"
    ],
    "summary": "「バレンタインっぽい、可愛い“9分割グリッド”を作りたい！」 そんな時に使える、 コピペで完成 の魔法のレシピを用意しました。 バリエーションでこんなのもつくれるよ。 ２匹バージョン。 カラフルなハート紙バージョン。",
    "url": "https://note.com/aiko_animal/n/n36cf39ea4175",
    "price": 500,
    "likeCount": 4,
    "publishAt": "2026-02-14T20:55:19+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/251722672/rectangle_large_type_2_2bec82b522614b6df10d555fff527fb6.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 20,
    "key": "ne3ea3d3b62d1",
    "title": "おやすみスパ時間｜フェイスパックでうちのこ美容Day",
    "originalTitle": "【魔法のレシピ】おやすみスパ時間｜フェイスパックでうちのこ美容Day",
    "category": "写真風・日常",
    "tags": [
      "メンバー限定",
      "グッズ化"
    ],
    "summary": "こんにちは、あいこです！ このプロンプトを使うと、どんなことができるの？ということでプロンプトで作った画像たちはこんな感じ。",
    "url": "https://note.com/aiko_animal/n/ne3ea3d3b62d1",
    "price": 500,
    "likeCount": 2,
    "publishAt": "2026-02-13T15:11:24+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/251391188/rectangle_large_type_2_724b2c5a5ea3b4510cc0c184192360d1.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 21,
    "key": "n7999bdbdf0bd",
    "title": "うちのこが「ふわもこハチ」になっちゃう！ぬいぐるみ級の可愛さを10秒で作る",
    "originalTitle": "【魔法のレシピ】うちのこが「ふわもこハチ」になっちゃう！ぬいぐるみ級の可愛さを10秒で作る",
    "category": "かわいい変身",
    "tags": [
      "メンバー限定",
      "ぬいぐるみ",
      "グッズ化"
    ],
    "summary": "こんにちは、あいこです！ このプロンプトを使うと、どんなことができるの？ということでプロンプトで作った画像たちはこんな感じ。",
    "url": "https://note.com/aiko_animal/n/n7999bdbdf0bd",
    "price": 500,
    "likeCount": 1,
    "publishAt": "2026-02-13T04:36:43+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/251295678/rectangle_large_type_2_efeaa12f6545fa52e39eb297f06b3055.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 22,
    "key": "n429a865428db",
    "title": "うちのこ×ベビースタイでより可愛く。うちのこの新しい魅力、発見しませんか？",
    "originalTitle": "【コピペでOK】うちのこ×ベビースタイでより可愛く。うちのこの新しい魅力、発見しませんか？",
    "category": "かわいい変身",
    "tags": [
      "メンバー限定",
      "水彩",
      "刺繍",
      "グッズ化"
    ],
    "summary": "こんにちは、あいこです！ このプロンプトを使うと、どんなことができるの？ということでプロンプトで作った画像たちはこんな感じ。",
    "url": "https://note.com/aiko_animal/n/n429a865428db",
    "price": 500,
    "likeCount": 4,
    "publishAt": "2026-01-19T04:29:35+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/244920360/rectangle_large_type_2_15281902865044ab1cbc989b5a0d7041.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 23,
    "key": "n9c723ce019c5",
    "title": "お家から世界中どこへでも。最新AIで「うちのこ」の最高にオシャレな旅写真集を作ってみませんか？",
    "originalTitle": "【コピペでOK】お家から世界中どこへでも。最新AIで「うちのこ」の最高にオシャレな旅写真集を作ってみませんか？",
    "category": "かわいい変身",
    "tags": [
      "メンバー限定",
      "旅",
      "グッズ化"
    ],
    "summary": "こんにちは、あいこです！ このプロンプトを使うと、どんなことができるの？ということでプロンプトで作った画像たちはこんな感じ。",
    "url": "https://note.com/aiko_animal/n/n9c723ce019c5",
    "price": 500,
    "likeCount": 1,
    "publishAt": "2026-01-17T05:42:40+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/244377982/rectangle_large_type_2_4fc5ef4c2f1ebc86f98f77aa7f54d1e6.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 24,
    "key": "n7c6371890c37",
    "title": "うちのこがフォトジェニックな写真に🌸うちの子・桜ポートレート｜AI画像生成プロンプト",
    "originalTitle": "【コピペでOK】うちのこがフォトジェニックな写真に🌸うちの子・桜ポートレート｜AI画像生成プロンプト",
    "category": "お花・自然",
    "tags": [
      "メンバー限定",
      "桜",
      "グッズ化"
    ],
    "summary": "こんにちは、あいこです！ このプロンプトを使うと、どんなことができるの？ まずは、この漫画を見てください👇",
    "url": "https://note.com/aiko_animal/n/n7c6371890c37",
    "price": 500,
    "likeCount": 1,
    "publishAt": "2026-01-14T19:21:32+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/243821315/rectangle_large_type_2_ae6fbcee54d2e4c5543d3fe44f828c25.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 25,
    "key": "n8f475e56982d",
    "title": "うちの子が主役のおしゃれディスプレイ｜AI画像生成プロンプト",
    "originalTitle": "【コピペでOK】うちの子が主役のおしゃれディスプレイ｜AI画像生成プロンプト",
    "category": "写真風・日常",
    "tags": [
      "メンバー限定",
      "グッズ化"
    ],
    "summary": "こんにちは、あいこです！ このプロンプトを使うと、どんなことができるの？ まずは、この漫画を見てください👇",
    "url": "https://note.com/aiko_animal/n/n8f475e56982d",
    "price": 500,
    "likeCount": 0,
    "publishAt": "2026-01-13T05:52:43+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/243444350/rectangle_large_type_2_52becd467b7f6028553f2cca3300c26c.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 26,
    "key": "n935727eb4fe4",
    "title": "うちのこ×成人式×コラージュ写真",
    "originalTitle": "【コピペでOK】うちのこ×成人式×コラージュ写真",
    "category": "無料公開",
    "tags": [
      "無料公開",
      "成人式",
      "グッズ化"
    ],
    "summary": "こんにちは、「うちのこAIスタジオ」のあいこです！ このプロンプトを使うとうちのこで可愛い成人式のコラージュ写真が作れますฅ^•ω•^ฅ",
    "url": "https://note.com/aiko_animal/n/n935727eb4fe4",
    "price": 0,
    "likeCount": 3,
    "publishAt": "2026-01-12T17:16:37+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/243311808/rectangle_large_type_2_e4cd45c82754e4c4665542aada85f2ad.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 27,
    "key": "nf1984ccda696",
    "title": "うちのこ×スイートバルーン｜甘く可愛いパーティーポートレート✨",
    "originalTitle": "【コピペでOK】うちのこ×スイートバルーン｜甘く可愛いパーティーポートレート✨",
    "category": "かわいい変身",
    "tags": [
      "メンバー限定",
      "グッズ化"
    ],
    "summary": "こんにちは、あいこです！ このプロンプトを使うと、どんなことができるの？ まずは、この漫画を見てください👇",
    "url": "https://note.com/aiko_animal/n/nf1984ccda696",
    "price": 500,
    "likeCount": 3,
    "publishAt": "2026-01-11T19:14:23+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/243036745/rectangle_large_type_2_82b56ac67f0b187000c61f9e48e25614.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 28,
    "key": "nb0e8a31568ee",
    "title": "うちのこ×チェック柄ライトアート｜5色展開のモダンポートレート✨",
    "originalTitle": "【コピペでOK】うちのこ×チェック柄ライトアート｜5色展開のモダンポートレート✨",
    "category": "その他",
    "tags": [
      "メンバー限定",
      "グッズ化"
    ],
    "summary": "こんにちは、あいこです！ このプロンプトを使うと、どんなことができるの？ まずは、この漫画を見てください👇",
    "url": "https://note.com/aiko_animal/n/nb0e8a31568ee",
    "price": 500,
    "likeCount": 2,
    "publishAt": "2026-01-10T17:34:43+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/242793553/rectangle_large_type_2_83fcbe42f52396b696fb14afd58fac2a.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 29,
    "key": "nd5ca0b3f78b9",
    "title": "愛猫・愛犬が音楽家に変身✨エレガント・シルエットアート＋6バリエーション",
    "originalTitle": "【コピペでOK】愛猫・愛犬が音楽家に変身✨エレガント・シルエットアート＋6バリエーション",
    "category": "アート表現",
    "tags": [
      "メンバー限定",
      "グッズ化"
    ],
    "summary": "こんにちは〜！「うちのこAIスタジオ」のあいこです🐾 「うちの子を、もっとアーティスティックに表現したい…」 「モノクロでおしゃれな作品を作りたい！」そんな時は、この \"うちのこ音楽シルエットアート\" がおすすめ！ 実は、ペットだけじゃ?",
    "url": "https://note.com/aiko_animal/n/nd5ca0b3f78b9",
    "price": 500,
    "likeCount": 1,
    "publishAt": "2026-01-09T16:35:55+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/243936460/rectangle_large_type_2_b69fb3c60db34dd2d22fbd668908cb93.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 30,
    "key": "n857fc434deb8",
    "title": "うちのこがスイーツ職人に大変身🎂白いボンネットで夢かわスイーツタイム✨",
    "originalTitle": "【コピペでOK】うちのこがスイーツ職人に大変身🎂白いボンネットで夢かわスイーツタイム✨",
    "category": "かわいい変身",
    "tags": [
      "メンバー限定",
      "スイーツ",
      "グッズ化"
    ],
    "summary": "こんにちは〜！「うちのこAIスタジオ」のあいこです🐾 「うちの子の、いつもとは違う可愛い表情が見てみたい…」 「記念日やお祝いにぴったりの特別な画像を作りたい！」そんな時は、この\"うちのこスイーツ職人アート\"がおすすめ！ 白いレースのボ?",
    "url": "https://note.com/aiko_animal/n/n857fc434deb8",
    "price": 500,
    "likeCount": 1,
    "publishAt": "2026-01-08T02:37:05+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/242177051/rectangle_large_type_2_f1d9a75d1e90e72f28ac04afafe76047.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 31,
    "key": "ne0a184036a64",
    "title": "愛猫・愛犬が可愛く雪跡に。白銀の魔法🎨＋バリエーション1種",
    "originalTitle": "【コピペでOK】愛猫・愛犬が可愛く雪跡に。白銀の魔法🎨＋バリエーション1種",
    "category": "その他",
    "tags": [
      "メンバー限定",
      "冬",
      "ハート",
      "グッズ化"
    ],
    "summary": "制作事例chatGPT こんにちは〜！「うちのこAIスタジオ」のあいこです🐾 「うちの子の、いつもとは違う可愛い表情が見てみたい…」 「SNS映えする画像を作りたい！」そんな時は、この “うちのこ雪跡アート” がおすすめ！ 一面に広がる?",
    "url": "https://note.com/aiko_animal/n/ne0a184036a64",
    "price": 500,
    "likeCount": 2,
    "publishAt": "2026-01-06T21:01:28+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/241871116/rectangle_large_type_2_c2e46cb10e3cb4cbd86aa65aad7f800b.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 32,
    "key": "n618c41bf1606",
    "title": "愛猫・愛犬が神話の世界へ。白馬とリボンで紡ぐ「幻想的ポートレート」の魔法🎨＋バリエーション3種",
    "originalTitle": "【コピペでOK】愛猫・愛犬が神話の世界へ。白馬とリボンで紡ぐ「幻想的ポートレート」の魔法🎨＋バリエーション3種",
    "category": "ファンタジー",
    "tags": [
      "メンバー限定",
      "ファンタジー",
      "グッズ化"
    ],
    "summary": "こんにちは〜！「うちのこAIスタジオ」のあいこです🐾 「うちの子の、いつもとは違う神秘的な表情が見てみたい…」 「まるで映画のポスターや、ハイファッション誌のような一枚を作ってみたい」 そんな時は、この “白馬とリボンの幻想ポートレート?",
    "url": "https://note.com/aiko_animal/n/n618c41bf1606",
    "price": 500,
    "likeCount": 1,
    "publishAt": "2026-01-06T09:02:23+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/241728144/rectangle_large_type_2_98d6b81cdbff875abc3839b26f35b822.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 33,
    "key": "n14720507b16d",
    "title": "うちの子が画面から飛び出す！？「紙破りポップアート」の作り方🎨＋バリエーション3種",
    "originalTitle": "【コピペで完成】うちの子が画面から飛び出す！？「紙破りポップアート」の作り方🎨＋バリエーション3種",
    "category": "アート表現",
    "tags": [
      "メンバー限定",
      "ポップ",
      "紙破り",
      "グッズ化"
    ],
    "summary": "こんにちは〜！「うちのこAIスタジオ」のあいこです🐾 「うちの子の、もっと元気で弾けるような表情が見たい！」 「ステッカーやTシャツにしても映える、インパクトのあるデザインが欲しい！」 そんな時は、この “飛び出しポップアート” がおす?",
    "url": "https://note.com/aiko_animal/n/n14720507b16d",
    "price": 500,
    "likeCount": 0,
    "publishAt": "2026-01-05T22:04:36+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/241644470/rectangle_large_type_2_5abd856fa42c445f80a0ac9efe01e8e7.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 34,
    "key": "ndc38e82503c2",
    "title": "ノスタルジック水彩で、うちのこ｜ “静かな夕暮れ”を1枚で＋バリエーション4種",
    "originalTitle": "【魔法のレシピ】夕日と水彩で、うちのこ｜ “静かな夕暮れ”を1枚で＋バリエーション4種",
    "category": "写真風・日常",
    "tags": [
      "メンバー限定",
      "水彩",
      "ノスタルジック",
      "グッズ化"
    ],
    "summary": "こんにちは〜！「うちのこAIスタジオ」のあいこです🐾 「うちの子が、夕暮れの風景の中に静かに溶け込んでる。 街も、自然も、海も消えないまま——ただ夕方が降りてくる。」 そんな “詩みたいな水彩” 、作ってみたくないですか？ 実はこれ、 ?",
    "url": "https://note.com/aiko_animal/n/ndc38e82503c2",
    "price": 500,
    "likeCount": 2,
    "publishAt": "2026-01-05T07:07:03+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/241467367/rectangle_large_type_2_19743ab0039dffdfb9ca441710be4051.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 35,
    "key": "n92df4fb2f3ad",
    "title": "冬の室内フォトで、うちのこ｜ふわっと暖かい“玉ボケ”写真を1枚で＋バリエーション2種",
    "originalTitle": "【魔法のレシピ】冬の室内フォトで、うちのこ｜ふわっと暖かい“玉ボケ”写真を1枚で＋バリエーション2種",
    "category": "写真風・日常",
    "tags": [
      "メンバー限定",
      "冬",
      "グッズ化"
    ],
    "summary": "こんにちは〜！「うちのこAIスタジオ」のあいこです🐾 「うちの子が、冬のあたたかいお部屋で…ふわふわブランケットに包まれて、きらきら光に囲まれてる」 そんな “冬の室内フォト” 、欲しくないですか？ 制作事例ChatGPT 実はこれ、 ?",
    "url": "https://note.com/aiko_animal/n/n92df4fb2f3ad",
    "price": 500,
    "likeCount": 0,
    "publishAt": "2026-01-05T05:49:57+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/241463048/rectangle_large_type_2_0e43a0fa849e2b4eb19164f1ead2c0da.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 36,
    "key": "n2b66198bd07a",
    "title": "光る雪だるまと、うちのこ｜冬の夜の“夢見フォト”を1枚で＋バリエーション3種",
    "originalTitle": "【魔法のレシピ】光る雪だるまと、うちのこ｜冬の夜の“夢見フォト”を1枚で＋バリエーション3種",
    "category": "ファンタジー",
    "tags": [
      "メンバー限定",
      "冬",
      "グッズ化"
    ],
    "summary": "こんにちは〜！「うちのこAIスタジオ」のあいこです🐾 「うちの子が、冬の森の夜に…やわらかく光る雪だるまを見つめてる」 そんな あたたかくて夢みたいな写真 、欲しくないですか？ 実はこれ、 スマホ写真1枚 があればOK。 コピー＆ペース?",
    "url": "https://note.com/aiko_animal/n/n2b66198bd07a",
    "price": 500,
    "likeCount": 0,
    "publishAt": "2026-01-05T04:20:37+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/241457632/rectangle_large_type_2_1818158814f782b1514fd38e1277dd2f.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 37,
    "key": "nc65d181789ba",
    "title": "クリスタルガラスのキラキラ輝く、うちのこお花屋さん＋１種",
    "originalTitle": "【魔法のレシピ】クリスタルガラスのキラキラ輝く、うちのこお花屋さん＋１種",
    "category": "お花・自然",
    "tags": [
      "メンバー限定",
      "お花",
      "冬",
      "グッズ化"
    ],
    "summary": "① 画像を作るための準備 こんにちは～！「うちのこAIスタジオ」のあいこです🐾 「うちの子が、キラキラ輝くクリスタルガラスのお花屋さんで、宝石のように美しく輝いてる…そんな幻想的な写真が欲しい！」 実は、手持ちのスマホ写真1枚 さえあれ?",
    "url": "https://note.com/aiko_animal/n/nc65d181789ba",
    "price": 500,
    "likeCount": 1,
    "publishAt": "2026-01-05T02:10:09+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/241449609/rectangle_large_type_2_1461372b8b286f1e2258d91614c8f843.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 38,
    "key": "n6165f9950011",
    "title": "愛のハートフレーム❤手で包む、うちのこペット写真",
    "originalTitle": "【魔法のレシピ】愛のハートフレーム❤手で包む、うちのこペット写真",
    "category": "その他",
    "tags": [
      "メンバー限定",
      "ハート",
      "グッズ化"
    ],
    "summary": "制作事例Nanobanana ① 画像を作るための準備 こんにちは～！「うちのこAIスタジオ」のあいこです🐾 「うちの子が、手のハートの中に収まってる…そんな可愛い写真が欲しい！」 実は、手持ちのスマホ写真1枚 さえあれば、愛情いっぱい?",
    "url": "https://note.com/aiko_animal/n/n6165f9950011",
    "price": 500,
    "likeCount": 2,
    "publishAt": "2026-01-05T00:00:22+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/241455080/rectangle_large_type_2_902b469ade81b88dacd2e4135bc670db.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 39,
    "key": "nbb2204d79572",
    "title": "ペット写真を9枚グリット写真に変換！着物×伝統装飾で年賀状にも使える魔法のプロンプト",
    "originalTitle": "【魔法のレシピ】ペット写真を9枚グリット写真に変換！着物×伝統装飾で年賀状にも使える魔法のプロンプト",
    "category": "アート表現",
    "tags": [
      "メンバー限定",
      "着物",
      "年賀状",
      "羽子板",
      "グッズ化"
    ],
    "summary": "① 画像を作るための準備 こんばんは～！「うちのこAIスタジオ」のあいこです🐾 「うちの子が着物を着て、お正月の伝統装飾と一緒に写ってる…そんな可愛い写真が欲しい！」 実は、手持ちのスマホ写真1枚 さえあれば、9パターンの和風ポートレー?",
    "url": "https://note.com/aiko_animal/n/nbb2204d79572",
    "price": 500,
    "likeCount": 1,
    "publishAt": "2026-01-04T22:51:20+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/241394436/rectangle_large_type_2_91d3daf51e4ec4fa8f6477273dc3e598.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 40,
    "key": "nc8b064195e8a",
    "title": "パッチワーク」うちの子がキルト衣装を着てかわいく変身!？初心者でも10秒で作れる",
    "originalTitle": "【魔法のレシピ】「パッチワーク」うちの子がキルト衣装を着てかわいく変身!？初心者でも10秒で作れる",
    "category": "かわいい変身",
    "tags": [
      "メンバー限定",
      "グッズ化"
    ],
    "summary": "制作事例（Nanobanana） 制作事例（ChatGPT） ① 画像を作るための準備 「うちの子を、温かみのある手作りアートの世界に登場させたい･･･！」 そんな夢、実は スマホの写真1枚 あればスタートできます。 【用意するもの】 ?",
    "url": "https://note.com/aiko_animal/n/nc8b064195e8a",
    "price": 500,
    "likeCount": 0,
    "publishAt": "2026-01-04T19:05:42+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/241361738/rectangle_large_type_2_0e9027197d24fa2ebb07927a5917425c.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 41,
    "key": "n5dbec25556e5",
    "title": "東欧レトロ新年ポストカード」うちの子が絵本の主人公にかわいく変身!？初心者でも10秒で作れるプロンプト",
    "originalTitle": "【魔法のレシピ】「東欧レトロ新年ポストカード」うちの子が絵本の主人公にかわいく変身!？初心者でも10秒で作れるプロンプト",
    "category": "かわいい変身",
    "tags": [
      "メンバー限定",
      "冬",
      "ファンタジー",
      "グッズ化"
    ],
    "summary": "① 画像を作るための準備 こんばんは～！「うちのこAIスタジオ」のあいこです🐾 「うちの子を絵本の主人公のようなとっておきの一枚に変身させてみたい･･･！」 そんな夢、実は スマホの写真1枚 あれば作成できます。 【用意するもの】 Ch?",
    "url": "https://note.com/aiko_animal/n/n5dbec25556e5",
    "price": 500,
    "likeCount": 1,
    "publishAt": "2026-01-02T00:48:02+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/240670025/rectangle_large_type_2_d5d77fe7b776fe6e089c8dbc4b82c0d7.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 42,
    "key": "nba7f138eb571",
    "title": "羽子板」うちの子がお正月の羽子板にかわいく変身!？初心者でも10秒で作れる",
    "originalTitle": "【魔法のレシピ】「羽子板」うちの子がお正月の羽子板にかわいく変身!？初心者でも10秒で作れる",
    "category": "お花・自然",
    "tags": [
      "メンバー限定",
      "桜",
      "羽子板",
      "グッズ化"
    ],
    "summary": "① 画像を作るための準備 「うちの子をお正月らしく変身させてみたい･･･！」 そんな夢、実は スマホの写真1枚 あればスタートできます。 【用意するもの】 ChatGPT、GeminiなどのAIアプリ: 画像が作れるプラン（DALL-E?",
    "url": "https://note.com/aiko_animal/n/nba7f138eb571",
    "price": 500,
    "likeCount": 1,
    "publishAt": "2026-01-01T20:23:06+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/240598486/rectangle_large_type_2_b1a56fb2e2b651e8fd3093cfcc6f5c94.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  },
  {
    "index": 43,
    "key": "n4435d844a0a3",
    "title": "洋風・絵画」うちの子が貴婦人に変身!？初心者でも10秒で作れる",
    "originalTitle": "【魔法のレシピ】「洋風・絵画」うちの子が貴婦人に変身!？初心者でも10秒で作れる",
    "category": "かわいい変身",
    "tags": [
      "メンバー限定",
      "貴婦人",
      "グッズ化"
    ],
    "summary": "① 画像を作るための準備 「AIでうちの子を可愛くしてみたいけど、難しそう…」と思っていませんか？ 実は、スマホに1枚「お気に入りの写真」があれば、準備は完了です。 【用意するもの】 ChatGPT、GeminiなどのAIアプリ: 画像?",
    "url": "https://note.com/aiko_animal/n/n4435d844a0a3",
    "price": 500,
    "likeCount": 0,
    "publishAt": "2025-11-17T19:23:42+09:00",
    "eyecatch": "https://assets.st-note.com/production/uploads/images/240581465/rectangle_large_type_2_07b5f84a43dd05c1c743e553f95e0a4a.png?fit=bounds&quality=85&width=1280",
    "kind": "recipe"
  }
];
