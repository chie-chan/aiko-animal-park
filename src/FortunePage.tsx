import { CSSProperties, FormEvent, useMemo, useRef, useState } from "react";
import "./fortune.css";

type FortunePhase = "idle" | "spinning" | "revealed";

type FortuneResult = {
  animalKind: string;
  displayName: string;
  luck: string;
  wheelIndex: number;
  luckyColor: string;
  luckyAnimal: string;
  luckyItem: string;
  aikoLine: string;
  tip: string;
  isHit: boolean;
  seed: number;
};

type WeatherSummary = {
  place: string;
  current: string;
  temperature: number | null;
  high: number | null;
  low: number | null;
  rainChance: number | null;
  afternoon: string;
  advice: string;
};

type AnimalCareTip = {
  label: string;
  body: string;
  note: string;
};

type KnownPlace = {
  name: string;
  aliases: string[];
  latitude: number;
  longitude: number;
};

const knownPlaces: KnownPlace[] = [
  { name: "北海道", aliases: ["札幌"], latitude: 43.0642, longitude: 141.3469 },
  { name: "青森", aliases: ["青森県"], latitude: 40.8244, longitude: 140.74 },
  { name: "岩手", aliases: ["岩手県", "盛岡"], latitude: 39.7036, longitude: 141.1525 },
  { name: "宮城", aliases: ["宮城県", "仙台"], latitude: 38.2689, longitude: 140.8719 },
  { name: "秋田", aliases: ["秋田県"], latitude: 39.7186, longitude: 140.1025 },
  { name: "山形", aliases: ["山形県"], latitude: 38.2406, longitude: 140.3633 },
  { name: "福島", aliases: ["福島県"], latitude: 37.75, longitude: 140.4678 },
  { name: "茨城", aliases: ["茨城県", "水戸"], latitude: 36.3414, longitude: 140.4467 },
  { name: "栃木", aliases: ["栃木県", "宇都宮"], latitude: 36.5658, longitude: 139.8836 },
  { name: "群馬", aliases: ["群馬県", "前橋"], latitude: 36.3911, longitude: 139.0608 },
  { name: "埼玉", aliases: ["埼玉県", "さいたま"], latitude: 35.8569, longitude: 139.6489 },
  { name: "千葉", aliases: ["千葉県"], latitude: 35.6047, longitude: 140.1233 },
  { name: "東京", aliases: ["東京都", "Tokyo"], latitude: 35.6894, longitude: 139.6917 },
  { name: "神奈川", aliases: ["神奈川県", "横浜"], latitude: 35.4478, longitude: 139.6425 },
  { name: "新潟", aliases: ["新潟県"], latitude: 37.9022, longitude: 139.0236 },
  { name: "富山", aliases: ["富山県"], latitude: 36.6953, longitude: 137.2114 },
  { name: "石川", aliases: ["石川県", "金沢"], latitude: 36.5944, longitude: 136.6256 },
  { name: "福井", aliases: ["福井県"], latitude: 36.0653, longitude: 136.2219 },
  { name: "山梨", aliases: ["山梨県", "甲府"], latitude: 35.6639, longitude: 138.5683 },
  { name: "長野", aliases: ["長野県"], latitude: 36.6514, longitude: 138.1811 },
  { name: "岐阜", aliases: ["岐阜県"], latitude: 35.3911, longitude: 136.7222 },
  { name: "静岡", aliases: ["静岡県"], latitude: 34.9769, longitude: 138.3831 },
  { name: "愛知", aliases: ["愛知県", "名古屋"], latitude: 35.1803, longitude: 136.9067 },
  { name: "三重", aliases: ["三重県", "津"], latitude: 34.7303, longitude: 136.5086 },
  { name: "滋賀", aliases: ["滋賀県", "大津"], latitude: 35.0044, longitude: 135.8683 },
  { name: "京都", aliases: ["京都府"], latitude: 35.0214, longitude: 135.7556 },
  { name: "大阪", aliases: ["大阪府"], latitude: 34.6864, longitude: 135.52 },
  { name: "兵庫", aliases: ["兵庫県", "神戸"], latitude: 34.6914, longitude: 135.1831 },
  { name: "奈良", aliases: ["奈良県"], latitude: 34.6853, longitude: 135.8328 },
  { name: "和歌山", aliases: ["和歌山県"], latitude: 34.2261, longitude: 135.1675 },
  { name: "鳥取", aliases: ["鳥取県"], latitude: 35.5036, longitude: 134.2383 },
  { name: "島根", aliases: ["島根県", "松江"], latitude: 35.4722, longitude: 133.0506 },
  { name: "岡山", aliases: ["岡山県"], latitude: 34.6617, longitude: 133.935 },
  { name: "広島", aliases: ["広島県"], latitude: 34.3964, longitude: 132.4594 },
  { name: "山口", aliases: ["山口県"], latitude: 34.1858, longitude: 131.4714 },
  { name: "徳島", aliases: ["徳島県"], latitude: 34.0658, longitude: 134.5594 },
  { name: "香川", aliases: ["香川県", "高松"], latitude: 34.3403, longitude: 134.0433 },
  { name: "愛媛", aliases: ["愛媛県", "松山"], latitude: 33.8417, longitude: 132.7661 },
  { name: "高知", aliases: ["高知県"], latitude: 33.5597, longitude: 133.5311 },
  { name: "福岡", aliases: ["福岡県"], latitude: 33.6064, longitude: 130.4181 },
  { name: "佐賀", aliases: ["佐賀県"], latitude: 33.2494, longitude: 130.2989 },
  { name: "長崎", aliases: ["長崎県"], latitude: 32.7447, longitude: 129.8736 },
  { name: "熊本", aliases: ["熊本県"], latitude: 32.7897, longitude: 130.7417 },
  { name: "大分", aliases: ["大分県"], latitude: 33.2381, longitude: 131.6125 },
  { name: "宮崎", aliases: ["宮崎県"], latitude: 31.9111, longitude: 131.4239 },
  { name: "鹿児島", aliases: ["鹿児島県"], latitude: 31.5603, longitude: 130.5581 },
  { name: "沖縄", aliases: ["沖縄県", "那覇"], latitude: 26.2125, longitude: 127.6811 },
];

