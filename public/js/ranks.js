// FlowMaster Rank System — R6S inspired
const RANK_TIERS = [
  // Copper  (0 – 499)
  { rank: 'Copper',   div: 'V',   min: 0,    color: '#a0522d', bg: 'rgba(160,82,45,.15)',  icon: '🟤' },
  { rank: 'Copper',   div: 'IV',  min: 100,  color: '#a0522d', bg: 'rgba(160,82,45,.15)',  icon: '🟤' },
  { rank: 'Copper',   div: 'III', min: 200,  color: '#a0522d', bg: 'rgba(160,82,45,.15)',  icon: '🟤' },
  { rank: 'Copper',   div: 'II',  min: 300,  color: '#a0522d', bg: 'rgba(160,82,45,.15)',  icon: '🟤' },
  { rank: 'Copper',   div: 'I',   min: 400,  color: '#a0522d', bg: 'rgba(160,82,45,.15)',  icon: '🟤' },
  // Bronze  (500 – 999)
  { rank: 'Bronze',   div: 'V',   min: 500,  color: '#cd7f32', bg: 'rgba(205,127,50,.15)', icon: '🥉' },
  { rank: 'Bronze',   div: 'IV',  min: 600,  color: '#cd7f32', bg: 'rgba(205,127,50,.15)', icon: '🥉' },
  { rank: 'Bronze',   div: 'III', min: 700,  color: '#cd7f32', bg: 'rgba(205,127,50,.15)', icon: '🥉' },
  { rank: 'Bronze',   div: 'II',  min: 800,  color: '#cd7f32', bg: 'rgba(205,127,50,.15)', icon: '🥉' },
  { rank: 'Bronze',   div: 'I',   min: 900,  color: '#cd7f32', bg: 'rgba(205,127,50,.15)', icon: '🥉' },
  // Silver  (1000 – 1999)
  { rank: 'Silver',   div: 'V',   min: 1000, color: '#a8a9ad', bg: 'rgba(168,169,173,.15)', icon: '🥈' },
  { rank: 'Silver',   div: 'IV',  min: 1200, color: '#a8a9ad', bg: 'rgba(168,169,173,.15)', icon: '🥈' },
  { rank: 'Silver',   div: 'III', min: 1400, color: '#a8a9ad', bg: 'rgba(168,169,173,.15)', icon: '🥈' },
  { rank: 'Silver',   div: 'II',  min: 1600, color: '#a8a9ad', bg: 'rgba(168,169,173,.15)', icon: '🥈' },
  { rank: 'Silver',   div: 'I',   min: 1800, color: '#a8a9ad', bg: 'rgba(168,169,173,.15)', icon: '🥈' },
  // Gold    (2000 – 3499)
  { rank: 'Gold',     div: 'V',   min: 2000, color: '#ffd700', bg: 'rgba(255,215,0,.15)',  icon: '🥇' },
  { rank: 'Gold',     div: 'IV',  min: 2300, color: '#ffd700', bg: 'rgba(255,215,0,.15)',  icon: '🥇' },
  { rank: 'Gold',     div: 'III', min: 2600, color: '#ffd700', bg: 'rgba(255,215,0,.15)',  icon: '🥇' },
  { rank: 'Gold',     div: 'II',  min: 2900, color: '#ffd700', bg: 'rgba(255,215,0,.15)',  icon: '🥇' },
  { rank: 'Gold',     div: 'I',   min: 3200, color: '#ffd700', bg: 'rgba(255,215,0,.15)',  icon: '🥇' },
  // Platinum (3500 – 5499)
  { rank: 'Platinum', div: 'V',   min: 3500, color: '#4fc3f7', bg: 'rgba(79,195,247,.15)', icon: '💠' },
  { rank: 'Platinum', div: 'IV',  min: 3900, color: '#4fc3f7', bg: 'rgba(79,195,247,.15)', icon: '💠' },
  { rank: 'Platinum', div: 'III', min: 4300, color: '#4fc3f7', bg: 'rgba(79,195,247,.15)', icon: '💠' },
  { rank: 'Platinum', div: 'II',  min: 4700, color: '#4fc3f7', bg: 'rgba(79,195,247,.15)', icon: '💠' },
  { rank: 'Platinum', div: 'I',   min: 5100, color: '#4fc3f7', bg: 'rgba(79,195,247,.15)', icon: '💠' },
  // Diamond (5500 – 7999)
  { rank: 'Diamond',  div: 'V',   min: 5500, color: '#b39ddb', bg: 'rgba(179,157,219,.15)', icon: '💎' },
  { rank: 'Diamond',  div: 'IV',  min: 6000, color: '#b39ddb', bg: 'rgba(179,157,219,.15)', icon: '💎' },
  { rank: 'Diamond',  div: 'III', min: 6500, color: '#b39ddb', bg: 'rgba(179,157,219,.15)', icon: '💎' },
  { rank: 'Diamond',  div: 'II',  min: 7000, color: '#b39ddb', bg: 'rgba(179,157,219,.15)', icon: '💎' },
  { rank: 'Diamond',  div: 'I',   min: 7500, color: '#b39ddb', bg: 'rgba(179,157,219,.15)', icon: '💎' },
  // Champion (8000+) — no division, like R6S
  { rank: 'Champion', div: '',    min: 8000, color: '#ff6b35', bg: 'rgba(255,107,53,.18)', icon: '👑' },
];

function getRank(points) {
  const pts = parseInt(points) || 0;
  let tier = RANK_TIERS[0];
  for (const t of RANK_TIERS) {
    if (pts >= t.min) tier = t;
  }
  return tier;
}

function getRankLabel(tier) {
  return tier.div ? `${tier.rank} ${tier.div}` : tier.rank;
}

function getNextRank(points) {
  const pts = parseInt(points) || 0;
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    if (pts >= RANK_TIERS[i].min) {
      const next = RANK_TIERS[i + 1];
      if (!next) return null;
      return { tier: next, pointsNeeded: next.min - pts };
    }
  }
  return { tier: RANK_TIERS[1], pointsNeeded: RANK_TIERS[1].min - pts };
}
