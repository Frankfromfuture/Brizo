import { useEffect, useRef } from "react";

const GRID_SIZE = 192;
const TARGET_FRAME_INTERVAL = 1000 / 24;
const MAX_PIXEL_RATIO = 1.25;

const VERTEX_SHADER = `#version 300 es
precision highp float;

uniform float uTime;
uniform float uPixelRatio;

out vec4 vColor;

const int GRID = ${GRID_SIZE};

void main() {
  int column = gl_VertexID % GRID;
  int row = gl_VertexID / GRID;
  vec2 uv = vec2(float(column), float(row)) / float(GRID - 1);
  vec2 plane = uv * 2.0 - 1.0;

  float slowTime = uTime * 0.22;
  float waveA = sin(plane.x * 5.4 + slowTime * 1.3);
  float waveB = sin(plane.y * 6.2 - slowTime * 0.92);
  float waveC = sin((plane.x + plane.y) * 3.7 + slowTime * 0.64);
  float waveD = sin(length(plane + vec2(0.24, -0.12)) * 8.0 - slowTime * 0.78);
  float height = waveA * 0.34 + waveB * 0.27 + waveC * 0.23 + waveD * 0.16;

  float depth = uv.y;
  float perspective = mix(0.48, 1.18, depth);
  float x = plane.x * perspective * 1.08;
  float y = mix(0.68, -0.82, depth) + height * mix(0.055, 0.19, depth);
  float edgeFade = smoothstep(1.04, 0.74, abs(x));
  float horizonFade = smoothstep(0.0, 0.16, depth) * smoothstep(1.0, 0.82, depth);

  float shade = clamp(0.5 + height * 0.34 + depth * 0.18, 0.0, 1.0);
  vec3 paleGray = vec3(0.855);
  vec3 softGray = vec3(0.745);
  vec3 color = mix(paleGray, softGray, shade);
  float alpha = mix(0.12, 0.34, depth) * edgeFade * horizonFade;

  vColor = vec4(color, alpha);
  gl_Position = vec4(x, y, 0.0, 1.0);
  gl_PointSize = mix(1.0, 2.15, depth) * uPixelRatio;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;

in vec4 vColor;
out vec4 outColor;

void main() {
  vec2 point = gl_PointCoord * 2.0 - 1.0;
  float distanceFromCenter = dot(point, point);
  if (distanceFromCenter > 1.0) discard;
  float softness = 1.0 - smoothstep(0.28, 1.0, distanceFromCenter);
  outColor = vec4(vColor.rgb, vColor.a * softness);
}`;

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function NewTabParticleBackground({ active }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!active || !canvas) return undefined;

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      powerPreference: "low-power",
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });
    if (!gl) return undefined;

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vertexShader || !fragmentShader) return undefined;

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return undefined;
    }

    const vertexArray = gl.createVertexArray();
    const timeLocation = gl.getUniformLocation(program, "uTime");
    const pixelRatioLocation = gl.getUniformLocation(program, "uPixelRatio");
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    let frameRequest = 0;
    let lastFrameAt = 0;
    let startedAt = performance.now();
    let windowFocused = document.hasFocus();

    gl.useProgram(program);
    gl.bindVertexArray(vertexArray);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      const width = Math.max(1, Math.round(bounds.width * pixelRatio));
      const height = Math.max(1, Math.round(bounds.height * pixelRatio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.uniform1f(pixelRatioLocation, pixelRatio);
    };

    const draw = (now) => {
      frameRequest = 0;
      if (document.hidden || !windowFocused) return;
      if (now - lastFrameAt < TARGET_FRAME_INTERVAL) {
        frameRequest = window.requestAnimationFrame(draw);
        return;
      }
      lastFrameAt = now;
      gl.clearColor(241.0 / 255.0, 241.0 / 255.0, 241.0 / 255.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(timeLocation, (now - startedAt) / 1000);
      gl.drawArrays(gl.POINTS, 0, GRID_SIZE * GRID_SIZE);
      if (!reducedMotion) frameRequest = window.requestAnimationFrame(draw);
    };

    const resume = () => {
      if (frameRequest || document.hidden || !windowFocused) return;
      startedAt += performance.now() - Math.max(lastFrameAt, startedAt);
      frameRequest = window.requestAnimationFrame(draw);
    };
    const handleVisibility = () => {
      if (document.hidden) {
        if (frameRequest) window.cancelAnimationFrame(frameRequest);
        frameRequest = 0;
      } else {
        resume();
      }
    };
    const handleFocus = () => {
      windowFocused = true;
      resume();
    };
    const handleBlur = () => {
      windowFocused = false;
      if (frameRequest) window.cancelAnimationFrame(frameRequest);
      frameRequest = 0;
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();
    draw(performance.now());
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    return () => {
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      if (frameRequest) window.cancelAnimationFrame(frameRequest);
      gl.bindVertexArray(null);
      gl.deleteVertexArray(vertexArray);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [active]);

  if (!active) return null;
  return <canvas className="new-tab-particle-background" ref={canvasRef} aria-hidden="true" />;
}
