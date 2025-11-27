import { useState, useEffect } from "react";

interface PlaybackControlsProps {
  isPlaying: boolean;
  recordings: Array<{ file_path: string; file_name: string }>;
  selectedPath?: string;
  onSelectPath?: (path: string) => void;
  onPlay: (path: string, speed: number) => void;
  onStop: () => void;
}

export const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  isPlaying,
  recordings,
  selectedPath: externalSelectedPath = "",
  onSelectPath,
  onPlay,
  onStop,
}) => {
  const [selectedPath, setSelectedPath] = useState<string>(externalSelectedPath);
  const [speed, setSpeed] = useState<number>(1.0);

  // Sync external selectedPath with internal state
  useEffect(() => {
    setSelectedPath(externalSelectedPath);
  }, [externalSelectedPath]);

  const handlePathChange = (path: string) => {
    setSelectedPath(path);
    onSelectPath?.(path);
  };

  const handlePlay = () => {
    if (selectedPath) {
      onPlay(selectedPath, speed);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">回放控制</h2>
      <div className="flex flex-col gap-2">
        <select
          value={selectedPath}
          onChange={(e) => handlePathChange(e.target.value)}
          disabled={isPlaying}
          className="px-3 py-2 border border-gray-300 rounded disabled:bg-gray-100"
        >
          <option value="">选择录制文件...</option>
          {recordings.map((rec) => (
            <option key={rec.file_path} value={rec.file_path}>
              {rec.file_name}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <label className="text-sm">回放速度:</label>
          <select
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            disabled={isPlaying}
            className="px-3 py-2 border border-gray-300 rounded disabled:bg-gray-100"
          >
            <option value="0.5">0.5x</option>
            <option value="1.0">1x</option>
            <option value="1.5">1.5x</option>
            <option value="2.0">2x</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handlePlay}
            disabled={isPlaying || !selectedPath}
            className={`px-4 py-2 rounded ${
              isPlaying || !selectedPath
                ? "bg-gray-300 cursor-not-allowed"
                : "bg-blue-500 hover:bg-blue-600 text-white"
            }`}
          >
            开始回放
          </button>
          <button
            onClick={onStop}
            disabled={!isPlaying}
            className={`px-4 py-2 rounded ${
              !isPlaying
                ? "bg-gray-300 cursor-not-allowed"
                : "bg-gray-500 hover:bg-gray-600 text-white"
            }`}
          >
            停止回放
          </button>
        </div>
      </div>
    </div>
  );
};

