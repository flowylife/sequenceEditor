import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("offline api")))
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Sequence Editor app", () => {
  it("renders the main CAD and simulation workspace", () => {
    render(<App />);

    expect(screen.getByText("Sequence Editor")).toBeInTheDocument();
    expect(screen.getByText("Component Library")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Validate/i })).toBeInTheDocument();
    expect(screen.getByText(/engineering aid only/i)).toBeInTheDocument();
  });

  it("renders an IEC sequence schematic as the default CAD view", () => {
    render(<App />);

    expect(screen.getByLabelText("IEC sequence schematic CAD view")).toBeInTheDocument();
    expect(screen.getByText(/Motor Start\/Stop Seal-in Circuit/i)).toBeInTheDocument();
    expect(screen.getByText("L24")).toBeInTheDocument();
    expect(screen.getByText("N24")).toBeInTheDocument();
    expect(screen.getByLabelText(/SB1 START NO/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/K1 Relay coil/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show graph CAD view/i })).toBeInTheDocument();
  });

  it("shows an empty state and validation error for an empty project", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /New empty/i }));
    expect(screen.getByText("Start a sequence circuit")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Validate/i }));
    expect(screen.getByText(/No circuit objects exist/i)).toBeInTheDocument();
  });

  it("clears stale empty-project validation errors when a starter circuit is restored", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /New empty/i }));
    fireEvent.click(screen.getByRole("button", { name: /Validate/i }));
    expect(screen.getByText(/No circuit objects exist/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Load starter circuit/i }));

    await waitFor(() => {
      expect(screen.queryByText(/No circuit objects exist/i)).not.toBeInTheDocument();
    });
  });

  it("steps the simulation and exposes energized net readings", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /^Step$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 2 running/i)).toBeInTheDocument();
    });
    expect(screen.getAllByText(/Control supply/i)[0]).toBeInTheDocument();
    expect(screen.getByText(/simulation stepped locally/i)).toBeInTheDocument();
  });

  it("lets the operator reset, start, and stop the sequence simulation", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Reset/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Step$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 1 running/i)).toBeInTheDocument();
    });
    expect(screen.getByText("START open")).toBeInTheDocument();
    expect(screen.getAllByText(/K1 coil: 0 VAC \/ 0.00 A/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /^START$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Step$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 2 running/i)).toBeInTheDocument();
    });
    expect(screen.getByText("START closed")).toBeInTheDocument();
    expect(screen.getAllByText(/K1 coil: 24 VAC \/ 0.25 A/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /^STOP$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Step$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 3 running/i)).toBeInTheDocument();
    });
    expect(screen.getByText("STOP open")).toBeInTheDocument();
    expect(screen.getAllByText(/K1 coil: 0 VAC \/ 0.00 A/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Simulation signal timeline")).toBeInTheDocument();
    expect(screen.getByText("Active States (3)")).toBeInTheDocument();
    expect(screen.getAllByText("K1 Coil").length).toBeGreaterThan(0);
    expect(screen.getAllByText("KT1 TON").length).toBeGreaterThan(0);
    expect(screen.getAllByText("HL1 Lamp").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Electrical path analysis")).toBeInTheDocument();
    expect(screen.getByText("Control seal-in branch")).toBeInTheDocument();
    expect(screen.getByText(/0\.54 A/)).toBeInTheDocument();
    expect(screen.getByText("N24 present")).toBeInTheDocument();
  });

  it("saves the current project revision through the API", async () => {
    const apiProject = {
      id: "project-seq-001",
      name: "Motor Start Sequence - Panel A",
      ownerId: "single-user",
      activeRevision: 2,
      standardsProfile: "IEC_KR_INDUSTRIAL",
      updatedAt: new Date().toISOString(),
      model: {
        components: [],
        conductors: [],
        panelPlacements: []
      }
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: apiProject })
        })
      )
    );

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /Save project/i }));

    await waitFor(() => {
      expect(screen.getByText("Saved revision 2")).toBeInTheDocument();
    });
    expect(screen.getAllByText(/Revision 2/i).length).toBeGreaterThan(0);
  });

  it("renders a ladder logic projection tied to the starter circuit", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Show PLC workspace/i }));

    expect(screen.getByText("PLC Ladder Projection")).toBeInTheDocument();
    expect(screen.getByText(/Rung 001 - Start\/stop seal-in/i)).toBeInTheDocument();
    expect(screen.getByText("SB0")).toBeInTheDocument();
    expect(screen.getByText("K1.13")).toBeInTheDocument();
    expect(screen.getByText("Y0")).toBeInTheDocument();
  });

  it("renders a sequence panel fit workspace with mechanical warnings", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Show panel workspace/i }));

    expect(screen.getByText("Sequence Panel Fit")).toBeInTheDocument();
    expect(screen.getByText("Control DIN rail")).toBeInTheDocument();
    expect(screen.getByText("Panel face devices")).toBeInTheDocument();
    expect(screen.getAllByText("K1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("KT1").length).toBeGreaterThan(0);
    expect(screen.getByText(/fit warnings/i)).toBeInTheDocument();
  });
});
