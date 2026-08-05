import { Board } from "./types/Board";
import { AssetsStatus } from "./types/Assets";

declare global {
  interface Window {
    electronAPI: {
      selectBoard: (board: Board) => void;
      flash: () => void;
      downloadAssets: () => void;
      downloadAsset: (kind: "flasher" | "firmware", key: string) => void;
      getAssetsStatus: () => Promise<AssetsStatus>;
      checkForUpdates: () => Promise<AssetsStatus>;
      handleFlashComplete: (cb: () => void) => () => void;
      handleFlashError: (cb: () => void) => () => void;
      handleStdout: (cb: (event: any, data: string) => void) => () => void;
      handleStderr: (cb: (event: any, data: string) => void) => () => void;
      handleError: (cb: (event: any, data: string) => void) => () => void;
      handleDownloadProgress: (
        cb: (event: any, data: string) => void
      ) => () => void;
      handleDownloadComplete: (cb: () => void) => () => void;
      handleDownloadError: (cb: () => void) => () => void;
      handleOpenSettings: (cb: () => void) => () => void;
    };
  }
}
