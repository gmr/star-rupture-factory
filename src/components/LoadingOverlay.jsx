export default function LoadingOverlay({ visible, message, percent }) {
  return (
    <div className={`loading-overlay ${visible ? '' : 'hidden'}`}>
      <div className="loading-title">STAR RUPTURE</div>
      <div className="loading-sub">{message}</div>
      <div className="loading-bar-wrap">
        <div className="loading-bar" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
