import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DevicePill } from "./DevicePill";
import { useDeviceStore } from "../../stores/deviceStore";
import { usePlayerStore } from "../../stores/playerStore";
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
  usePlayerStore.setState({ playing: false });
});

describe("DevicePill rendering", () => {
  it('shows "No device" when no active device', () => {
    render(<DevicePill />);
    expect(screen.getByText("No device")).toBeInTheDocument();
  });

  it("shows the active device name", () => {
    useDeviceStore.setState({
      devices: [makeDevice({ id: "a", name: "Kitchen" })],
      activeDeviceId: "a",
    });
    render(<DevicePill />);
    expect(screen.getByText("Kitchen")).toBeInTheDocument();
  });

  it("shows green dot when playing", () => {
    useDeviceStore.setState({
      devices: [makeDevice({ id: "a", name: "Kitchen" })],
      activeDeviceId: "a",
    });
    usePlayerStore.setState({ playing: true });
    const { container } = render(<DevicePill />);
    const dot = container.querySelector(".bg-emerald-400");
    expect(dot).toBeInTheDocument();
  });

  it("shows grey dot when not playing", () => {
    useDeviceStore.setState({
      devices: [makeDevice({ id: "a" })],
      activeDeviceId: "a",
    });
    usePlayerStore.setState({ playing: false });
    const { container } = render(<DevicePill />);
    const dot = container.querySelector('[class*="bg-emerald-400"]');
    expect(dot).toBeNull();
  });
});

describe("DevicePill dropdown", () => {
  it("opens dropdown on click", () => {
    useDeviceStore.setState({
      devices: [makeDevice({ id: "a", name: "Kitchen" }), makeDevice({ id: "b", name: "Bedroom" })],
      activeDeviceId: "a",
    });
    render(<DevicePill />);
    fireEvent.click(screen.getByText("Kitchen"));
    expect(screen.getByText("Bedroom")).toBeInTheDocument();
  });

  it("selects a device from dropdown", () => {
    useDeviceStore.setState({
      devices: [makeDevice({ id: "a", name: "Kitchen" }), makeDevice({ id: "b", name: "Bedroom" })],
      activeDeviceId: "a",
    });
    render(<DevicePill />);
    fireEvent.click(screen.getByText("Kitchen"));
    fireEvent.click(screen.getByText("Bedroom"));
    expect(useDeviceStore.getState().activeDeviceId).toBe("b");
  });

  it("shows follower label for slave devices", () => {
    useDeviceStore.setState({
      devices: [
        makeDevice({ id: "a", name: "Main", is_master: true, group_id: "a" }),
        makeDevice({ id: "b", name: "Follower", group_id: "a" }),
      ],
      activeDeviceId: "a",
    });
    render(<DevicePill />);
    fireEvent.click(screen.getByText("Main"));
    expect(screen.getByText("(follower)")).toBeInTheDocument();
  });

  it("does not show disabled devices in dropdown", () => {
    useDeviceStore.setState({
      devices: [
        makeDevice({ id: "a", name: "Active" }),
        makeDevice({ id: "b", name: "Disabled", enabled: false }),
      ],
      activeDeviceId: "a",
    });
    render(<DevicePill />);
    fireEvent.click(screen.getByText("Active"));
    expect(screen.queryByText("Disabled")).toBeNull();
  });
});
