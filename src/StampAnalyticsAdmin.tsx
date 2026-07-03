import "./stamp-analytics-admin.css";

export default function StampAnalyticsAdmin() {
  return (
    <main className="stamp-admin-page">
      <section className="stamp-admin-head">
        <div>
          <p className="stamp-admin-kicker">STAMP TOOL ANALYTICS</p>
          <h1>Stamp Analytics moved to Local HQ</h1>
          <p>
            The Cloudflare admin endpoint no longer scans Workers KV. Open the local dashboard from the
            operations PC instead.
          </p>
        </div>
        <a
          className="stamp-admin-local-link"
          href="http://127.0.0.1:17776/stamp-analytics.html"
          rel="noreferrer"
        >
          Open Local HQ
        </a>
      </section>
    </main>
  );
}
