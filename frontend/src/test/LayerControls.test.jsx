// Read DESIGN.md and CLAUDE.md before modifying.
// Tests LayerControls.jsx: pill rendering, Tailwind class variants, callbacks,
// mute toggle, SIMULATE button state + API call, no hardcoded hex in DOM.

import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import LayerControls from "../components/LayerControls";

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Return all class tokens on a DOM element as an array. */
function classes(el) {
  return Array.from(el.classList);
}

/** Walk the full rendered subtree; return true if any hex literal is found. */
function containsHex(rootEl) {
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode;
  while (node) {
    const style = node.getAttribute?.("style") ?? "";
    if (/#[0-9a-fA-F]{3,6}\b/.test(style)) return true;
    node = walker.nextNode();
  }
  return false;
}

// ─── Default props ─────────────────────────────────────────────────────────
const ALL_VISIBLE = {
  firePerimeter:  true,
  emberRisk:      true,
  seismicDamage:  true,
  crews:          true,
  infrastructure: true,
};

const ALL_HIDDEN = {
  firePerimeter:  false,
  emberRisk:      false,
  seismicDamage:  false,
  crews:          false,
  infrastructure: false,
};

// ─── Setup / teardown ─────────────────────────────────────────────────────────
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Layer pills ──────────────────────────────────────────────────────────────
describe("LayerControls — layer pills", () => {
  it("renders all 5 layer pills", () => {
    render(
      <LayerControls layerVisibility={ALL_VISIBLE} onToggleLayer={() => {}} />
    );
    expect(screen.getByText("Fire Perimeter")).toBeTruthy();
    expect(screen.getByText("Ember Risk")).toBeTruthy();
    expect(screen.getByText("Seismic Damage")).toBeTruthy();
    expect(screen.getByText("Crews")).toBeTruthy();
    expect(screen.getByText("Infrastructure")).toBeTruthy();
  });

  it("active pill has bg-accent class", () => {
    render(
      <LayerControls layerVisibility={ALL_VISIBLE} onToggleLayer={() => {}} />
    );
    const pill = screen.getByText("Fire Perimeter");
    expect(classes(pill)).toContain("bg-accent");
  });

  it("active pill has border-accent class", () => {
    render(
      <LayerControls layerVisibility={ALL_VISIBLE} onToggleLayer={() => {}} />
    );
    const pill = screen.getByText("Ember Risk");
    expect(classes(pill)).toContain("border-accent");
  });

  it("inactive pill has bg-surface class", () => {
    render(
      <LayerControls layerVisibility={ALL_HIDDEN} onToggleLayer={() => {}} />
    );
    const pill = screen.getByText("Fire Perimeter");
    expect(classes(pill)).toContain("bg-surface");
  });

  it("inactive pill has border-border class", () => {
    render(
      <LayerControls layerVisibility={ALL_HIDDEN} onToggleLayer={() => {}} />
    );
    const pill = screen.getByText("Seismic Damage");
    expect(classes(pill)).toContain("border-border");
  });

  it("inactive pill has opacity-65 class", () => {
    render(
      <LayerControls layerVisibility={ALL_HIDDEN} onToggleLayer={() => {}} />
    );
    expect(classes(screen.getByText("Crews"))).toContain("opacity-65");
  });

  it("clicking Fire Perimeter pill calls onToggleLayer with 'firePerimeter'", () => {
    const onToggleLayer = vi.fn();
    render(
      <LayerControls layerVisibility={ALL_VISIBLE} onToggleLayer={onToggleLayer} />
    );
    fireEvent.click(screen.getByText("Fire Perimeter"));
    expect(onToggleLayer).toHaveBeenCalledWith("firePerimeter");
  });

  it("clicking Ember Risk pill calls onToggleLayer with 'emberRisk'", () => {
    const onToggleLayer = vi.fn();
    render(
      <LayerControls layerVisibility={ALL_VISIBLE} onToggleLayer={onToggleLayer} />
    );
    fireEvent.click(screen.getByText("Ember Risk"));
    expect(onToggleLayer).toHaveBeenCalledWith("emberRisk");
  });

  it("clicking Seismic Damage pill calls onToggleLayer with 'seismicDamage'", () => {
    const onToggleLayer = vi.fn();
    render(
      <LayerControls layerVisibility={ALL_VISIBLE} onToggleLayer={onToggleLayer} />
    );
    fireEvent.click(screen.getByText("Seismic Damage"));
    expect(onToggleLayer).toHaveBeenCalledWith("seismicDamage");
  });

  it("clicking Crews pill calls onToggleLayer with 'crews'", () => {
    const onToggleLayer = vi.fn();
    render(
      <LayerControls layerVisibility={ALL_VISIBLE} onToggleLayer={onToggleLayer} />
    );
    fireEvent.click(screen.getByText("Crews"));
    expect(onToggleLayer).toHaveBeenCalledWith("crews");
  });

  it("clicking Infrastructure pill calls onToggleLayer with 'infrastructure'", () => {
    const onToggleLayer = vi.fn();
    render(
      <LayerControls layerVisibility={ALL_VISIBLE} onToggleLayer={onToggleLayer} />
    );
    fireEvent.click(screen.getByText("Infrastructure"));
    expect(onToggleLayer).toHaveBeenCalledWith("infrastructure");
  });
});

// ─── Mute button ──────────────────────────────────────────────────────────────
describe("LayerControls — mute button", () => {
  it("shows 'Voice' text when muted=false", () => {
    render(
      <LayerControls layerVisibility={ALL_VISIBLE} muted={false} onToggleMute={() => {}} />
    );
    expect(screen.getByTestId("mute-btn").textContent).toBe("Voice");
  });

  it("shows 'Muted' text when muted=true", () => {
    render(
      <LayerControls layerVisibility={ALL_VISIBLE} muted={true} onToggleMute={() => {}} />
    );
    expect(screen.getByTestId("mute-btn").textContent).toBe("Muted");
  });

  it("mute button has text-threat-red class when muted=true", () => {
    render(
      <LayerControls layerVisibility={ALL_VISIBLE} muted={true} onToggleMute={() => {}} />
    );
    expect(classes(screen.getByTestId("mute-btn"))).toContain("text-threat-red");
  });

  it("mute button has border-threat-red class when muted=true", () => {
    render(
      <LayerControls layerVisibility={ALL_VISIBLE} muted={true} onToggleMute={() => {}} />
    );
    expect(classes(screen.getByTestId("mute-btn"))).toContain("border-threat-red");
  });

  it("mute button has text-text-muted class when muted=false", () => {
    render(
      <LayerControls layerVisibility={ALL_VISIBLE} muted={false} onToggleMute={() => {}} />
    );
    expect(classes(screen.getByTestId("mute-btn"))).toContain("text-text-muted");
  });

  it("mute button has border-border class when muted=false", () => {
    render(
      <LayerControls layerVisibility={ALL_VISIBLE} muted={false} onToggleMute={() => {}} />
    );
    expect(classes(screen.getByTestId("mute-btn"))).toContain("border-border");
  });

  it("clicking mute button calls onToggleMute", () => {
    const onToggleMute = vi.fn();
    render(
      <LayerControls layerVisibility={ALL_VISIBLE} muted={false} onToggleMute={onToggleMute} />
    );
    fireEvent.click(screen.getByTestId("mute-btn"));
    expect(onToggleMute).toHaveBeenCalledTimes(1);
  });
});

// ─── SIMULATE button ──────────────────────────────────────────────────────────
describe("LayerControls — SIMULATE button", () => {
  it("renders SIMULATE button", () => {
    render(<LayerControls layerVisibility={ALL_VISIBLE} />);
    expect(screen.getByTestId("simulate-btn")).toBeTruthy();
  });

  it("SIMULATE button has border-threat-amber class", () => {
    render(<LayerControls layerVisibility={ALL_VISIBLE} />);
    expect(classes(screen.getByTestId("simulate-btn"))).toContain("border-threat-amber");
  });

  it("SIMULATE button has text-threat-amber class", () => {
    render(<LayerControls layerVisibility={ALL_VISIBLE} />);
    expect(classes(screen.getByTestId("simulate-btn"))).toContain("text-threat-amber");
  });

  it("shows 'Simulate Crisis' initially", () => {
    render(<LayerControls layerVisibility={ALL_VISIBLE} />);
    expect(screen.getByTestId("simulate-btn").textContent).toMatch(/simulate crisis/i);
  });

  it("shows loading state during POST", async () => {
    let resolveFetch;
    global.fetch = vi.fn(
      () => new Promise((res) => { resolveFetch = res; })
    );

    render(<LayerControls layerVisibility={ALL_VISIBLE} />);
    fireEvent.click(screen.getByTestId("simulate-btn"));

    await waitFor(() =>
      expect(screen.getByTestId("simulate-btn").textContent).toMatch(/simulating/i)
    );

    // Resolve to avoid unhandled promise
    resolveFetch({ ok: true });
  });

  it("resets button text after POST resolves", async () => {
    render(<LayerControls layerVisibility={ALL_VISIBLE} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("simulate-btn"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("simulate-btn").textContent).toMatch(/simulate crisis/i)
    );
  });

  it("POSTs to /api/simulate/northridge on click", async () => {
    render(<LayerControls layerVisibility={ALL_VISIBLE} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("simulate-btn"));
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/simulate/northridge",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("does not POST again while simulating (second click ignored)", async () => {
    let resolveFetch;
    global.fetch = vi.fn(
      () => new Promise((res) => { resolveFetch = res; })
    );

    render(<LayerControls layerVisibility={ALL_VISIBLE} />);
    fireEvent.click(screen.getByTestId("simulate-btn"));
    fireEvent.click(screen.getByTestId("simulate-btn")); // second click ignored

    expect(global.fetch).toHaveBeenCalledTimes(1);
    resolveFetch({ ok: true });
  });
});

// ─── No hardcoded hex in DOM ──────────────────────────────────────────────────
describe("LayerControls — design token compliance", () => {
  it("renders no hardcoded hex color values in inline styles", () => {
    const { container } = render(
      <LayerControls
        layerVisibility={ALL_VISIBLE}
        muted={false}
        onToggleLayer={() => {}}
        onToggleMute={() => {}}
      />
    );
    expect(containsHex(container)).toBe(false);
  });
});
