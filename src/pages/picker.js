import { render } from "preact";
import { T, TT } from "../utils/i18n";
import {
  useKeyPress,
  useURLParams,
  useTimer,
  SettingsContextProvider,
  useSettingsContext,
  useThemePreferenceSync,
  useMousePositionRef,
  useWindowSize,
} from "../utils/hooks";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { apiNs } from "../utils/compat";
import { PropTypes } from "prop-types";
import { useTemporaryState } from "../utils/hooks";
import {
  createCanvasFromDataUri,
  isQrCodeContentLink,
  playScanSuccessAudio,
} from "../utils/misc";
import { addHistory } from "../utils/history";
import { initDecoder, scan as decodeQrCodes } from "../utils/qrcode";
import QRPositionMarker from "./components/QRPositionMarker";

const minScaleFactor = 0.2;
const maxScaleFactor = 10;
const maxScaleLevel = 30;
const distance = (maxScaleFactor - minScaleFactor) / maxScaleLevel;
const defaultScaleLevel = 10;
const baseScanSize = 100;
// How far (in CSS px) a finger must move before a touch counts as a drag
// selection rather than a tap.
const DRAG_THRESHOLD = 10;
// Where the scanned image settles next to the result card; `min()` keeps it
// inside a phone-width viewport.
const RESULT_IMAGE_SIZE = "min(400px, 90vw)";

/**
 * @param {{x:number, y:number}} center
 * @param {number} size
 */
function squareAround(center, size) {
  return {
    x: center.x - size / 2,
    y: center.y - size / 2,
    width: size,
    height: size,
  };
}

function isSameRect(a, b) {
  return (
    !!a &&
    !!b &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height
  );
}

// Start loading the decoder while the user is still positioning the scan
// region, so the first scan doesn't wait on the wasm module.
initDecoder();

/**
 * Captures the given region of the visible tab (only the background can call
 * `tabs.captureVisibleTab`) and decodes it here in the page, which keeps the
 * heavy OpenCV runtime out of the non-persistent background script.
 * @param {{rect, scroll, devicePixelRatio:number}} params
 * @return {Promise<{image?:string, imageSize?:{width,height}, result?:Array, err?:Error}>}
 */
async function captureAndDecode(params) {
  const captured = await apiNs.runtime.sendMessage({
    action: "BG_CAPTURE",
    ...params,
  });
  if (!captured?.image) {
    return { err: new Error(captured?.err || "capture failed") };
  }

  const canvas = await createCanvasFromDataUri(captured.image);
  const imageSize = { width: canvas.width, height: canvas.height };
  try {
    const ctx = canvas.getContext("2d");
    const result = await decodeQrCodes(
      ctx.getImageData(0, 0, canvas.width, canvas.height)
    );
    if (result.length) {
      await addHistory("decode", result[0].content);
    }
    return { image: captured.image, imageSize, result };
  } catch (err) {
    console.error("decode failed", err);
    return { image: captured.image, imageSize, err };
  }
}

/**
 * collision detection
 * @param a {{x,y,width,height}}
 * @param b {{x,y,width,height}}
 * @return {boolean}
 */
function collides(a, b) {
  const ax1 = a.x;
  const ay1 = a.y;
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;

  const bx1 = b.x;
  const by1 = b.y;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;

  return !(ax2 < bx1 || bx2 < ax1 || ay2 < by1 || by2 < ay1);
}