const wheelSegments = ["大吉", "中吉", "吉", "小吉", "末吉", "中吉", "大吉", "吉", "小吉", "末吉", "凶", "大当たり"];
const grandHitRate = 100;
const grandHitWheelIndex = wheelSegments.indexOf("大当たり");
const normalWheelIndexes = wheelSegments.map((_, index) => index).filter((index) => index !== grandHitWheelIndex);
const colors = ["ミモザイエロー", "ローズレッド", "アンティークグリーン", "ミルクホワイト", "リボンブルー", "宝石ゴールド"];
const animals = ["しっぽを上げている子", "おすまし顔の子", "ごきげんな横顔の子", "ふわっと笑う子", "目がきらっとした子", "眠そうでかわいい子"];
const luckyItems = ["きらきら王冠", "お気に入りのおやつ", "ふわふわブランケット", "ピンクのリボン", "小さなお守り", "日なたのクッション"];
const photoTips = [
  "写真は顔まわりが明るいものを選ぶと、今日の運がきれいにのります。",
  "背景がすっきりした写真は、あいこの魔法が入りやすい日です。",
  "ちょっと横顔の写真も、今日は物語っぽく仕上がりそう。",
  "お気に入りのお名前表記をローマ字で添えると、作例にも残しやすいよ。",
  "今日の合言葉は、ゆるく楽しく。急がない子ほどかわいくなります。",
];

