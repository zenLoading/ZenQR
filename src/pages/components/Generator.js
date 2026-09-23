import { clipboard, tabs, apiNs } from "../../utils/compat";

import {
  useEffect,
  useState,
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from "react";
import { PropTypes } from "prop-types";

import { T, TT } from "../../utils/i18n";
import {
  useTemporaryState,
  useEffectiveDarkMode,
  useSettingsContext,
} from "../../utils/hooks";
import { debouncer } from "../../utils/misc";
import { addHistory } from "../../utils/history";
import QRCodeSVG from "./QRCodeSVG";
import { finderStyleNames, moduleStyleNames } from "../../utils/qrcode-gen";
import {
  createCanvasForQrCode,
  downloadQrCodeImage,
} from "../../utils/qrcode-image";
import GeneratorOptions from "./GeneratorOptions";
import TemplateBuilder from "./TemplateBuilder";

const Generator = forwardRef(function Generator(props, ref) {
  const { settings } = useSettingsContext();
  const [content, setContent] = useState(props.content || "");
  const [title, setTitle] = useState(props.title || "");
  const [copied, setCopied] = useTemporaryState(false, 3000);
  const resultNode = useRef(null);
  const addHistoryDebouncer = useRef(debouncer(1000));
  const isDarkMode = useEffectiveDarkMode(settings);
  const [showGeneratorOptions, setShowGeneratorOptions] = useState(false);
  const [showTemplateBuilder, setShowTemplateBuilder] = useState(false);
  const logoOpts =
    settings?.qrCodeLogoEnabled && settings?.qrCodeLogoDataUrl
      ? { logoDataUrl: settings.qrCodeLogoDataUrl }
      : {};

  useImperativeHandle(ref, () => ({
    setContentAndTitle: (content, title) => {
      setContent(content || "");
      setTitle(title || "");
    },
  }));

  useEffect(() => {
    if (!content) {
      return;
    }
    if (content === props.content) {
      addHistory("encode", content);
      return;
    }
    const debouncer = addHistoryDebouncer.current;
    debouncer.debounce(() => {
      addHistory("encode", content);
    });

    return () => {
      if (debouncer) debouncer.cancel();
    };
  }, [content, props.content]);

  const copyImage = useCallback(() => {
    createCanvasForQrCode(
      content,
      settings?.qrCodeImageSize,
      settings?.qrCodeModuleStyle,
      settings?.qrCodeFinderStyle,
      logoOpts
    )
      .then((canvas) => clipboard.copyPng(canvas))
      .then(() => setCopied(true))
      .catch((error) => {
        console.error("Failed to copy QR code image:", error);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, setCopied, settings?.qrCodeFinderStyle, settings?.qrCodeImageSize, settings?.qrCodeModuleStyle, settings?.qrCodeLogoEnabled, settings?.qrCodeLogoDataUrl]);

  const handleClickDownload = useCallback(() => {
    downloadQrCodeImage(
      content,
      settings?.qrCodeImageSize,
      title,
      settings?.qrCodeModuleStyle || moduleStyleNames[0],
      settings?.qrCodeFinderStyle || finderStyleNames[0],
      logoOpts
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, settings?.qrCodeFinderStyle, settings?.qrCodeImageSize, settings?.qrCodeModuleStyle, settings?.qrCodeLogoEnabled, settings?.qrCodeLogoDataUrl, title]);

  const openBatchGenerator = useCallback(() => {
    tabs.create({ url: apiNs.runtime.getURL("pages/batch.html") });
  }, []);

  // handle dark mode & related settings
  const needsWhiteBacking =
    isDarkMode && !settings?.whiteOnBlackQRCodeInDarkMode;
  const svgProps =
    isDarkMode && settings?.whiteOnBlackQRCodeInDarkMode
      ? { foregroundColor: "white", backgroundColor: "transparent" }
      : { foregroundColor: "black", backgroundColor: "transparent" };

  return (
    <div class={"main" + (props.hidden ? " hidden" : "")} id="main">
      <textarea
        class="source"
        id="sourceInput"
        title={T("content_title")}
        spellCheck="false"
        placeholder={T("content_placeholder")}
        value={content}
        onBlur={() => {
          //  skip debouncer and commit history immediately
          addHistoryDebouncer.current.cancel();
          addHistory("encode", content);
        }}
        onChange={(e) => {
          setContent(e.target.value);
          setTitle("");
        }}
        onPaste={(e) => {
          // avoid getting caught by global paste event listener
          e.stopPropagation();
        }}
      ></textarea>
      <div class="necker-container">
        <div class="necker length-view">
          <span title={T("content_length_label_title")}>
            {TT("content_length_label")}
            <span class="counter" id="counter">
              {content.length}
            </span>
          </span>
        </div>
        <div class="necker">
          <span
            class="clickable"
            title={T("batch_generator_link_title")}
            onClick={openBatchGenerator}
          >
            <img class="icon icon-invert" src="../icons/batch.svg" />
            {TT("batch_generator_link_label")}
          </span>
          <span
            class="clickable"
            title={T("toggle_template_builder_btn_title")}
            onClick={() => {
              setShowTemplateBuilder(!showTemplateBuilder);
              setShowGeneratorOptions(false);
            }}
          >
            <img class="icon icon-invert" src="../icons/template.svg" />
            {T("toggle_template_builder_btn_label")}
          </span>
          <span class="clickable" title={T("toggle_generator_options_btn_title")} onClick={() => { setShowGeneratorOptions(!showGeneratorOptions); setShowTemplateBuilder(false); }}>
            {T("toggle_generator_options_btn_label")}
            <img class={`icon icon-invert ${showGeneratorOptions ? "rotate-180" : ""}`} src="../icons/arrow-d.svg" />
          </span>
        </div>
      </div>
      <div class="necker-container">
        {showGeneratorOptions && <GeneratorOptions />}
        {showTemplateBuilder && (
          <TemplateBuilder
            onApply={(templateContent, templateTitle) => {
              setContent(templateContent);
              setTitle(templateTitle);
              setShowTemplateBuilder(false);
            }}
          />
        )}
      </div>
      <div
        class={"result" + (needsWhiteBacking ? " result-white-backing" : "")}
        id="result"
        ref={resultNode}
      >
        <QRCodeSVG
          finderStyle={settings?.qrCodeFinderStyle || finderStyleNames[0]}
          moduleStyle={settings?.qrCodeModuleStyle || moduleStyleNames[0]}
          content={content}
          width={300}
          height={300}
          errorCorrectionLevel={settings?.ecLevel}
          {...svgProps}
        ></QRCodeSVG>
        {content && logoOpts.logoDataUrl && (
          <img class="qr-logo-overlay" src={logoOpts.logoDataUrl} />
        )}
      </div>
      <div class="footer-container">
        <div class="footer actions1">
          {content && (
            <span
              class="clickable"
              id="save"
              title={T("save_image_btn_title")}
              onClick={handleClickDownload}
            >
              <img class="icon icon-invert" src="../icons/save.svg" />
              {TT("save_image_btn")}
            </span>
          )}
        </div>
        <div class="footer actions2">
          {content && (
            <>
              {!copied ? (
                <span
                  class="clickable"
                  id="copy"
                  title={T("copy_image_btn_title")}
                  onClick={copyImage}
                >
                  <img class="icon icon-invert" src="../icons/copy.svg" />
                  {TT("copy_image_btn")}
                </span>
              ) : (
                <span class="" id="copied">
                  {TT("copy_image_ok")}
                </span>
              )}
            </>
          )}
        </div>
        <div class="footer actions3">
          <a
            class="clickable"
            target="_blank"
            href="https://github.com/zenLoading/ZenQR"
            rel="noreferrer"
            title={T("github_link_title")}
          >
            <img class="icon icon-invert" src="../icons/code.svg" />v
            {TT("version")}
          </a>
        </div>
      </div>
    </div>
  );
});

Generator.propTypes = {
  content: PropTypes.string,
  title: PropTypes.string,
  hidden: PropTypes.bool,
  ref: PropTypes.any,
};

export default Generator;
