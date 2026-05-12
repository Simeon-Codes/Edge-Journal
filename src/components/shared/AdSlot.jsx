import { useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useTheme } from '../../contexts/ThemeContext.jsx';

// ── Google Ad Manager config ───────────────────────────────────────────────────
// Replace these with your actual GAM network code and ad unit paths
const GAM_NETWORK_CODE = 'YOUR_NETWORK_CODE'; // e.g. 21700000000
const AD_UNITS = {
  leaderboard: {
    path: `/${GAM_NETWORK_CODE}/edge_journal_leaderboard`,
    size: [[728, 90], [320, 50]],
    id: 'div-gam-leaderboard',
    label: 'Advertisement',
    minWidth: 320,
    height: 90,
  },
  sidebar_top: {
    path: `/${GAM_NETWORK_CODE}/edge_journal_sidebar_top`,
    size: [[300, 250]],
    id: 'div-gam-sidebar-top',
    label: 'Advertisement',
    minWidth: 300,
    height: 250,
  },
  sidebar_bottom: {
    path: `/${GAM_NETWORK_CODE}/edge_journal_sidebar_bottom`,
    size: [[300, 250]],
    id: 'div-gam-sidebar-bottom',
    label: 'Advertisement',
    minWidth: 300,
    height: 250,
  },
  interstitial: {
    path: `/${GAM_NETWORK_CODE}/edge_journal_interstitial`,
    size: [[320, 480]],
    id: 'div-gam-interstitial',
    label: 'Advertisement',
    minWidth: 320,
    height: 100,
  },
};

let gptLoaded = false;
let gptLoading = false;
let gptQueue = [];

function loadGPT() {
  if (gptLoaded) return Promise.resolve();
  if (gptLoading) return new Promise(res => gptQueue.push(res));
  gptLoading = true;
  return new Promise((resolve) => {
    gptQueue.push(resolve);
    window.googletag = window.googletag || { cmd: [] };
    const script = document.createElement('script');
    script.src = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';
    script.async = true;
    script.onload = () => {
      gptLoaded = true;
      gptLoading = false;
      gptQueue.forEach(fn => fn());
      gptQueue = [];
    };
    document.head.appendChild(script);
  });
}

export default function AdSlot({ slot = 'leaderboard', className = '' }) {
  const { profile, tier } = useAuth();
  const { theme: t } = useTheme();
  const ref = useRef(null);
  const slotRef = useRef(null);

  // Don't show ads to paid subscribers who disabled them, or tier > 0 with ads disabled
  const adsEnabled = profile?.ads_enabled !== false || tier === 0;
  const config = AD_UNITS[slot];

  useEffect(() => {
    if (!adsEnabled || !config || !ref.current) return;

    // Don't load GPT in dev if network code not set
    if (GAM_NETWORK_CODE === 'YOUR_NETWORK_CODE') return;

    loadGPT().then(() => {
      window.googletag.cmd.push(() => {
        if (!slotRef.current) {
          slotRef.current = window.googletag
            .defineSlot(config.path, config.size, config.id)
            ?.addService(window.googletag.pubads());

          window.googletag.pubads().enableSingleRequest();
          window.googletag.pubads().collapseEmptyDivs();
          window.googletag.enableServices();
        }
        window.googletag.display(config.id);
      });
    });

    return () => {
      if (slotRef.current) {
        try {
          window.googletag?.cmd.push(() => {
            window.googletag.destroySlots([slotRef.current]);
            slotRef.current = null;
          });
        } catch {}
      }
    };
  }, [adsEnabled, config]);

  if (!adsEnabled || !config) return null;

  // In development / before GAM is configured — show placeholder
  const isDev = GAM_NETWORK_CODE === 'YOUR_NETWORK_CODE';

  return (
    <div
      className={className}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        maxWidth: '100%', overflow: 'hidden',
      }}
    >
      <div style={{ fontSize: 9, color: t.textDim, letterSpacing: 1, marginBottom: 2, textTransform: 'uppercase' }}>
        {config.label}
      </div>
      <div
        ref={ref}
        id={isDev ? undefined : config.id}
        style={{
          width: '100%', maxWidth: config.minWidth,
          height: isDev ? config.height : 'auto',
          minHeight: isDev ? config.height : undefined,
          background: isDev ? t.bgHover : 'transparent',
          border: isDev ? `1px dashed ${t.border}` : 'none',
          borderRadius: 8, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 11, color: t.textDim,
        }}
      >
        {isDev && `[Ad Slot: ${slot} — ${config.minWidth}×${config.height}]`}
      </div>
    </div>
  );
}

// Hook to check if ads should show
export const useAds = () => {
  const { profile, tier } = useAuth();
  return {
    showAds: profile?.ads_enabled !== false || tier === 0,
    isConfigured: GAM_NETWORK_CODE !== 'YOUR_NETWORK_CODE',
  };
};
