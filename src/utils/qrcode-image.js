import SanitizeFilename from "sanitize-filename";
import { render } from "preact";
import QRCodeSVG from "../pages/components/QRCodeSVG";

/**
 * @param {string} dataUrl
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (error) => reject(error);
    img.src = dataUrl;
  });
}

/**
 * Draws the given logo image at the center of the canvas, on top of a
 * rounded white backdrop so the modules directly behind it stay legible.
 * @param {CanvasRenderingContext2D} context
 * @param {number} size
 * @param {string} logoDataUrl
 */
async function drawLogo(context, size, logoDataUrl) {
  const logoImg = await loadImage(logoDataUrl);
  const logoSize = size * 0.22;
  const backdropSize = logoSize * 1.25;
  const backdropPos = (size - backdropSize) / 2;
  const logoPos = (size - logoSize) / 2;
  const radius = backdropSize * 0.2;

  context.fillStyle = "#FFFFFF";
  context.beginPath();
  context.roundRect(backdropPos, backdropPos, backdropSize, backdropSize, radius);
  context.fill();

  context.drawImage(logoImg, logoPos, logoPos, logoSize, logoSize);
}

/**
 * @param {string} content
 * @param {number} size
 * @param {string} moduleStyle
 * @param {string} finderStyle
 * @param {{logoDataUrl?: string}} [opts]
 * @returns {Promise<HTMLCanvasElement>}
 */
export const createCanvasForQrCode = (
  content,
  size,
  moduleStyle,
  finderStyle,
  opts = {}
) => {
  return new Promise((resolve, reject) => {
    const el = document.createElement("div");
    render(
      <QRCodeSVG
        width={size}
        height={size}
        content={content}
        moduleStyle={moduleStyle}
        finderStyle={finderStyle}
        backgroundColor="white"
        foregroundColor="black"
      ></QRCodeSVG>,
      el
    );
    const svg = el.querySelector("svg");
    const img = document.createElement("img");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const xml = new XMLSerializer().serializeToString(svg);
    const svg64 = btoa(xml);
    const context = canvas.getContext("2d");
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, canvas.width, canvas.height);

    img.onload = function () {
      context.drawImage(img, 0, 0);
      img.onload = null; // clean up
      img.onerror = null; // clean up

      if (opts.logoDataUrl) {
        drawLogo(context, size, opts.logoDataUrl).then(
          () => resolve(canvas),
          (error) => reject(error)
        );
      } else {
        resolve(canvas);
      }
    };
    img.onerror = (error) => {
      img.onload = null; // clean up
      img.onerror = null; // clean up
      reject(error);
    };
    img.src = "data:image/svg+xml;base64," + svg64;
  });
};

export const getQrCodeFilename = (content, title) => {
  let filename = "QR Code for ";
  filename += SanitizeFilename(title || content.replace(/^https?:\/\//, ""), {
    replacement: "_",
  }).slice(0, 100);

  return filename + ".png";
};

export const downloadQrCodeImage = (
  content,
  size,
  title,
  moduleStyle,
  finderStyle,
  opts
) => {
  return createCanvasForQrCode(content, size, moduleStyle, finderStyle, opts)
    .then((canvas) => {
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = getQrCodeFilename(content, title);
      a.click();
    })
    .catch((error) => {
      console.error("Failed to download QR code image:", error);
    });
};

/**
 * Resizes/crops an arbitrary image file into a small square data URL
 * suitable for storing as a QR code logo.
 * @param {File} file
 * @param {number} [targetSize]
 * @returns {Promise<string>}
 */
export function fileToSquareLogoDataUrl(file, targetSize = 200) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      loadImage(reader.result).then((img) => {
        const canvas = document.createElement("canvas");
        canvas.width = targetSize;
        canvas.height = targetSize;
        const context = canvas.getContext("2d");
        const cropSize = Math.min(img.width, img.height);
        const sx = (img.width - cropSize) / 2;
        const sy = (img.height - cropSize) / 2;
        context.drawImage(
          img,
          sx,
          sy,
          cropSize,
          cropSize,
          0,
          0,
          targetSize,
          targetSize
        );
        resolve(canvas.toDataURL("image/png"));
      }, reject);
    };
    reader.readAsDataURL(file);
  });
}
