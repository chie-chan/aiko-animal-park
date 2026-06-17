import { type FormEvent, type ReactNode, useState } from "react";

const ACCESS_STORAGE_KEY = "aiko-animal:stamp-v2:access";
const ACCESS_STORAGE_VALUE = "stamp-v2-2026-05";
const PASSWORD_HASH = "2c6716a0f9d92475f7988d4919e05f599564eeb68267e9e72badf1b053aa27ca";

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

type StampV2PasswordGateProps = {
  children: ReactNode;
};

export default function StampV2PasswordGate({ children }: StampV2PasswordGateProps) {
  const [isUnlocked, setIsUnlocked] = useState(() => {
    try {
      return window.localStorage.getItem(ACCESS_STORAGE_KEY) === ACCESS_STORAGE_VALUE;
    } catch {
      return false;
    }
  });
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedPassword = password.trim();

    if (!normalizedPassword) {
      setError("パスワードを入力してください。");
      return;
    }

    setIsChecking(true);
    setError("");

    try {
      const hash = await sha256Hex(normalizedPassword);

      if (hash !== PASSWORD_HASH) {
        setError("パスワードが違います。もう一度お試しください。");
        return;
      }

      window.localStorage.setItem(ACCESS_STORAGE_KEY, ACCESS_STORAGE_VALUE);
      setIsUnlocked(true);
      setPassword("");
    } catch {
      setError("このブラウザでは確認できませんでした。別のブラウザでお試しください。");
    } finally {
      setIsChecking(false);
    }
  }

  if (isUnlocked) {
    return <>{children}</>;
  }

  return (
    <main className="stamp-password-page">
      <section className="stamp-password-card" aria-labelledby="stamp-password-title">
        <p className="stamp-password-kicker">UCHINOKO STAMP STUDIO</p>
        <h1 id="stamp-password-title">うちのこスタンプ工房</h1>
        <p>
          無料モニター用のページです。
          ご案内したパスワードを入れてください。
        </p>
        <p className="stamp-password-note">
          このツールはPCでの操作をおすすめしています。スマホでは表示やZIP保存がうまくいかない場合があります。
        </p>

        <form className="stamp-password-form" onSubmit={handleSubmit}>
          <label htmlFor="stamp-v2-password">パスワード</label>
          <input
            id="stamp-v2-password"
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
          />
          {error ? <p className="stamp-password-error">{error}</p> : null}
          <button type="submit" disabled={isChecking}>
            {isChecking ? "確認中..." : "スタンプメーカーを開く"}
          </button>
        </form>
      </section>
    </main>
  );
}
