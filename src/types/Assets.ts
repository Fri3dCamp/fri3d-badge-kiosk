export interface AssetStatus {
  key: string;
  name: string;
  fileName: string;
  installed: boolean;
  size: number | null;
  modifiedAt: string | null;
  version: string | null;
  availableVersion: string | null;
  updateAvailable: boolean;
  downloadedAt: string | null;
}

export interface AssetsStatus {
  flashers: AssetStatus[];
  firmware: AssetStatus[];
}
