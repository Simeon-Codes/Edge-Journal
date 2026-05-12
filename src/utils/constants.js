export const PAIRS = [
  'EURUSD','GBPUSD','USDJPY','USDCHF','AUDUSD','NZDUSD','USDCAD',
  'EURGBP','EURJPY','GBPJPY','AUDJPY','CADJPY','EURAUD','EURNZD',
  'XAUUSD','XAGUSD',
  'US30','NAS100','SP500','UK100','GER40','JP225',
  'BTCUSD','ETHUSD','SOLUSD','XRPUSD',
  'USOIL','UKOIL',
];

export const SESSIONS = [
  'Asian','London','NY','London/NY Overlap','Pre-Market','After-Hours',
];

export const SETUPS = [
  'OTE','Order Block','Fair Value Gap','Breaker Block',
  'SMT Divergence','Liquidity Sweep','NWOG/NDOG','Judas Swing',
  'Power of 3 (AMD)','Mitigation Block','Propulsion Block',
  'Rejection Block','Volume Imbalance','CISD','Other',
];

export const EMOTIONS = [
  'Calm','Confident','Focused','Neutral',
  'Anxious','FOMO','Revenge','Greedy','Fearful','Overconfident',
];

export const GRADES = ['A+','A','B','C','D','F'];

export const TAGS = [
  'OB','FVG','MSS','BOS','CHoCH','SMT','AMD',
  'PDA','SIBI','BISI','Liquidity','News','HTF Confluent',
  'LTF Entry','Killzone','PO3','Breaker','Sweep','CISD','Propulsion',
];

export const GRADE_COLORS = {
  'A+':'#00e5a0','A':'#4adeaa','B':'#facc15',
  'C':'#fb923c','D':'#f87171','F':'#ff4d6d',
};

export const SESSION_COLORS = {
  'Asian':'#818cf8','London':'#00e5a0','NY':'#facc15',
  'London/NY Overlap':'#fb923c','Pre-Market':'#8a8fa8','After-Hours':'#8a8fa8',
};

export const ICT_PLAYBOOK = [
  {
    id:'ote', name:'OTE Retracement', category:'Entry Model', color:'#00e5a0', tag:'High Probability',
    concept:'Optimal Trade Entry — the 62–79% Fibonacci retracement zone used to enter after a displacement impulse. Represents the point where smart money accumulates before continuing the HTF move.',
    confluences:['HTF bias aligned','Inside a killzone','MSS on LTF','FVG or OB in OTE zone','DXY divergence confirms'],
    entry:['Identify Daily/4H bias first','Wait for displacement/impulse move','Draw Fib from swing low→high (bull) or high→low (bear)','Enter at 62–79% zone','Confirm with M5/M15 MSS inside the zone'],
    sl:'Below the swing low (long) / Above swing high (short) — beyond 100% level',
    tp:'Previous high/low, -0.5 to -1.0 Fib extension, or opposing HTF PDA array',
    notes:'Highest probability during London Open (02:00–05:00 EST) and NY Open (07:00–10:00 EST). Avoid news within 15 minutes.',
  },
  {
    id:'ob', name:'Order Block', category:'PD Array', color:'#facc15', tag:'Smart Money',
    concept:'The last opposing candle before a strong displacement. Represents where institutional orders were placed, causing the subsequent imbalance. Price returns to this zone to pair off remaining orders.',
    confluences:['HTF OB respected first','FVG nested within OB','Volume spike on displacement','Clean swing point','Killzone timing'],
    entry:['Identify strong impulsive displacement','Mark last DOWN candle before bullish move (Bull OB)','Or last UP candle before bearish (Bear OB)','Wait for return to OB','Enter at 50% of OB body or at the open'],
    sl:'Wick below entire OB candle (bull) / Wick above OB candle (bear)',
    tp:'Opposing OB, FVG, or HTF liquidity pools',
    notes:'Refined OBs with nested FVGs are highest quality. OB must have caused a BOS or CHoCH to be valid.',
  },
  {
    id:'fvg', name:'Fair Value Gap', category:'PD Array', color:'#818cf8', tag:'Core Concept',
    concept:'A 3-candle imbalance where a displacement candle moves so fast it leaves a gap. Price frequently returns to fill this inefficiency before continuing the original direction.',
    confluences:['In direction of HTF bias','At or near a killzone','Nested within HTF FVG','SMT divergence present','Below/above a liquidity pool'],
    entry:['Identify the 3-candle pattern on M1–M15','Mark gap: candle 1 high to candle 3 low (bull FVG)','Or candle 1 low to candle 3 high (bear FVG)','Enter at 50% of the FVG (equilibrium)','Use LTF FVG/OB inside for precision'],
    sl:'Below/above the entire FVG — if price closes through it, FVG is violated',
    tp:'Opposing FVG, OB, or liquidity level',
    notes:'Nested FVGs on lower TFs within HTF FVGs are the highest probability entries. 50% entry is optimal.',
  },
  {
    id:'smt', name:'SMT Divergence', category:'Confirmation', color:'#fb923c', tag:'Advanced',
    concept:'Smart Money Technique — when two positively correlated instruments fail to confirm each other\'s swing highs or lows. Signals institutional manipulation and an imminent reversal.',
    confluences:['At a HTF PDA array','One pair sweeps, other doesn\'t','In a killzone','Correlated pairs diverge same candle','Volume spike on the sweep'],
    entry:['Open correlated pairs side by side','Wait for one pair to sweep a high/low','Confirm the other pair DID NOT confirm','Enter in direction of non-confirming pair\'s reversal','Use LTF MSS as trigger'],
    sl:'Beyond the sweep candle that created the divergence',
    tp:'HTF PDA array in direction of reversal',
    notes:'Most powerful at major liquidity pools during NY Open. DXY/Gold SMT is particularly reliable for Gold trades.',
  },
  {
    id:'breaker', name:'Breaker Block', category:'PD Array', color:'#f87171', tag:'Reversal',
    concept:'A failed Order Block that has been violated. After a swing high/low is broken, the OB associated with that swing becomes a Breaker — price returns to this zone for continuation.',
    confluences:['Previous OB that got broken','BOS/CHoCH confirmed','HTF alignment','In a killzone','FVG inside the Breaker'],
    entry:['Identify OB that caused previous swing high/low','Wait for price to break THROUGH that OB','Mark breaker zone (same area as old OB)','Wait for price to retrace into breaker','Enter with LTF confirmation'],
    sl:'Beyond the breaker zone — back into the old OB area',
    tp:'Previous high/low or next HTF PDA array',
    notes:'Breakers confirm the market structure shift. Only valid after a confirmed BOS. Old resistance becomes new support.',
  },
];
