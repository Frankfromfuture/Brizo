import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BorderBeam } from "border-beam";
import { ASK_BEAM_PRESET } from "./components/ask-beam-preset.mjs";

// Render at build time: the isolated input shield needs only the component's
// CSS, with no script, preload, network access or React runtime in its page.
export function createUseRunningEffectDocument() {
  const scale = 3.9;
  const beam = renderToStaticMarkup(createElement(BorderBeam, {
    ...ASK_BEAM_PRESET,
    active: true,
    borderRadius: 14 / scale,
    "aria-hidden": true,
  }));
  const beamId = beam.match(/data-beam="([^"]+)"/)[1];
  return `<!doctype html><html><head><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
    <title>Use 运行光效</title>
    </head><body aria-label="Use 自动操作期间页面只读">
    <div id="brizo-use-running-effect" aria-hidden="true">${beam}</div>
    <style>
      html, body {
        width: 100%; height: 100%; margin: 0; overflow: hidden;
        background: transparent; cursor: progress; user-select: none;
      }
      #brizo-use-running-effect {
        position: fixed; inset: 0; overflow: hidden; border-radius: 14px;
        pointer-events: none; contain: strict; isolation: isolate;
      }
      #brizo-use-running-effect [data-beam] {
        /* Scale the package's stroke, gradients, mask and bloom together;
           its 28 px inner falloff becomes 109.2 px. */
        zoom: ${scale}; width: 100%; height: 100%;
      }
      @media (prefers-reduced-motion: reduce) {
        #brizo-use-running-effect [data-beam] {
          --beam-opacity-${beamId}: 1;
          --beam-angle-${beamId}: 120deg;
        }
        #brizo-use-running-effect [data-beam],
        #brizo-use-running-effect [data-beam]::before,
        #brizo-use-running-effect [data-beam]::after,
        #brizo-use-running-effect [data-beam-bloom] {
          animation: none !important;
        }
      }
    </style></body></html>`;
}
