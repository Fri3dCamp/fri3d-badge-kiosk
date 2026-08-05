import {
  Dialog,
  DialogPanel,
  DialogTitle,
  DialogBackdrop,
} from "@headlessui/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { Translate } from "./Translate";
import { AssetStatus, AssetsStatus } from "../types/Assets";

type DownloadStatus = "idle" | "downloading" | "done" | "error";

function formatSize(size: number | null) {
  if (size === null) return "";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} kB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(isoDate: string | null) {
  if (!isoDate) return "";
  return new Date(isoDate).toLocaleDateString();
}

function AssetRow({
  asset,
  kind,
  disabled,
  active,
  onDownload,
}: {
  asset: AssetStatus;
  kind: "flasher" | "firmware";
  disabled: boolean;
  active: boolean;
  onDownload: (kind: "flasher" | "firmware", key: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-2 border-black rounded-xl px-3 py-2 bg-white shadow-sticker-sm">
      <div className="grow min-w-0">
        <div className="font-display font-bold truncate">{asset.name}</div>
        <div className="text-sm font-mono truncate">
          {asset.fileName}
          {asset.installed && asset.size !== null && (
            <span className="text-fri3d-darkgrey"> · {formatSize(asset.size)}</span>
          )}
          {asset.installed && (asset.downloadedAt || asset.modifiedAt) && (
            <span className="text-fri3d-darkgrey">
              {" "}
              · {formatDate(asset.downloadedAt ?? asset.modifiedAt)}
            </span>
          )}
        </div>
      </div>
      {asset.installed ? (
        asset.updateAvailable ? (
          <span className="shrink-0 border-2 border-black rounded-lg bg-fri3d-orange px-2 py-0.5 text-sm font-bold">
            <Translate item="updateAvailable" />
            {asset.availableVersion ? `: ${asset.availableVersion}` : ""}
          </span>
        ) : (
          <span className="shrink-0 border-2 border-black rounded-lg bg-fri3d-mint px-2 py-0.5 text-sm font-bold">
            {asset.version ?? <Translate item="versionUnknown" />}
          </span>
        )
      ) : (
        <span className="shrink-0 border-2 border-black rounded-lg bg-fri3d-red text-white px-2 py-0.5 text-sm font-bold">
          <Translate item="statusMissing" />
        </span>
      )}
      <Button
        className="shrink-0 px-3! py-1! text-base! shadow-none!"
        disabled={disabled}
        onClick={() => onDownload(kind, asset.key)}
      >
        {active ? (
          <Translate item="downloadBusy" />
        ) : asset.updateAvailable ? (
          <Translate item="updateItemButton" />
        ) : (
          <Translate item="downloadItemButton" />
        )}
      </Button>
    </div>
  );
}

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const [updateNoticeOpen, setUpdateNoticeOpen] = useState(false);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [status, setStatus] = useState<DownloadStatus>("idle");
  const [logs, setLogs] = useState("");
  const [assets, setAssets] = useState<AssetsStatus | null>(null);
  const [activeItem, setActiveItem] = useState<string | null>(null);

  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  async function refreshAssets(checkUpdates = false) {
    if (checkUpdates) setCheckingUpdates(true);
    try {
      const nextAssets = checkUpdates
        ? await window.electronAPI.checkForUpdates()
        : await window.electronAPI.getAssetsStatus();
      setAssets(nextAssets);
    } finally {
      if (checkUpdates) setCheckingUpdates(false);
    }
  }

  useEffect(() => {
    const removeProgressListener = window.electronAPI.handleDownloadProgress(
      (_, data: string) => {
        setLogs((logs) => logs + data);
        scrollToBottom();
      }
    );
    const removeCompleteListener = window.electronAPI.handleDownloadComplete(
      () => {
        setStatus("done");
        setActiveItem(null);
        void refreshAssets(true);
      }
    );
    const removeErrorListener = window.electronAPI.handleDownloadError(() => {
      setStatus("error");
      setActiveItem(null);
      void refreshAssets(true);
    });
    const removeOpenSettingsListener = window.electronAPI.handleOpenSettings(
      () => {
        setOpen(true);
      }
    );
    return () => {
      removeProgressListener();
      removeCompleteListener();
      removeErrorListener();
      removeOpenSettingsListener();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setCheckingUpdates(true);
    window.electronAPI
      .checkForUpdates()
      .then((nextAssets) => {
        if (cancelled) return;
        setAssets(nextAssets);
        const updates = [...nextAssets.firmware, ...nextAssets.flashers].some(
          (asset) => asset.updateAvailable
        );
        setUpdateNoticeOpen(updates);
      })
      .catch(() => {
        if (!cancelled) void refreshAssets();
      })
      .finally(() => {
        if (!cancelled) setCheckingUpdates(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (open) {
      void refreshAssets(true);
    }
  }, [open]);

  function scrollToBottom() {
    if (!textAreaRef.current) {
      return;
    }
    textAreaRef.current.scrollTop = textAreaRef.current.scrollHeight;
  }

  function startDownload() {
    setLogs("");
    setStatus("downloading");
    setActiveItem("all");
    window.electronAPI.downloadAssets();
  }

  function startDownloadItem(kind: "flasher" | "firmware", key: string) {
    setLogs("");
    setStatus("downloading");
    setActiveItem(`${kind}:${key}`);
    window.electronAPI.downloadAsset(kind, key);
  }

  const downloading = status === "downloading";
  const availableUpdates = assets
    ? [...assets.firmware, ...assets.flashers].filter(
        (asset) => asset.updateAvailable
      )
    : [];

  return (
    <>
      <Dialog
        open={updateNoticeOpen && !open}
        onClose={() => setUpdateNoticeOpen(false)}
        className="relative z-50"
      >
        <DialogBackdrop className="fixed inset-0 bg-black/50" />
        <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
          <DialogPanel className="max-w-lg space-y-4 border-2 border-black rounded-2xl shadow-sticker bg-white text-black p-8">
            <DialogTitle className="font-display font-bold text-2xl">
              <Translate item="updatesAvailableTitle" />
            </DialogTitle>
            <p>
              <Translate item="updatesAvailableExplanation" />
            </p>
            <ul className="list-disc pl-6 font-bold">
              {availableUpdates.map((asset) => (
                <li key={asset.key}>
                  {asset.name}
                  {asset.availableVersion ? ` (${asset.availableVersion})` : ""}
                </li>
              ))}
            </ul>
            <div className="flex gap-4">
              <Button
                onClick={() => {
                  setUpdateNoticeOpen(false);
                  setOpen(true);
                }}
              >
                <Translate item="openSettingsButton" />
              </Button>
              <Button
                className="bg-white!"
                onClick={() => setUpdateNoticeOpen(false)}
              >
                <Translate item="notNowButton" />
              </Button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      <Dialog
        open={open}
        onClose={() => !downloading && setOpen(false)}
        className="relative z-50"
      >
        <DialogBackdrop className="fixed inset-0 bg-black/50" />

        <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
          <DialogPanel className="w-[85vw] max-w-4xl max-h-[90vh] overflow-y-auto space-y-4 border-2 border-black bg-white text-black p-8 rounded-2xl shadow-sticker">
            <DialogTitle className="text-3xl font-display font-bold">
              <Translate item="settingsTitle" />
            </DialogTitle>
            <p>
              <Translate item="settingsExplanation" />
            </p>

            {checkingUpdates && (
              <p className="font-bold text-fri3d-darkgrey">
                <Translate item="checkingUpdates" />
              </p>
            )}

            {assets && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h3 className="text-xl font-display font-bold">
                    <Translate item="settingsFirmwareTitle" />
                  </h3>
                  {assets.firmware.map((firmware) => (
                    <AssetRow
                      key={firmware.key}
                      asset={firmware}
                      kind="firmware"
                      disabled={downloading}
                      active={activeItem === `firmware:${firmware.key}`}
                      onDownload={startDownloadItem}
                    />
                  ))}
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-display font-bold">
                    <Translate item="settingsFlashersTitle" />
                  </h3>
                  {assets.flashers.map((flasher) => (
                    <AssetRow
                      key={flasher.key}
                      asset={flasher}
                      kind="flasher"
                      disabled={downloading}
                      active={activeItem === `flasher:${flasher.key}`}
                      onDownload={startDownloadItem}
                    />
                  ))}
                </div>
              </div>
            )}

            {status === "done" && (
              <p className="font-bold text-fri3d-mint-dark">
                <Translate item="downloadDone" />
              </p>
            )}
            {status === "error" && (
              <p className="font-bold text-fri3d-red">
                <Translate item="downloadFailed" />
              </p>
            )}

            <textarea
              ref={textAreaRef}
              readOnly
              className="border-2 border-black w-full h-[20vh] bg-fri3d-darkgrey px-4 py-2 text-white rounded-xl resize-none font-mono text-sm"
              value={logs}
            />

            <div className="flex gap-4">
              <Button onClick={startDownload} disabled={downloading}>
                {downloading && activeItem === "all" ? (
                  <Translate item="downloadBusy" />
                ) : (
                  <Translate item="downloadAllButton" />
                )}
              </Button>
              <Button
                className="bg-white!"
                onClick={() => setOpen(false)}
                disabled={downloading}
              >
                <Translate item="closeErrorDialog" />
              </Button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
}
