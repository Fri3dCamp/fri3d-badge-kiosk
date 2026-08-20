import { useContext, useEffect, useRef, useState } from "react";
import { Button } from "../Button";
import { StepContext } from "../../context/StepContext";
import { Translate } from "../Translate";
import { BoardContext } from "../../context/BoardContext";

const WCH_DEVICE_NOT_FOUND = "No WCH ISP USB device found";

export function Flash() {
  const [logs, setLogs] = useState("");
  const { nextStep, previousStep, backToHome } = useContext(StepContext);
  const { selectedBoard } = useContext(BoardContext);
  const [flashing, setFlashing] = useState(true);
  const [showFlashAgain, setShowFlashAgain] = useState(false);
  const [wchDeviceNotFound, setWchDeviceNotFound] = useState(false);

  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const stderrRef = useRef("");

  useEffect(() => {
    const removeHandleFlashCompleteListener =
      window.electronAPI.handleFlashComplete(() => {
        setFlashing(false);
        nextStep();
      });
    const removeHandleFlashErrorListener = window.electronAPI.handleFlashError(
      () => {
        setShowFlashAgain(true);
        setFlashing(false);
      }
    );
    const removeHandleStdoutListener = window.electronAPI.handleStdout(
      (_, data: string) => {
        setLogs((logs) => logs + data);
        scrollToBottom();
      }
    );
    const removeHandleStderrListener = window.electronAPI.handleStderr(
      (_, data: string) => {
        stderrRef.current += data;
        if (
          selectedBoard?.chipType === "WCHISP" &&
          stderrRef.current.includes(WCH_DEVICE_NOT_FOUND)
        ) {
          setWchDeviceNotFound(true);
        }
        setLogs((logs) => logs + data);
        scrollToBottom();
      }
    );

    startFlash();

    return () => {
      removeHandleFlashCompleteListener();
      removeHandleFlashErrorListener();
      removeHandleStdoutListener();
      removeHandleStderrListener();
    };
  }, []);

  function startFlash() {
    stderrRef.current = "";
    setLogs("Ready!\n");
    setShowFlashAgain(false);
    setWchDeviceNotFound(false);
    setFlashing(true);
    console.log("Start flashing");
    window.electronAPI.flash();
  }

  function scrollToBottom() {
    console.log("scroll", textAreaRef);
    if (!textAreaRef.current) {
      return;
    }
    textAreaRef.current.scrollTop = textAreaRef.current.scrollHeight;
  }

  return (
    <div className="flex flex-col gap-4">
      {showFlashAgain && (
        <p className="text-center">
          <Translate item="flashingFailedButton" />
        </p>
      )}
      {showFlashAgain && wchDeviceNotFound && (
        <p
          role="alert"
          className="mx-auto max-w-3xl rounded-xl border-2 border-yellow-300 bg-yellow-950 px-5 py-4 text-center text-yellow-100"
        >
          <Translate item="wchDeviceNotFoundHint" />
        </p>
      )}
      {flashing && (
        <p className="text-8xl text-center font-display font-bold animate-text whitespace-pre">
          <Translate item="flashingInProgress" />
        </p>
      )}
      <div className="flex gap-4">
        {showFlashAgain && (
          <Button className="mx-auto block shrink" onClick={startFlash}>
            <Translate item="flashingTryAgainButton" />
          </Button>
        )}
        {!flashing && (
          <>
            <Button className="mx-auto block" onClick={previousStep}>
              <Translate item="flashingBackButton" />
            </Button>
            <Button className="mx-auto block" onClick={backToHome}>
              <Translate item="chooseOtherBoard" />
            </Button>
          </>
        )}
      </div>

      <textarea
        ref={textAreaRef}
        readOnly
        className="border-2 border-white w-[70vw] h-[50vh] bg-fri3d-darkgrey px-4 py-2 text-white rounded-xl shadow-sticker-sm resize font-mono text-sm"
        value={logs}
      />
    </div>
  );
}
