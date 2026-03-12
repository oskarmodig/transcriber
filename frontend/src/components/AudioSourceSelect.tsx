import { useEffect, useState } from "react";
import { useStore } from "../store";

/** Streams attached to a mixed stream so they can be cleaned up later */
export interface MixedStreamSources {
  micStream: MediaStream;
  systemStream: MediaStream;
  audioContext: AudioContext;
}

/** Key used to attach source streams to mixed MediaStream */
const MIXED_SOURCES_KEY = "__mixedSources";

/** Retrieve source streams from a mixed MediaStream (if any) */
export function getMixedSources(stream: MediaStream): MixedStreamSources | undefined {
  return (stream as any)[MIXED_SOURCES_KEY];
}

function isChromeBrowser(): boolean {
  const ua = navigator.userAgent;
  return /Chrome\//.test(ua) && !/Edg\//.test(ua) || /Chromium\//.test(ua);
}

export async function getAudioStream(deviceId: string): Promise<MediaStream> {
  if (deviceId === "system") {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: 1, height: 1 },
      audio: true,
    });
    // Stop the throwaway video track, keep only audio
    stream.getVideoTracks().forEach((t) => t.stop());
    if (stream.getAudioTracks().length === 0) {
      throw new Error("No audio track captured. Make sure to share a tab with audio enabled.");
    }
    return stream;
  }

  if (deviceId === "mic+system") {
    // Get mic stream
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Get system audio stream
    const systemStream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: 1, height: 1 },
      audio: true,
    });
    systemStream.getVideoTracks().forEach((t) => t.stop());
    if (systemStream.getAudioTracks().length === 0) {
      micStream.getTracks().forEach((t) => t.stop());
      throw new Error("No system audio captured. Make sure to share a tab with audio enabled.");
    }

    // Mix both streams using Web Audio API
    const audioContext = new AudioContext();
    const micSource = audioContext.createMediaStreamSource(micStream);
    const systemSource = audioContext.createMediaStreamSource(systemStream);
    const destination = audioContext.createMediaStreamDestination();
    micSource.connect(destination);
    systemSource.connect(destination);

    const mixedStream = destination.stream;
    // Attach original streams for cleanup
    (mixedStream as any)[MIXED_SOURCES_KEY] = { micStream, systemStream, audioContext } as MixedStreamSources;
    return mixedStream;
  }

  if (deviceId && deviceId !== "default") {
    return navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId } },
    });
  }

  return navigator.mediaDevices.getUserMedia({ audio: true });
}

export default function AudioSourceSelect() {
  const { selectedAudioDevice, setSelectedAudioDevice } = useStore();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [isChrome] = useState(isChromeBrowser);

  async function enumerate() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((d) => d.kind === "audioinput"));
    } catch {
      // Permission denied or not available
    }
  }

  useEffect(() => {
    enumerate();
    navigator.mediaDevices.addEventListener("devicechange", enumerate);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", enumerate);
    };
  }, []);

  return (
    <div className="mb-3">
      <label className="block text-xs text-slate-500 mb-1.5">Audio source</label>
      <select
        value={selectedAudioDevice}
        onChange={(e) => setSelectedAudioDevice(e.target.value)}
        className="w-full bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 appearance-none cursor-pointer"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 0.75rem center",
          paddingRight: "2rem",
        }}
      >
        <option value="default">Default microphone</option>
        {devices
          .filter((d) => d.deviceId && d.deviceId !== "default")
          .map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Microphone (${d.deviceId.slice(0, 8)}...)`}
            </option>
          ))}
        <option value="mic+system" disabled={!isChrome}>
          Mic + System audio{!isChrome ? " (Chrome only)" : ""}
        </option>
        <option value="system" disabled={!isChrome}>
          System audio (screen share){!isChrome ? " (Chrome only)" : ""}
        </option>
      </select>
      {selectedAudioDevice === "mic+system" && (
        <p className="text-xs text-slate-500 mt-1">Use headphones to avoid echo</p>
      )}
    </div>
  );
}
