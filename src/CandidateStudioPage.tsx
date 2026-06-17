type Candidate = {
  id: string;
  trend: string;
  title: string;
  hook: string;
  imagePrompt: string;
  postIdea: string;
  colors: string[];
};

const candidates: Candidate[] = [
  {
    id: "C-001",
    trend: "水族館の癒しニュース",
    title: "水族館で眠るうちの子",
    hook: "今日いちばん癒された顔、うちの子で作るならこれ。",
    imagePrompt:
      "透明感のある水族館の淡い青い光の中、うちの子がふわっと眠そうに寄り添っている癒し系ポートレート。やさしいボケ、丸い光、静かな表情、SNSで止まって見たくなる余白。",
    postIdea:
      "「仕事終わりに見たい、うちの子の癒し顔」から始める。商品説明より先に、見た人の疲れが少し抜ける感情を置く。",
    colors: ["#9ed9f2", "#f6fbff"],
  },
  {
    id: "C-002",
    trend: "甘えん坊な小鳥の話題",
    title: "眠そうに甘えるうちの子",
    hook: "なんでもない甘え顔が、いちばん宝物かもしれない。",
    imagePrompt:
      "やわらかい朝の光、白いブランケットの上で眠そうに甘えるうちの子。少し首をかしげる、近くに来てほしそうな目、淡いクリーム色とピンクの空気感。写真の毛色と顔立ちは保つ。",
    postIdea:
      "『いつもの顔なのに、なぜか泣きそうになる瞬間』として投稿。共感コメントを誘いやすい。",
    colors: ["#f7c9d8", "#fff8ed"],
  },
  {
    id: "C-003",
    trend: "無事保護・見つかったニュース",
    title: "おかえりヒーロー",
    hook: "帰ってきてくれた、それだけで今日は記念日。",
    imagePrompt:
      "夕方の玄関先、あたたかいライトに照らされたうちの子が小さなヒーローのように帰ってきたシーン。リボンや小さな星、安心感のある表情、ドラマチックすぎず家族の温度が伝わる。",
    postIdea:
      "『おかえり』の気持ちを軸に。迷子や不安を煽らず、無事に会えた安堵の感情に寄せる。",
    colors: ["#f6b36d", "#fff3df"],
  },
  {
    id: "C-004",
    trend: "ラブストーリー系トレンド",
    title: "うちの子ラブストーリー",
    hook: "恋愛ドラマより、うちの子の見つめる顔に弱い。",
    imagePrompt:
      "淡い花びらが舞う春の窓辺で、うちの子がこちらを見つめるロマンチックなポートレート。映画のワンシーンのような自然光、薄いピンク、きらめき、上品で甘すぎない雰囲気。",
    postIdea:
      "『恋愛ドラマの主人公みたいなうちの子』で投稿。推し活・記念日・プレゼント文脈にもつなげやすい。",
    colors: ["#f09abf", "#fff4f8"],
  },
  {
    id: "C-005",
    trend: "ゲームセンター・勝利ポーズ",
    title: "勝利のうちの子",
    hook: "今日の勝者、うちの子。",
    imagePrompt:
      "レトロなゲームセンターのネオン光を背景に、うちの子が小さく勝利ポーズをしているポップな一枚。カラフルなライト、元気な表情、コミカルな星や紙吹雪、顔と毛色は写真に忠実。",
    postIdea:
      "『今日の勝者はこの顔』として短く投稿。コメントで『うちの子なら何に勝った顔？』と聞ける。",
    colors: ["#8a7cf2", "#fff05f"],
  },
];

function copyText(text: string) {
  void navigator.clipboard?.writeText(text);
}

export default function CandidateStudioPage() {
  return (
    <main className="candidate-page">
      <section className="candidate-hero">
        <p className="candidate-kicker">SNS PROMPT CANDIDATES</p>
        <h1>今日のうちの子プロンプト候補</h1>
        <p>
          スレッズ・Xのトレンドから、うちの子アートに寄せやすい切り口を5案にしています。
          伸ばす投稿は「説明」より先に、見た人の気持ちが動く入口から作ります。
        </p>
      </section>

      <section className="candidate-grid" aria-label="今日の候補">
        {candidates.map((candidate) => (
          <article className="candidate-card" key={candidate.id}>
            <div
              className="candidate-thumb"
              style={{
                background: `linear-gradient(135deg, ${candidate.colors[0]}, ${candidate.colors[1]})`,
              }}
            >
              <span>{candidate.id}</span>
              <strong>{candidate.title}</strong>
            </div>
            <div className="candidate-body">
              <p className="candidate-trend">{candidate.trend}</p>
              <h2>{candidate.title}</h2>
              <p className="candidate-hook">{candidate.hook}</p>

              <div className="candidate-box">
                <b>画像プロンプト</b>
                <p>{candidate.imagePrompt}</p>
                <button type="button" onClick={() => copyText(candidate.imagePrompt)}>
                  プロンプトをコピー
                </button>
              </div>

              <div className="candidate-box candidate-box-soft">
                <b>投稿の入口</b>
                <p>{candidate.postIdea}</p>
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
