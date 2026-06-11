export function WorldCupRulesPage() {
  return (
    <section className="world-cup-page">
      <div className="page-heading">
        <p className="eyebrow">Rules</p>
        <h1>活动规则</h1>
        <p>World Cup Prediction Challenge 是金币娱乐竞猜活动，不是交易平台、博彩平台或预测市场。</p>
      </div>

      <div className="rules-grid">
        <article className="leaderboard-panel">
          <h2>允许</h2>
          <p>使用平台金币参与世界杯娱乐竞猜。</p>
          <p>正确预测后获得平台金币奖励。</p>
          <p>查看排行榜、历史记录和收益记录。</p>
        </article>
        <article className="leaderboard-panel">
          <h2>禁止</h2>
          <p>禁止法币下注、加密货币下注、提现和用户间交易。</p>
          <p>禁止现金奖励。金币仅用于站内娱乐和权益。</p>
          <p>AI 分析只提供数据整理，不提供下注建议。</p>
        </article>
        <article className="leaderboard-panel">
          <h2>金币规则</h2>
          <p>提交竞猜会调用 `spend_coins()` 扣除金币，并写入金币流水。</p>
          <p>结算正确会调用 `add_coins()` 发放奖励，并写入金币流水。</p>
          <p>活动结束后禁止新竞猜，排行榜和历史记录保留。</p>
        </article>
        <article className="leaderboard-panel">
          <h2>VIP 加成</h2>
          <p>VIP1：预测奖励 1.2x。</p>
          <p>VIP2：预测奖励 1.5x。</p>
          <p>VIP3：预测奖励 2x。</p>
        </article>
      </div>
    </section>
  );
}
