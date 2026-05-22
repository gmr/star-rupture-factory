export default function StatsBar({ visibleNodes, visibleEdges, total }) {
  return (
    <div className="stats-bar">
      <div>NODES <span>{visibleNodes.toLocaleString()}</span></div>
      <div>EDGES <span>{visibleEdges.toLocaleString()}</span></div>
      <div>VISIBLE <span>{visibleNodes.toLocaleString()}</span></div>
      <div>TOTAL GRAPH <span>{total || '—'}</span></div>
    </div>
  );
}
