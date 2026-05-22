import { useEffect } from 'react';

export default function HelpDialog({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="help-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="help-dialog" onClick={(e) => e.stopPropagation()}>
        <button className="help-close" onClick={onClose} aria-label="Close">×</button>
        <h2 className="help-title">The Ultimate Star-Rupture Factory</h2>
        <p>
          Interactive production-graph explorer for the game <strong>Star Rupture</strong>.
          Given the game's items and building recipes, the project computes a full
          factory layout (building instance counts, storage-depot chains,
          fan-in/fan-out routing) and renders it as an interactive graph you can
          pan, zoom, and walk upstream from any end-tier product.
        </p>
        <p className="help-attrib">
          Data shamelessly sourced from{' '}
          <a href="https://www.starrupture-planner.com/" target="_blank" rel="noreferrer">
            starrupture-planner.com
          </a>.
        </p>
        <p className="help-attrib">
          Source at{' '}
          <a href="https://github.com/gmr/star-rupture-factory" target="_blank" rel="noreferrer">
            github.com/gmr/star-rupture-factory
          </a>.
        </p>
      </div>
    </div>
  );
}
