// Mock data for ActionQueue and EventFeed tests.

// ─── Action cards ─────────────────────────────────────────────────────────────
// 5 cards: all 4 action_types, all 3 time_sensitivity values
// Confidence values deliberately out of order to verify sort
export const actionCards5 = [
  {
    id:               "ac-1",
    action_type:      "reposition",
    resource_id:      "crew-7",
    zone_id:          "z3",
    confidence:       0.55,   // 3rd after sort
    rationale:        "Crew 7 is in a high-exposure zone. Move to staging area B within 6 minutes.",
    time_sensitivity: "high",
    created_at:       "2024-01-15T10:00:00.000Z",
  },
  {
    id:               "ac-2",
    action_type:      "seismic_alert",
    resource_id:      "hospital-1",
    zone_id:          "z1",
    confidence:       0.91,   // 1st after sort
    rationale:        "M4.2 detected 3.2 km from LA General. Activate surge protocol.",
    time_sensitivity: "high",
    created_at:       "2024-01-15T10:01:00.000Z",
  },
  {
    id:               "ac-3",
    action_type:      "ember_dispatch",
    resource_id:      "crew-3",
    zone_id:          "z5",
    confidence:       0.73,   // 3rd after sort
    rationale:        "Ember probability exceeds 80% NE of sector 5. Pre-position Crew 3.",
    time_sensitivity: "medium",
    created_at:       "2024-01-15T10:02:00.000Z",
  },
  {
    id:               "ac-4",
    action_type:      "evacuate",
    resource_id:      "zone-b",
    zone_id:          "z2",
    confidence:       0.88,   // 2nd after sort
    rationale:        "Fire spread model shows 74% probability of reaching Zone B within 45 min.",
    time_sensitivity: "high",
    created_at:       "2024-01-15T10:03:00.000Z",
  },
  {
    id:               "ac-5",
    action_type:      "reposition",
    resource_id:      "crew-5",
    zone_id:          "z4",
    confidence:       0.62,   // 4th after sort
    rationale:        "Crew 5 is underutilized. Reposition to reinforce eastern perimeter.",
    time_sensitivity: "low",
    created_at:       "2024-01-15T10:04:00.000Z",
  },
];

// Expected sort order DESC: ac-2(0.91), ac-4(0.88), ac-3(0.73), ac-5(0.62), ac-1(0.55)
export const sortedIds = ["ac-2", "ac-4", "ac-3", "ac-5", "ac-1"];

// ─── Event log entries (15) ───────────────────────────────────────────────────
// All 4 categories, varied timestamps (ISO strings for reliable sort)
export const eventLog15 = [
  { id: "ev-01", timestamp: "2024-01-15T10:30:00.000Z", category: "fire",    description: "Fire hotspot detected NE San Jose — FRP 420 MW" },
  { id: "ev-02", timestamp: "2024-01-15T10:28:00.000Z", category: "seismic", description: "M3.1 tremor recorded at depth 8 km near epicenter" },
  { id: "ev-03", timestamp: "2024-01-15T10:26:00.000Z", category: "crew",    description: "Crew 3 repositioned to sector 7B" },
  { id: "ev-04", timestamp: "2024-01-15T10:24:00.000Z", category: "system",  description: "Open-Meteo wind update — 14 km/h SW" },
  { id: "ev-05", timestamp: "2024-01-15T10:22:00.000Z", category: "fire",    description: "Fire perimeter expanded 0.8 km northeast" },
  { id: "ev-06", timestamp: "2024-01-15T10:20:00.000Z", category: "seismic", description: "Ground deformation detected in zone 2 — 12 mm" },
  { id: "ev-07", timestamp: "2024-01-15T10:18:00.000Z", category: "crew",    description: "Crew 7 status changed to deployed" },
  { id: "ev-08", timestamp: "2024-01-15T10:16:00.000Z", category: "system",  description: "Pipeline sync successful — all 3 feeds active" },
  { id: "ev-09", timestamp: "2024-01-15T10:14:00.000Z", category: "fire",    description: "Ember risk grid updated — 3 cells exceeded 80% threshold" },
  { id: "ev-10", timestamp: "2024-01-15T10:12:00.000Z", category: "seismic", description: "Aftershock M2.4 detected — no structural damage reported" },
  { id: "ev-11", timestamp: "2024-01-15T10:10:00.000Z", category: "crew",    description: "Crew 5 ETA to sector 4 updated — 8 minutes" },
  { id: "ev-12", timestamp: "2024-01-15T10:08:00.000Z", category: "system",  description: "AI model retrained on latest fire spread data" },
  { id: "ev-13", timestamp: "2024-01-15T10:06:00.000Z", category: "fire",    description: "Shelter A approaching capacity — 87 of 100 occupied" },
  { id: "ev-14", timestamp: "2024-01-15T10:04:00.000Z", category: "crew",    description: "Crew 1 cleared sector 3 — all personnel evacuated" },
  { id: "ev-15", timestamp: "2024-01-15T10:02:00.000Z", category: "system",  description: "Coordinator notified of pending evacuation order" },
];

// Entries in reverse order (oldest first) to verify component sorts correctly
export const eventLog15Shuffled = [...eventLog15].reverse();

// ─── 101-entry log to test the 100-entry cap ──────────────────────────────────
export const eventLog101 = Array.from({ length: 101 }, (_, i) => ({
  id:          `bulk-${i}`,
  // Stagger timestamps so sort is deterministic
  timestamp:   new Date(Date.now() - i * 60_000).toISOString(),
  category:    ["fire", "seismic", "crew", "system"][i % 4],
  description: `Bulk event ${101 - i}`,
}));