function Picker({ stage, onScan, onSpotChange, scaleLevel: propsScaleLevel }) {
  const windowSize = useWindowSize();
  const [scaleLevel, setScaleLevel] = useState(
    typeof propsScaleLevel === "number" && propsScaleLevel >= 0
      ? Math.floor(propsScaleLevel)
      : defaultScaleLevel
  );
  const factor = minScaleFactor + distance * scaleLevel;
  const scanSize = baseScanSize * factor;
  const maskRef = useRef(null);
  const pathRef = useRef(null);

  // The region last drawn/reported; also what stays highlighted while scanning.
  const lastRectRef = useRef(null);
  const mousePositionRef = useMousePositionRef();
  // Touch/pen selection: where the finger went down, and the region it has
  // dragged out (or tapped around). Takes precedence over the mouse position,
  // which touch screens only update with emulated events.
  const touchStartRef = useRef(null);
  const touchRectRef = useRef(null);
  // The emulated click that follows a touch must not trigger a second scan.
  const suppressClickRef = useRef(false);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    maskRef.current?.setAttribute(
      "viewBox",
      `0 0 ${windowSize.width} ${windowSize.height}`
    );
  }, [windowSize]);

  // Each new round of picking starts without the previous touch selection.
  useEffect(() => {
    if (stage === "picking") {
      touchRectRef.current = null;
    }
  }, [stage]);

  useEffect(() => {
    cancelAnimationFrame(animationFrameRef.current);
    const updateSpotlight = () => {
      if (pathRef.current) {
        const ww = windowSize.width;
        const wh = windowSize.height;
        let pathDef = `M 0 0 L 0 ${wh} L ${ww} ${wh} L ${ww} 0 Z`;

        let rect = null;
        if (stage === "picking") {
          rect =
            touchRectRef.current ||
            (mousePositionRef.current &&
              squareAround(mousePositionRef.current, scanSize));
        } else if (stage === "scanning") {
          rect = lastRectRef.current;
        }

        if (rect) {
          pathDef += `M ${rect.x - 1} ${rect.y - 1} l 0 ${rect.height + 2} l ${rect.width + 2
            } 0 l 0 -${rect.height + 2} Z`;
        }
        pathRef.current.setAttribute("d", pathDef);

        if (stage === "picking") {
          if (rect && !isSameRect(rect, lastRectRef.current)) {
            lastRectRef.current = rect;
            onSpotChange(rect, scaleLevel);
          }

          animationFrameRef.current = requestAnimationFrame(updateSpotlight);
        }
      }
      return () => {
        cancelAnimationFrame(animationFrameRef.current);
      };
    };
    updateSpotlight();
  }, [
    stage,
    scaleLevel,
    mousePositionRef /* make eslint happy */,
    scanSize,
    onSpotChange,
    windowSize,
  ]);

  const handleWheel = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (stage === "picking") {
      setScaleLevel((level) => {
        level = level + (event.deltaY > 0 ? -1 : 1);
        if (level < 0) {
          level = 0;
        } else if (level > maxScaleLevel) {
          level = maxScaleLevel;
        }
        return level;
      });
    }
  };

  const handleClick = (e) => {
    e.stopPropagation();
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (stage === "picking") {
      onScan();
    }
  };

  const handlePointerDown = (e) => {
    if (e.pointerType === "mouse" || stage !== "picking") {
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    touchStartRef.current = { x: e.clientX, y: e.clientY };
    touchRectRef.current = null;
  };

  const handlePointerMove = (e) => {
    const start = touchStartRef.current;
    if (!start) {
      return;
    }
    const width = Math.abs(e.clientX - start.x);
    const height = Math.abs(e.clientY - start.y);
    if (!touchRectRef.current && Math.max(width, height) < DRAG_THRESHOLD) {
      return;
    }
    touchRectRef.current = {
      x: Math.min(start.x, e.clientX),
      y: Math.min(start.y, e.clientY),
      width,
      height,
    };
  };

  const handlePointerUp = () => {
    const start = touchStartRef.current;
    if (!start) {
      return;
    }
    touchStartRef.current = null;
    suppressClickRef.current = true;
    // A tap (no real drag) scans a default-sized square around the finger.
    const rect = touchRectRef.current || squareAround(start, scanSize);
    touchRectRef.current = rect;
    lastRectRef.current = rect;
    onSpotChange(rect, scaleLevel);
    onScan(rect);
  };

  const handlePointerCancel = () => {
    touchStartRef.current = null;
    touchRectRef.current = null;
  };

  return (
    <svg
      class="mask"
      width="100%"
      height="100%"
      viewBox="0 0 0 0"
      xmlns="http://www.w3.org/2000/svg"
      onWheel={handleWheel}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      ref={maskRef}
      style={{
        cursor:
          stage === "scanning"
            ? "wait"
            : stage === "picking"
              ? "crosshair"
              : "auto",
      }}
    >
      <path
        fill="black"
        fillOpacity="50%"
        fillRule="evenodd"
        ref={pathRef}
      ></path>
    </svg>
  );
}