const weatherCodeLabels: Record<number, string> = {
  0: "晴れ",
  1: "晴れ時々くもり",
  2: "くもりがち",
  3: "くもり",
  45: "霧",
  48: "霧",
  51: "小雨",
  53: "小雨",
  55: "雨",
  56: "冷たい小雨",
  57: "冷たい雨",
  61: "弱い雨",
  63: "雨",
  65: "強い雨",
  66: "冷たい雨",
  67: "強い冷たい雨",
  71: "雪",
  73: "雪",
  75: "強い雪",
  77: "雪",
  80: "にわか雨",
  81: "にわか雨",
  82: "強いにわか雨",
  85: "にわか雪",
  86: "強いにわか雪",
  95: "雷雨",
  96: "雷雨",
  99: "強い雷雨",
};

const fanfarePieces = Array.from({ length: 74 }, (_, index) => ({
  left: `${(index * 23 + 7) % 100}%`,
  delay: `${(index % 13) * 0.035}s`,
  rotate: `${(index * 37) % 180}deg`,
  drift: `${((index % 9) - 4) * 24}px`,
}));

const aikoStickerBase = "/assets/fortune/aiko-stickers";
const aikoStickers = {
  winner: `${aikoStickerBase}/winner.png`,
  cheerFist: `${aikoStickerBase}/cheer-fist.png`,
  happyHearts: `${aikoStickerBase}/happy-hearts.png`,
  shyHeart: `${aikoStickerBase}/shy-heart.png`,
  sweetFlower: `${aikoStickerBase}/sweet-flower.png`,
  calmSmile: `${aikoStickerBase}/calm-smile.png`,
  flowerLook: `${aikoStickerBase}/flower-look.png`,
  sparkleSmile: `${aikoStickerBase}/sparkle-smile.png`,
  shySweat: `${aikoStickerBase}/shy-sweat.png`,
  musicSmile: `${aikoStickerBase}/music-smile.png`,
  question: `${aikoStickerBase}/question.png`,
  normal: `${aikoStickerBase}/normal.png`,
  softTear: `${aikoStickerBase}/soft-tear.png`,
  downcast: `${aikoStickerBase}/downcast.png`,
  thunderSurprise: `${aikoStickerBase}/thunder-surprise.png`,
  cryingRain: `${aikoStickerBase}/crying-rain.png`,
} as const;

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function pick<T>(items: T[], seed: number, shift = 0) {
  return items[(seed + shift) % items.length];
}

function getDateKey(date = new Date()) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function formatToday(date = new Date()) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

function getFortuneLabel(luck: string) {
  return luck === "凶" ? "守りの日" : luck;
}

function getLuckLine(displayName: string, luck: string) {
  const fortuneLabel = getFortuneLabel(luck);
  if (luck === "凶") {
    return `${displayName}の今日の運試し結果は、${fortuneLabel}だよ。無理せずかわいく過ごそう。`;
  }
  if (luck === "末吉") {
    return `${displayName}の今日の運試し結果は、${fortuneLabel}だよ。小さないいことを拾える日になりそう。`;
  }
  return `${displayName}の今日の運試し結果は、${fortuneLabel}だよ。小さくいいことが起きそう。`;
}

function makeFortune(petName: string, animalKind: string, place: string): FortuneResult {
  const seedBase = `${getDateKey()}|${petName}|${animalKind}|${place}`;
  const seed = hashText(seedBase);
  const isHit = hashText(`${seedBase}|grand-hit`) % grandHitRate === 0;
  const wheelIndex = isHit ? grandHitWheelIndex : normalWheelIndexes[seed % normalWheelIndexes.length];
  const luck = wheelSegments[wheelIndex];
  const luckyColor = pick(colors, seed, 3);
  const luckyAnimal = pick(animals, seed, 7);
  const luckyItem = pick(luckyItems, seed, 11);
  const tip = pick(photoTips, seed, 13);
  const displayName = petName.trim() || "うちの子";

  return {
    animalKind,
    displayName,
    wheelIndex,
    luckyColor,
    luckyAnimal,
    luckyItem,
    luck,
    tip,
    isHit,
    seed,
    aikoLine: isHit
      ? `${displayName}、大当たり。あいこイラスト引換券に選ばれました。`
      : getLuckLine(displayName, luck),
  };
}

