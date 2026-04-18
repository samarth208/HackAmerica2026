// Color interpolation for damage probability and ember intensity.
const GREEN  = "#22c55e";
const AMBER  = "#f59e0b";
const ORANGE = "#f97316";
const RED    = "#ef4444";

function hexToRgb(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}
function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
function rgbToHex(r, g, b) { return "#" + [r,g,b].map((v) => v.toString(16).padStart(2,"0")).join(""); }

// 0→1 maps green → amber → orange → red
export function damageColor(prob) {
  if (prob <= 0) return GREEN;
  if (prob >= 1) return RED;
  const stops = [[0, GREEN], [0.4, AMBER], [0.7, ORANGE], [1.0, RED]];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i], [t1, c1] = stops[i+1];
    if (prob >= t0 && prob <= t1) {
      const t = (prob - t0) / (t1 - t0);
      const [r0,g0,b0] = hexToRgb(c0), [r1,g1,b1] = hexToRgb(c1);
      return rgbToHex(lerp(r0,r1,t), lerp(g0,g1,t), lerp(b0,b1,t));
    }
  }
  return RED;
}

// 0→1 maps amber → red
export function emberColor(intensity) {
  const t = Math.max(0, Math.min(1, intensity));
  const [r0,g0,b0] = hexToRgb(AMBER), [r1,g1,b1] = hexToRgb(RED);
  return rgbToHex(lerp(r0,r1,t), lerp(g0,g1,t), lerp(b0,b1,t));
}

export default { damageColor, emberColor };