Picker.propTypes = {
  stage: PropTypes.oneOf(["picking", "scanning", "result"]).isRequired,
  onScan: PropTypes.func.isRequired,
  onSpotChange: PropTypes.func.isRequired,
  scaleLevel: PropTypes.number,
};

function Scanner({
  port: propsPort,
  scroll: propsScroll,
  scaleLevel: propsScaleLevel,
  options: propsOptions,
}) {
  const { settings } = useSettingsContext();
  useThemePreferenceSync(settings);
  const port = useRef(propsPort);
  const [stage, setStage] = useState("picking");
  const [inputImage, setInputImage] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const params = useURLParams();
  const [validated, setValidated] = useState(false);
  const [options, setOptions] = useState({
    openUrlMode: "NO_OPEN",
    ...(propsOptions || {}),
  });
  const [copied, setCopied] = useTemporaryState(false, 3000);
  const resultContentNode = useRef(null);
  const xMarkNode = useRef(null);
  const tipsNode = useRef(null);
  const [imagePosition, setImagePosition] = useState(null);
  const { setTimer } = useTimer();
  const [resultVisible, setResultVisible] = useState(false);
  const [spotRect, setSpotRect] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [inputImageSize, setInputImageSize] = useState(null);
  // Phones and tablets: show touch gestures instead of mouse/keyboard hints.
  const isTouch = useMemo(
    () => window.matchMedia("(pointer: coarse)").matches,
    []
  );
  const scaleLevel = useRef(propsScaleLevel);
  const scroll = useRef(propsScroll);

  const collidesWithSpot = useCallback(
    function (el) {
      if (!el || !spotRect) {
        return false;
      }
      return collides(spotRect, el.getBoundingClientRect());
    },
    [spotRect]
  );

  useEffect(() => {
    const currentPort = port.current;
    if (currentPort) {
      currentPort.onmessage = (ev) => {
        switch (ev.data?.action) {
          case "PICKER_UPDATE_SCROLL":
            scroll.current = ev.data.scroll;
            break;
        }
      };
    }
    return () => {
      if (currentPort) {
        currentPort.onmessage = null;
      }
    };
  }, []);

  // validate secret
  useEffect(() => {
    const secret = params?.get("secret");
    if (!secret) {
      return;
    }

    apiNs.runtime
      .sendMessage({
        action: "BG_VALIDATE_PICKER_SECRET",
        secret,
      })
      .then((res) => {
        setValidated(res);
        if (!res) {
          console.error("picker frame secret validation failed");
        }
      })
      .catch((e) => {
        console.error(e);
      });
  }, [params]);

  const close = useCallback(() => {
    if (port.current) {
      port.current.postMessage({
        action: "PICKER_CLOSE",
        scaleLevel: scaleLevel.current,
      });
    }
  }, []);

  const copyResult = useCallback(() => {
    if (!result?.content) {
      return;
    }
    (async () => {
      let ok = false;
      if (navigator.clipboard) {
        ok = await navigator.clipboard
          .writeText(result.content)
          .then(() => {
            setCopied(true);
            return true;
          })
          .catch(() => false);
      }
      if (!ok && resultContentNode.current) {
        resultContentNode.current.select();
        if (document.execCommand("copy")) {
          setCopied(true);
        }
        resultContentNode.current.setSelectionRange(0, 0);
      }
    })();
  }, [result, setCopied]);

  const newScan = useCallback(() => {
    setStage("picking");
    setInputImage(null);
    setResult(null);
    setError(null);
    setResultVisible(false);
  }, []);

  useKeyPress({ key: "Escape", event: "keyup", callback: close });
  useKeyPress({ key: "r", event: "keyup", callback: newScan });

  const handleSpotChange = useCallback((spot, newScaleLevel) => {
    setSpotRect(spot);
    scaleLevel.current = newScaleLevel;
    if (port.current) {
      port.current.postMessage({
        action: "PICKER_SAVE_SCALE_LEVEL",
        scaleLevel: newScaleLevel,
      });
    }
  }, []);

  /**
   * @param {{x,y,width,height}} [pickedRect] region to scan; a touch selection
   *   passes it directly because the spot state hasn't re-rendered yet.
   */
  const scan = useCallback(async (pickedRect) => {
    const spot = pickedRect || spotRect;
    if (!spot.width || !spot.height) {
      return;
    }
    setStage("scanning");
    const x = Math.max(spot.x, 0);
    const y = Math.max(spot.y, 0);
    const width = Math.min(spot.x + spot.width, window.innerWidth) - x;
    const height = Math.min(spot.y + spot.height, window.innerHeight) - y;

    const rect = { x, y, width, height };
    let nextStage = "result";
    try {
      const res = await captureAndDecode({
        rect,
        scroll: scroll.current,
        devicePixelRatio: window.devicePixelRatio,
      });
      setError(res.err || null);
      setInputImage(res.image || null);
      setInputImageSize(res.imageSize || null);
      if (res.result?.length > 0) {
        const playAudioPromise = playScanSuccessAudio();
        setResult(res.result[0]);
        const content = res.result[0].content;
        if (isQrCodeContentLink(content)) {
          switch (options.openUrlMode) {
            case "OPEN":
              nextStage = null;
              playAudioPromise.then(() => {
                window.open(content, "_top");
                close();
              });
              break;
            case "OPEN_NEW_BG_TAB":
              nextStage = null;
              apiNs.runtime.sendMessage({
                action: "BG_CREATE_TAB",
                active: false,
                url: content,
              });
              newScan();
              break;
            case "OPEN_NEW_FG_TAB":
              nextStage = null;
              apiNs.runtime.sendMessage({
                action: "BG_CREATE_TAB",
                active: true,
                url: content,
              });
              newScan();
              break;
          }
        }
      }
    } catch (e) {
      setError(e);
    } finally {
      if (nextStage) {
        if (nextStage === "result") {
          setImagePosition({
            top: `${rect.y + rect.height / 2}px`,
            left: `${rect.x + rect.width / 2}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
          });
          setTimer(() => {
            setImagePosition({
              top: "350px",
              left: "50%",
              width: RESULT_IMAGE_SIZE,
              height: RESULT_IMAGE_SIZE,
            });
          }, 100);
          setTimer(() => {
            setResultVisible(true);
          }, 100);
        }
        setStage(nextStage);
      }
    }
  }, [
    close,
    newScan,
    options.openUrlMode,
    setTimer,
    spotRect,
  ]);

  useEffect(() => {
    if (result) {
      const timer = setTimeout(() => {
        if (resultContentNode.current) {
          resultContentNode.current?.select();
        }
      });
      return () => clearTimeout(timer);
    }
  }, [result]);

  const tipsStyles = {
    opacity:
      stage === "picking" && collidesWithSpot(tipsNode.current) ? "0" : "1",
  };
  const xMarkStyles = {
    opacity:
      stage === "picking" && collidesWithSpot(xMarkNode.current) ? "0" : "1",
  };

  if (!validated) {
    return null;
  }

  return (
    <>
      <Picker
        stage={stage}
        onSpotChange={handleSpotChange}
        onScan={scan}
        scaleLevel={propsScaleLevel}
      />
      <div class="tips" id="tips" ref={tipsNode} style={tipsStyles}>
        <img
          class="logo"
          src="../icons/zenqr.svg"
          title={T("extension_name")}
        />
        {stage === "picking" && isTouch && (
          <span>{TT("scan_region_picker_tips_touch")}</span>
        )}
        {stage === "picking" && !isTouch && (
          <>
            <kbd>
              <img
                class="icon icon-invert"
                src="../icons/mouse-scrollwheel.svg"
                title={T("scan_region_picker_tips_scrollwheel")}
              />
            </kbd>
            <span>{TT("scan_region_picker_tips_adjust_size")}</span>
          </>
        )}
        {stage === "picking" && !isTouch && (
          <>
            <kbd>
              <img
                class="icon icon-invert"
                src="../icons/mouse-leftclick.svg"
                title={T("scan_region_picker_tips_leftclick")}
              />
            </kbd>
            <span>{TT("scan_region_picker_tips_scan")}</span>
          </>
        )}
        {stage === "result" && !isTouch && (
          <>
            <kbd>R</kbd>
            <span>{TT("scan_region_picker_tips_rescan")}</span>
          </>
        )}
        {(stage === "picking" || stage === "result") && !isTouch && (
          <>
            <kbd>{TT("scan_region_picker_tips_esc")}</kbd>
            <span>{TT("scan_region_picker_tips_exit")}</span>
          </>
        )}
        {(stage === "picking" || stage === "result") && (
          <select
            id="select-open-url-mode"
            title={T("scan_region_picker_tips_open_url_mode_title")}
            defaultValue={options.openUrlMode}
            onChange={(e) => {
              setOptions((old) => {
                return {
                  ...old,
                  openUrlMode: e.target.value,
                };
              });
            }}
          >
            <option value="NO_OPEN">
              {TT("picker_url_mode_auto_open_no")}
            </option>
            <option value="OPEN">
              {TT("picker_url_mode_auto_open_in_current_tab")}
            </option>
            <option value="OPEN_NEW_BG_TAB">
              {TT("picker_url_mode_auto_open_in_bg_tab")}
            </option>
            <option value="OPEN_NEW_FG_TAB">
              {TT("picker_url_mode_auto_open_in_fg_tab")}
            </option>
          </select>
        )}
      </div>
      <div
        class=" x-mark"
        id="x-mark"
        title={T("picker_close_btn_title")}
        onClick={() => {
          close();
        }}
        ref={xMarkNode}
        style={xMarkStyles}
      >
        ×
      </div>
      {stage === "result" && (
        <>
          <div class="input-image-container" style={imagePosition}>
            {inputImage && (
              <QRPositionMarker
                image={inputImage}
                width={inputImageSize?.width}
                height={inputImageSize?.height}
                result={result}
                flashDelay="0.3s"
                className="qr-position-marker"
              >
              </QRPositionMarker>
            )}
          </div>
          <div
            class="result"
            id="result"
            style={{ opacity: resultVisible ? "1" : "0" }}
          >
            <textarea
              id="result-content"
              class={result?.content ? "" : "error"}
              placeholder={
                T("unable_to_decode") + (error ? ": " + error.message : "")
              }
              title={T("content_title")}
              readOnly
              rows="6"
              value={result?.content || ""}
              ref={resultContentNode}
            ></textarea>
            <div class="result-actions">
              <div>
                {isQrCodeContentLink(result?.content) && (
                  <a
                    id="open-link-btn"
                    class=" clickable"
                    target="_blank"
                    title={T("open_url_btn_title")}
                    onClick={() => {
                      window.open(result.content, "_blank");
                    }}
                  >
                    <img class="icon icon-invert" src="../icons/open-url.svg" />
                    {TT("open_url_btn")}
                  </a>
                )}
              </div>
              <div>
                {result?.content &&
                  (!copied ? (
                    <a
                      id="copy-btn"
                      class=" clickable"
                      title={T("copy_image_btn_title")}
                      onClick={() => {
                        copyResult();
                      }}
                    >
                      <img class="icon icon-invert" src="../icons/copy.svg" />
                      {TT("copy_btn")}
                    </a>
                  ) : (
                    <span id="copied-message" class="clickable">
                      {TT("copy_btn_copied")}
                    </span>
                  ))}
              </div>
              <div>
                <a
                  id="rescan-btn"
                  class="clickable"
                  title={T("rescan_btn_title")}
                  onClick={newScan}
                >
                  <img class="icon icon-invert" src="../icons/refresh.svg" />
                  {TT("rescan_btn_label")}
                </a>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

Scanner.propTypes = {
  port: PropTypes.object,
  scroll: PropTypes.object,
  scaleLevel: PropTypes.number,
  options: PropTypes.object,
};

// set up message handler asap so that we don't miss the message
window.onmessage = (event) => {
  switch (event.data?.action) {
    case "PICKER_SHOW":
      window.onmessage = null;
      render(
        <SettingsContextProvider>
          <Scanner
            port={event.ports[0]}
            scroll={event.data.scroll}
            scaleLevel={event.data.scaleLevel}
            options={event.data.options}
          />
        </SettingsContextProvider>,
        document.body
      );
      break;
    default:
      console.error("Invalid init message", event.data);
      break;
  }
};
