// sleep-sheep: while a bash "sleep" tool call runs, a tiny ASCII sheep
// hops over a moving fence post in a pi widget above the editor.
//
// Also runs standalone as an animation preview:
//   bun ~/.pi/agent/extensions/sheep.ts        (Ctrl+C to stop)
//   bun ~/.pi/agent/extensions/sheep.ts 20     (print 20 frames)

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const WIDTH = 60;
const ROWS = 7; // rows 0-6: 0-2 air, 3-6 ground level
const TICK_MS = 140;
const SPEED = 2; // fence columns per tick

const N_SHEEP = 3;
const SHEEP_SPACING = 20;
const SHEEP_X0 = 5; // leftmost sheep x

// Fence: a nice little hurdle (2 cols wide, 3 rows tall on rows 4-6)
const FENCE = [
  "─┼─",
  " │ ",
  "─┼─",
];

// Sheep art: 4 rows each. Index 0-1 are walk frames, 2 is tuck (airborne).
const SHEEP_ART = [
  // walk frame 0: legs apart
  [
    "     __  ",
    "  .-'  `-",
    "  `(ooo) ",
    "   / \\/ \\",
  ],
  // walk frame 1: legs together
  [
    "     __  ",
    "  .-'  `-",
    "  `(ooo) ",
    "   || || ",
  ],
  // airborne: legs tucked
  [
    "     __  ",
    "  .-'  `-",
    "  `(ooo) ",
    "    uu uu",
  ],
];

// Smooth jump arc: given how far the fence is from the sheep center,
// return how many rows to lift (0, 1, 2, or 3).
function jumpHeight(fenceCenter: number, sheepCenter: number): number {
  const dist = fenceCenter - sheepCenter;
  // dist > 0 means fence is to the right (approaching)
  // dist < 0 means fence has passed (landing)
  // Approach: rise from dist ~7 down to 0, fall from 0 to ~-7
  const absDist = Math.abs(dist);

  if (absDist > 8) return 0;
  if (absDist > 6) return 1;
  if (absDist > 3) return 2;
  return 3; // peak: right at the fence
}

function isAirborne(height: number): boolean {
  return height >= 2;
}

export function renderSheep(tick: number): string[] {
  // Fixed fence at center; sheep walk right, hop it, and wrap around.
  const fenceX = 28;
  const sheepCycle = WIDTH + 12; // sheep wrap after exiting right

  // Build a 2D character buffer
  const buf: string[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: WIDTH }, () => " "),
  );

  // Draw a ground line on row 6
  for (let c = 0; c < WIDTH; c++) {
    buf[6][c] = "·";
  }

  // Stamp characters into the buffer (later draws overwrite)
  const stamp = (x: number, topRow: number, art: string[]) => {
    for (let r = 0; r < art.length; r++) {
      const row = topRow + r;
      if (row < 0 || row >= ROWS) continue;
      for (let i = 0; i < art[r].length; i++) {
        const col = x + i;
        if (col >= 0 && col < WIDTH && art[r][i] !== " ") {
          buf[row][col] = art[r][i];
        }
      }
    }
  };

  // Draw each sheep
  const fenceCenter = fenceX + 1; // center of the 3-wide fence
  for (let k = 0; k < N_SHEEP; k++) {
    const sx =
      ((SHEEP_X0 + k * SHEEP_SPACING + tick * SPEED) % sheepCycle) - 12;
    const sheepCenter = sx + 4; // roughly the middle of the 9-char-wide art
    const height = jumpHeight(fenceCenter, sheepCenter);

    let art: string[];
    if (isAirborne(height)) {
      art = SHEEP_ART[2]; // tucked legs
    } else {
      art = SHEEP_ART[(tick + k) % 2]; // alternate walk frames
    }

    // Sheep art is 4 rows. At height 0 it sits on rows 3-6.
    // Lifting moves it up by `height` rows.
    const topRow = 3 - height;
    stamp(sx, topRow, art);
  }

  // Draw the fence (3 rows, sitting on ground: rows 4-6)
  stamp(fenceX, 4, FENCE);

  return buf.map((row) => row.join(""));
}

// ── pi extension entry point ──────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  const activeSleeps = new Set<string>();
  let ui: any = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  let tick = 0;
  let frame = renderSheep(0);
  let requestRender: (() => void) | null = null;

  const stop = () => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    requestRender = null;
    ui?.setWidget("sheep", undefined);
    ui = null;
  };

  const start = (ctx: any) => {
    ui = ctx.ui;
    tick = 0;
    frame = renderSheep(0);
    // Component form: lines render verbatim (no Text wrapping), so the
    // widget height stays constant and the layout doesn't bounce.
    ui.setWidget("sheep", (tui: any, _theme: any) => {
      requestRender = () => tui.requestRender();
      return {
        render: (width?: number) => {
          const w = typeof width === "number" ? width : WIDTH;
          return frame.map((l) => l.slice(0, w).padEnd(w, " "));
        },
        invalidate: () => {},
      };
    });
    interval = setInterval(() => {
      frame = renderSheep(tick++);
      requestRender?.();
    }, TICK_MS);
  };

  const isSleepCmd = (cmd: string) =>
    /(^|\s|;|&&|\|\|)(sleep|usleep)\s/.test(cmd);

  pi.on("tool_execution_start", (event, ctx) => {
    if (ctx.mode !== "tui" || !ctx.hasUI) return;
    if (event.toolName !== "bash") return;
    if (!isSleepCmd(event.args?.command ?? "")) return;
    activeSleeps.add(event.toolCallId);
    if (!interval) start(ctx);
  });

  pi.on("tool_execution_end", (event) => {
    if (!activeSleeps.delete(event.toolCallId)) return;
    if (activeSleeps.size === 0) stop();
  });

  pi.on("session_shutdown", () => stop());
}

// ── Standalone preview ────────────────────────────────────────────────

if ((import.meta as { main?: boolean }).main) {
  const tty = process.stdout.isTTY;
  const limit = Number(process.argv[2]) || (tty ? Infinity : 12);
  let tick = 0;
  const id = setInterval(() => {
    const frame = renderSheep(tick++);
    if (tty) {
      const up = tick > 1 ? `\x1b[${ROWS}A\r` : "";
      process.stdout.write(up + frame.join("\n") + "\n");
    } else {
      process.stdout.write(frame.join("\n") + "\n\n");
    }
    if (tick >= limit) {
      clearInterval(id);
      process.exit(0);
    }
  }, TICK_MS);
}