function labelWeather(code: number | undefined) {
  if (typeof code !== "number") return "空もよう";
  return weatherCodeLabels[code] ?? "空もよう";
}

function normalizePlaceName(value: string) {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

function findKnownPlace(value: string) {
  const normalized = normalizePlaceName(value);
  return knownPlaces.find((place) =>
    [place.name, ...place.aliases].some((alias) => {
      const normalizedAlias = normalizePlaceName(alias);
      return normalized === normalizedAlias || normalized.includes(normalizedAlias);
    })
  );
}

function summarizeAfternoon(times: string[], probabilities: number[] = [], codes: number[] = []) {
  const afternoonIndexes = times
    .map((time, index) => ({ hour: Number(time.slice(11, 13)), index }))
    .filter(({ hour }) => hour >= 12 && hour <= 18)
    .map(({ index }) => index);
  const maxRain = Math.max(...afternoonIndexes.map((index) => probabilities[index] ?? 0), 0);
  const worstCode = afternoonIndexes.map((index) => codes[index] ?? 0).sort((a, b) => b - a)[0] ?? 0;

  if (maxRain >= 65 || worstCode >= 80) return "昼から崩れるかも。外で撮るなら早めがよさそう。";
  if (maxRain >= 35 || worstCode >= 51) return "午後は少し気まぐれな空。明るい窓辺が味方です。";
  if (maxRain >= 15) return "午後は雲が増えるかも。やわらかい光で撮れそう。";
  return "午後も落ち着いた空になりそう。写真日和かもしれません。";
}

async function fetchWeatherSummary(locationName: string): Promise<WeatherSummary> {
  const knownPlace = findKnownPlace(locationName);
  let place = knownPlace
    ? { name: knownPlace.name, admin1: "", latitude: knownPlace.latitude, longitude: knownPlace.longitude }
    : null;

  if (!place) {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationName)}&count=1&language=ja&format=json`;
    const geoResponse = await fetch(geoUrl);
    if (!geoResponse.ok) throw new Error("地域が見つかりませんでした。");
    const geoData = await geoResponse.json();
    place = geoData.results?.[0] ?? null;
    if (!place) throw new Error("地域が見つかりませんでした。");
  }

  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: "temperature_2m,weather_code,precipitation,cloud_cover",
    hourly: "precipitation_probability,weather_code,temperature_2m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    forecast_days: "2",
  });
  const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!weatherResponse.ok) throw new Error("天気を読めませんでした。");
  const weatherData = await weatherResponse.json();

  const currentCode = weatherData.current?.weather_code as number | undefined;
  const temperature = weatherData.current?.temperature_2m ?? null;
  const daily = weatherData.daily ?? {};
  const afternoon = summarizeAfternoon(
    weatherData.hourly?.time ?? [],
    weatherData.hourly?.precipitation_probability ?? [],
    weatherData.hourly?.weather_code ?? []
  );

  return {
    place: [place.name, place.admin1].filter(Boolean).join(" / "),
    current: labelWeather(currentCode),
    temperature,
    high: daily.temperature_2m_max?.[0] ?? null,
    low: daily.temperature_2m_min?.[0] ?? null,
    rainChance: daily.precipitation_probability_max?.[0] ?? null,
    afternoon,
    advice:
      (daily.precipitation_probability_max?.[0] ?? 0) >= 45
        ? "バッグに小さな雨対策を入れておくと安心です。"
        : "自然光の写真がかわいく撮れそうです。",
  };
}

function getAnimalCareTip(animalKind: string, weather: WeatherSummary | null, seed: number): AnimalCareTip {
  const temperature = weather?.high ?? weather?.temperature;
  const rainChance = weather?.rainChance ?? 0;
  const placeLead =
    weather && typeof temperature === "number"
      ? `${weather.place}は最高${Math.round(temperature)}度くらい。`
      : "地域を入れると、天気に合わせて豆ちしきが変わるよ。";
  const note = "あいこの豆ちしきは参考用です。いつもと違う様子がある時は、無理せず獣医さんに聞いてね。";
  const tone =
    typeof temperature === "number" && temperature >= 28
      ? "hot"
      : rainChance >= 45
        ? "rainy"
        : typeof temperature === "number" && temperature <= 10
          ? "cold"
          : "mild";

  const tipsByAnimal: Record<string, Record<string, string>> = {
    犬: {
      hot: "お散歩は朝夕の涼しい時間が安心。地面が熱い日は肉球にも負担がかかるので、日陰・短め・お水を意識してね。室内も暑い日はクーラーで涼しい逃げ場を作るのがよさそう。",
      rainy: "雨の日は足元が冷えたり汚れたりしやすい日。帰ったら肉球まわりをやさしく拭いて、湿気がこもらない場所で休ませてあげてね。",
      cold: "寒い日は急に長く外へ出るより、短めのお散歩から様子見がよさそう。帰ったらあたたかい場所でゆっくり。",
      mild: "お散歩や写真にちょうどいい日かも。歩く前に地面の熱さ、帰ってからお水、この2つだけは今日もチェックしてね。",
    },
    猫: {
      hot: "猫さんは涼しい場所を自分で選べるように、日なた以外の逃げ場と新鮮なお水を用意してね。留守番中に室温が上がりそうなら、クーラーも検討してよさそう。",
      rainy: "雨の日は窓辺が暗くなりがち。お気に入りの寝床を少し明るい場所に寄せると、のんびり気分で過ごせるかも。",
      cold: "寒い日は高い場所や窓辺が冷えやすいことも。寝床に逃げ場を作って、いつもの居場所が冷えすぎていないか見てあげてね。",
      mild: "猫さんは気温差で寝る場所を変えることがあります。今日はお気に入りの場所がどこか観察すると、かわいい発見がありそう。",
    },
    うさぎ: {
      hot: "うさぎさんは暑さが苦手。ケージに直射日光が当たらないか、室温が上がりすぎないかを見て、暑い日はクーラーで安定した涼しさを作ると安心です。",
      rainy: "湿度が高い日はケージまわりがむれやすい日。風が直接当たりすぎない範囲で、空気がこもらない場所にしてあげてね。",
      cold: "寒い日は床まわりが冷えやすいかも。寝床と水まわりを見て、いつもの動き方と違わないかそっと観察してね。",
      mild: "今日はケージまわりの温度差チェックの日。日なたと日陰、どちらにも逃げ場があると過ごしやすそう。",
    },
    鳥: {
      hot: "鳥さんは直射日光と閉め切った暑さに注意。涼しい日陰と新鮮なお水を用意して、クーラーの風が直接当たり続けない場所にしてあげてね。",
      rainy: "雨の日は湿度が上がりやすい日。ケージまわりの空気がこもらないようにしつつ、冷たい風が直接当たらない場所がよさそう。",
      cold: "寒い日は急な温度差に注意。窓際が冷えすぎないか見て、いつもの声や動きと違わないか観察してね。",
      mild: "今日は羽づくろい観察日。日なたぼっこをするなら、暑くなった時に逃げられる日陰も一緒に作ってね。",
    },
    ハムスター: {
      hot: "小さな体は暑さの影響を受けやすいです。ケージを直射日光の当たらない場所へ置いて、お水と室温をチェック。暑い日はクーラーで涼しさを保つのがよさそう。",
      rainy: "湿度が高い日は床材まわりがむれやすいかも。濡れや汚れがないか、そっと見てあげてね。",
      cold: "寒い日はケージの置き場所を確認。床や窓際が冷えすぎないように、静かで温度差の少ない場所がよさそう。",
      mild: "今日は寝床チェックの日。床材がふかふかで、お水がきれいなら、それだけで小さな安心になります。",
    },
    その他: {
      hot: "暑い日は、直射日光を避けた涼しい逃げ場と新鮮なお水が大事。室温が上がりそうならクーラーも検討してね。",
      rainy: "雨の日は湿度と冷えに注意。寝床やケージまわりがむれたり冷えたりしていないか、いつもより少しだけ見てあげてね。",
      cold: "寒い日は急な温度差に注意。いつもの居場所が冷えすぎていないか、静かに確認してね。",
      mild: "今日は観察日和。いつもの食べ方、寝る場所、動き方をゆるく見るだけでも、その子らしさが見えてきます。",
    },
  };

  const animalTips = tipsByAnimal[animalKind] ?? tipsByAnimal.その他;
  const labels: Record<string, string> = {
    hot: "暑さ対策メモ",
    rainy: "雨と湿度メモ",
    cold: "冷え対策メモ",
    mild: pick(["今日の観察メモ", "ちいさなケアメモ", "ごきげん豆ちしき"], seed, 19),
  };

  return {
    label: labels[tone],
    body: `${placeLead}${animalTips[tone]}`,
    note,
  };
}

function formatAnimalLabel(animalKind: string) {
  if (!animalKind || animalKind === "その他") return "どうぶつさん";
  return `${animalKind}さん`;
}

function getAikoStickerSrc(result: FortuneResult | null, weather: WeatherSummary | null) {
  if (!result) return aikoStickers.normal;
  if (result.isHit) return aikoStickers.winner;

  const high = weather?.high ?? weather?.temperature;
  const rainChance = weather?.rainChance ?? 0;

  if (typeof high === "number" && high >= 30) return aikoStickers.shySweat;
  if (rainChance >= 70) return aikoStickers.cryingRain;
  if (rainChance >= 45) return aikoStickers.softTear;

  switch (result.luck) {
    case "大吉":
      return aikoStickers.cheerFist;
    case "中吉":
      return aikoStickers.happyHearts;
    case "吉":
      return aikoStickers.musicSmile;
    case "小吉":
      return aikoStickers.normal;
    case "末吉":
      return aikoStickers.flowerLook;
    case "凶":
      return aikoStickers.downcast;
    default:
      return pick([aikoStickers.musicSmile, aikoStickers.flowerLook, aikoStickers.question], result.seed, 23);
  }
}

function FortuneWheel({
  phase,
  result,
  stickerSrc,
}: {
  phase: FortunePhase;
  result: FortuneResult | null;
  stickerSrc: string;
}) {
  const rotation = result ? 720 - result.wheelIndex * 30 : 0;

  return (
    <div className={`fortune-wheel-panel ${phase}`} aria-hidden="true">
      <div className="wheel-pointer" />
      <div className="fortune-wheel" style={{ "--wheel-rotation": `${rotation}deg` } as CSSProperties}>
        {wheelSegments.map((segment, index) => {
          const angle = index * 30;
          const radians = ((angle - 90) * Math.PI) / 180;
          const labelX = 50 + Math.cos(radians) * 34;
          const labelY = 50 + Math.sin(radians) * 34;

          return (
            <span
              key={`${segment}-${index}`}
              style={
                {
                  "--label-x": `${labelX}%`,
                  "--label-y": `${labelY}%`,
                  "--label-angle": `${angle}deg`,
                } as CSSProperties
              }
            >
              {segment}
            </span>
          );
        })}
      </div>
      <div className="wheel-center">
        <img src={stickerSrc} alt="" />
      </div>
      <div className="wheel-lights">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      <p>{phase === "spinning" ? "ぐるぐる中..." : "今日の運試しルーレット"}</p>
    </div>
  );
}

function PrizeFanfare({ isHit }: { isHit: boolean }) {
  return (
    <div className={`prize-fanfare ${isHit ? "is-hit" : "is-normal"}`} aria-hidden="true">
      <div className="fanfare-wash" />
      <div className="fanfare-rays" />
      <div className="fanfare-message">
        <span>{isHit ? "あいこイラスト引換券" : "気になる結果は..."}</span>
        <strong>{isHit ? "大当たり!" : "結果発表"}</strong>
      </div>
      <div className="fanfare-confetti">
        {fanfarePieces.map((piece, index) => (
          <i
            key={`${piece.left}-${index}`}
            style={
              {
                "--left": piece.left,
                "--delay": piece.delay,
                "--rotate": piece.rotate,
                "--drift": piece.drift,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}

export default function FortunePage() {
  const [petName, setPetName] = useState("");
  const [animalKind, setAnimalKind] = useState("犬");
  const [locationName, setLocationName] = useState("東京");
  const [result, setResult] = useState<FortuneResult | null>(null);
  const [weather, setWeather] = useState<WeatherSummary | null>(null);
  const [weatherError, setWeatherError] = useState("");
  const [isLoadingWeather, setIsLoadingWeather] = useState(false);
  const [phase, setPhase] = useState<FortunePhase>("idle");
  const resultRef = useRef<HTMLElement | null>(null);
  const spinTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const todayLabel = useMemo(() => formatToday(), []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (spinTimerRef.current) window.clearTimeout(spinTimerRef.current);

    const nextResult = makeFortune(petName, animalKind, locationName);
    setResult(nextResult);
    setWeather(null);
    setWeatherError("");
    setPhase("spinning");

    window.requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    spinTimerRef.current = window.setTimeout(() => {
      setPhase("revealed");
    }, 1350);

    if (!locationName.trim()) return;

    setIsLoadingWeather(true);
    try {
      const nextWeather = await fetchWeatherSummary(locationName.trim());
      setWeather(nextWeather);
    } catch (error) {
      setWeatherError(error instanceof Error ? error.message : "天気を読めませんでした。");
    } finally {
      setIsLoadingWeather(false);
    }
  }

  const buttonLabel = phase === "spinning" ? "ルーレット中..." : result ? "もう一回まわす" : "運試しをまわす";
  const careTip = result ? getAnimalCareTip(result.animalKind, weather, result.seed) : null;
  const aikoStickerSrc = getAikoStickerSrc(result, weather);

  return (
    <main className="fortune-page">
      <section className="fortune-stage" aria-labelledby="fortune-title">
        <div className="fortune-hero">
          <div className="fortune-copy">
            <p className="fortune-kicker">aiko animal PARK</p>
            <h1 id="fortune-title">運試しルーレット</h1>
            <p>
              <span>今日の運をくるっと試して、</span>
              <span>大当たりのあいこイラスト引換券をねらってみてね。</span>
            </p>
          </div>

          <div className="aiko-guide-card" aria-label="あいこの案内">
            <div className="aiko-portrait">
              <img src="/assets/fortune/aiko-portrait-front.png" alt="あいこ" />
            </div>
            <div className="aiko-bubble">
              <span>あいこ</span>
              <p>
                準備できたら、ルーレットを回してね。
                <br />
                大当たりが出たら、あいこイラスト引換券だよ。
              </p>
            </div>
          </div>
        </div>

        <div className="fortune-workbench">
          <form className="fortune-controls" onSubmit={handleSubmit}>
            <label>
              うちの子のお名前
              <input value={petName} onChange={(event) => setPetName(event.target.value)} placeholder="例：Mugi" autoComplete="off" />
            </label>

            <label>
              どうぶつ
              <select value={animalKind} onChange={(event) => setAnimalKind(event.target.value)}>
                <option>犬</option>
                <option>猫</option>
                <option>うさぎ</option>
                <option>鳥</option>
                <option>ハムスター</option>
                <option>その他</option>
              </select>
            </label>

            <label>
              あなたの地域
              <input
                list="fortune-place-options"
                value={locationName}
                onChange={(event) => setLocationName(event.target.value)}
                placeholder="例：東京、横浜、大阪"
                autoComplete="off"
              />
              <datalist id="fortune-place-options">
                {knownPlaces.map((place) => (
                  <option key={place.name} value={place.name} />
                ))}
              </datalist>
            </label>

            <p className="privacy-note">入力内容はこの画面のくじ、天気表示、豆ちしきのためだけに使います。データは保存しません。</p>

            <button className="fortune-submit" type="submit" disabled={phase === "spinning"}>
              {buttonLabel}
            </button>
          </form>

          <section ref={resultRef} className={`fortune-result-card ${phase} ${result?.isHit ? "is-hit" : ""}`} aria-live="polite">
            {phase === "revealed" && result && <PrizeFanfare isHit={result.isHit} />}
            <div className="result-stage">
              <FortuneWheel phase={phase} result={result} stickerSrc={aikoStickerSrc} />

              {phase === "idle" && (
                <div className="fortune-empty">
                  <p className="fortune-date">{todayLabel}</p>
                  <h2>今日の運試し、まだ眠っています</h2>
                  <p>ルーレットを回して、今日の結果を見てね。</p>
                </div>
              )}

              {phase === "spinning" && (
                <div className="fortune-spinning">
                  <p className="fortune-date">{todayLabel}</p>
                  <h2>あいこが今日の運を探しています</h2>
                  <p>くるくる、くるくる。もうすぐ止まります。</p>
                </div>
              )}

              {phase === "revealed" && result && (
                <div className="fortune-reveal">
                  <div className="result-top">
                    <p className="fortune-date">{todayLabel}</p>
                    <strong>{result.luck}</strong>
                  </div>

                  <div className="result-aiko-row">
                    <div className="aiko-mini">
                      <img src={aikoStickerSrc} alt="" />
                    </div>
                    <div className="result-speech">
                      <span>あいこ</span>
                      {result.isHit ? (
                        <p>
                          {result.displayName}、大当たり。
                          <br />
                          あいこイラスト引換券に選ばれました。
                          <br />
                          この画面をスクショして、募集ポストのリプにうちの子写真と一緒に貼ってね。
                        </p>
                      ) : (
                        <p>{result.aikoLine}</p>
                      )}
                    </div>
                  </div>

                  <div className="result-main">
                    <p>今日の運試し結果は</p>
                    <h2>{getFortuneLabel(result.luck)}だよ</h2>
                  </div>

                  <dl className="fortune-facts">
                    <div>
                      <dt>ラッキーどうぶつさん</dt>
                      <dd>{result.luckyAnimal}</dd>
                    </div>
                    <div>
                      <dt>ラッキーカラー</dt>
                      <dd>{result.luckyColor}</dd>
                    </div>
                    <div>
                      <dt>ラッキーアイテム</dt>
                      <dd>{result.luckyItem}</dd>
                    </div>
                  </dl>

                  {result.isHit && (
                    <div className="hit-ticket">
                      <strong>あいこイラスト引換券</strong>
                      <span>スクショ + {result.displayName}の写真1枚 + ローマ字名をリプへ</span>
                      <small>元写真と完成イラストを、SNSや商品ページの商品画像・作例として掲載OKな方限定です。</small>
                    </div>
                  )}

                  <p className="fortune-tip">{result.tip}</p>

                  {careTip && (
                    <div className="animal-care-panel">
                      <p className="animal-care-title">今日の{formatAnimalLabel(result.animalKind)}豆ちしき</p>
                      <strong>{careTip.label}</strong>
                      <p>{careTip.body}</p>
                      <small>{careTip.note}</small>
                    </div>
                  )}

                  <div className="weather-panel">
                    <p className="weather-title">今日の空</p>
                    {isLoadingWeather && <p>あいこが空を見ています。</p>}
                    {weatherError && <p>{weatherError}</p>}
                    {!isLoadingWeather && !weatherError && weather && (
                      <>
                        <strong>{weather.place}</strong>
                        <p>
                          {weather.current}
                          {typeof weather.temperature === "number" ? `、今は${Math.round(weather.temperature)}度` : ""}
                          {typeof weather.high === "number" && typeof weather.low === "number"
                            ? `。最高${Math.round(weather.high)}度 / 最低${Math.round(weather.low)}度。`
                            : "。"}
                        </p>
                        <p>{weather.afternoon}</p>
                        <p>{weather.advice}</p>
                      </>
                    )}
                    {!isLoadingWeather && !weatherError && !weather && <p>地域を入れると、今日の天気も見られます。</p>}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
