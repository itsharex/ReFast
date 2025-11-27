import { invoke } from "@tauri-apps/api/core";
import type { RecordingMeta, AppInfo } from "../types";

export const tauriApi = {
  async getRecordingStatus(): Promise<boolean> {
    return invoke("get_recording_status");
  },

  async startRecording(): Promise<void> {
    return invoke("start_recording");
  },

  async stopRecording(): Promise<string> {
    return invoke("stop_recording");
  },

  async listRecordings(): Promise<RecordingMeta[]> {
    return invoke("list_recordings");
  },

  async deleteRecording(path: string): Promise<void> {
    return invoke("delete_recording", { path });
  },

  async playRecording(path: string, speed: number): Promise<void> {
    return invoke("play_recording", { path, speed });
  },

  async stopPlayback(): Promise<void> {
    return invoke("stop_playback");
  },

  async getPlaybackStatus(): Promise<boolean> {
    return invoke("get_playback_status");
  },

  async getPlaybackProgress(): Promise<number> {
    return invoke("get_playback_progress");
  },

  async scanApplications(): Promise<AppInfo[]> {
    return invoke("scan_applications");
  },

  async searchApplications(query: string): Promise<AppInfo[]> {
    return invoke("search_applications", { query });
  },

  async launchApplication(app: AppInfo): Promise<void> {
    return invoke("launch_application", { app });
  },

  async toggleLauncher(): Promise<void> {
    return invoke("toggle_launcher");
  },

  async hideLauncher(): Promise<void> {
    return invoke("hide_launcher");
  },
};

