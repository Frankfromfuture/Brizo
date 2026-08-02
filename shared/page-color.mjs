function clampChannel(value) {
  return Math.min(255, Math.max(0, Number(value) || 0));
}

function parseAlpha(value) {
  if (value == null || value === "") return 1;
  const text = String(value).trim();
  const parsed = Number.parseFloat(text);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(1, Math.max(0, text.endsWith("%") ? parsed / 100 : parsed));
}

export function parseCssColor(value) {
  const color = String(value || "").trim().toLowerCase();
  if (!color) return null;
  if (color === "black") return { alpha: 1, blue: 0, green: 0, red: 0 };
  if (color === "white") return { alpha: 1, blue: 255, green: 255, red: 255 };
  if (color === "transparent") return { alpha: 0, blue: 0, green: 0, red: 0 };

  const hex = color.match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i)?.[1];
  if (hex) {
    const expanded = hex.length <= 4
      ? [...hex].map((character) => character.repeat(2)).join("")
      : hex;
    return {
      red: Number.parseInt(expanded.slice(0, 2), 16),
      green: Number.parseInt(expanded.slice(2, 4), 16),
      blue: Number.parseInt(expanded.slice(4, 6), 16),
      alpha: expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
    };
  }

  const rgb = color.match(
    /^rgba?\(\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/,
  );
  if (rgb) {
    const channel = (text) => clampChannel(
      text.endsWith("%") ? Number.parseFloat(text) * 2.55 : Number.parseFloat(text),
    );
    return {
      red: channel(rgb[1]),
      green: channel(rgb[2]),
      blue: channel(rgb[3]),
      alpha: parseAlpha(rgb[4]),
    };
  }

  const srgb = color.match(
    /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/,
  );
  if (!srgb) return null;
  return {
    red: clampChannel(Number.parseFloat(srgb[1]) * 255),
    green: clampChannel(Number.parseFloat(srgb[2]) * 255),
    blue: clampChannel(Number.parseFloat(srgb[3]) * 255),
    alpha: parseAlpha(srgb[4]),
  };
}

export function shouldUseLightForeground(value) {
  const parsed = parseCssColor(value);
  if (!parsed) return false;

  const composite = [parsed.red, parsed.green, parsed.blue].map((channel) =>
    channel * parsed.alpha + 255 * (1 - parsed.alpha));
  const [red, green, blue] = composite.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

  return (1.05 / (luminance + 0.05)) > ((luminance + 0.05) / 0.05);
}
