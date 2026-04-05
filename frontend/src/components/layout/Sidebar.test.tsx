import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Sidebar } from "./Sidebar";
import { useDeviceStore } from "../../stores/deviceStore";
import type { Device } from "../../api/client";

const TEST_DEVICE_IP = `192.168.1.${10}`;

function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: "dev-1",
    name: "Living Room",
    ip: TEST_DEVICE_IP,
    model: "WiiM Pro",
    firmware: "4.8.1",
    device_type: "wiim",
    enabled: true,
    capabilities: {
      av_transport: true,
      rendering_control: true,
      wiim_extended: true,
      https_api: true,
    },
    volume: 0.5,
    muted: false,
    channel: null,
    source: "wifi",
    group_id: null,
    is_master: false,
    ...overrides,
  };
}

beforeEach(() => {
  useDeviceStore.setState({ devices: [], activeDeviceId: null });
});

describe("Sidebar rendering", () => {
  it("renders all four nav items", () => {
    render(<Sidebar active={null} onNavigate={vi.fn()} />);
    expect(screen.getByText("Library")).toBeInTheDocument();
    expect(screen.getByText("Queue")).toBeInTheDocument();
    expect(screen.getByText("Rooms")).toBeInTheDocument();
    expect(screen.getByText("EQ")).toBeInTheDocument();
  });

  it("highlights the active nav item", () => {
    render(<Sidebar active="queue" onNavigate={vi.fn()} />);
    const queueBtn = screen.getByText("Queue").closest("button")!;
    expect(queueBtn.className).toContain("color-accent");
  });

  it("does not highlight inactive items", () => {
    render(<Sidebar active="queue" onNavigate={vi.fn()} />);
    const libraryBtn = screen.getByText("Library").closest("button")!;
    expect(libraryBtn.className).toContain("color-text-secondary");
  });
});

describe("Sidebar interactions", () => {
  it("calls onNavigate with correct id on click", () => {
    const onNavigate = vi.fn();
    render(<Sidebar active={null} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText("Library"));
    expect(onNavigate).toHaveBeenCalledWith("library");
    fireEvent.click(screen.getByText("Rooms"));
    expect(onNavigate).toHaveBeenCalledWith("devices");
  });

  it("shows device indicator when active device exists", () => {
    useDeviceStore.setState({
      devices: [makeDevice({ id: "a", name: "Kitchen Speaker" })],
      activeDeviceId: "a",
    });
    render(<Sidebar active={null} onNavigate={vi.fn()} />);
    expect(screen.getByText("Kitchen")).toBeInTheDocument();
  });

  it("does not show device indicator when no active device", () => {
    render(<Sidebar active={null} onNavigate={vi.fn()} />);
    expect(screen.queryByText("Kitchen")).toBeNull();
  });

  it("navigates to devices when device indicator is clicked", () => {
    useDeviceStore.setState({
      devices: [makeDevice({ id: "a", name: "Kitchen Speaker" })],
      activeDeviceId: "a",
    });
    const onNavigate = vi.fn();
    render(<Sidebar active={null} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText("Kitchen"));
    expect(onNavigate).toHaveBeenCalledWith("devices");
  });
});
