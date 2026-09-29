// Simulated check for the sleep-sheep extension (no pi TUI needed).
// Run: bun test-sheep.ts

import assert from "node:assert";

const ext = await import(new URL("./sheep.ts", import.meta.url).href);

// 1. Rendering: fixed width, sheep and fence present, frames actually change.
const frames = Array.from({ length: 40 }, (_, i) => ext.renderSheep(i));
for (const f of frames) {
	assert.equal(f.length, 7, "every frame has 7 lines");
	for (const line of f) assert.equal(line.length, 60, "every line is 60 wide");
}
assert.ok(frames.some((f) => f.some((l) => l.includes("(ooo)"))), "sheep present");
assert.ok(frames.some((f) => f.some((l) => l.includes("│"))), "fence present");
assert.ok(frames.some((f) => f[1].includes("_")), "sheep rises mid-jump");
for (const f of frames) {
	assert.equal(f.join("\n").split("(ooo)").length - 1, 3, "three sheep per frame");
	assert.ok(
		f.join("").split("│").length - 1 <= 1,
		"no more than one fence per frame",
	);
}
assert.ok(
	frames.some((f) => {
		const rows = new Set(f.flatMap((l, r) => (l.includes("(ooo)") ? [r] : [])));
		return rows.size >= 2;
	}),
	"sheep jump at different times",
);
assert.ok(new Set(frames.map((f) => f.join("\n"))).size > 20, "animation changes over ticks");

// 2. Event wiring: widget appears for sleep, stays for parallel sleeps,
//    clears after the last one, ignores non-sleep bash and non-tui mode.
const handlers: Record<string, Function> = {};
let shown: any;
const makeCtx = (mode = "tui") => ({
	mode,
	hasUI: true,
	ui: { setWidget: (_k: string, v: any) => (shown = v) },
});
ext.default({ on: (n: string, f: Function) => (handlers[n] = f) } as any);
const bash = (id: string, command: string) => ({
	toolCallId: id,
	toolName: "bash",
	args: { command },
});

handlers.tool_execution_start(bash("a", "sleep 2 && echo done"), makeCtx());
assert.ok(shown, "sleep starts the widget");
handlers.tool_execution_start(bash("b", "sleep 1"), makeCtx());
handlers.tool_execution_end({ toolCallId: "a", toolName: "bash" });
assert.ok(shown, "widget stays while a second sleep is still running");
handlers.tool_execution_end({ toolCallId: "b", toolName: "bash" });
assert.equal(shown, undefined, "widget cleared after the last sleep ends");
handlers.tool_execution_start(bash("c", "echo hi there"), makeCtx());
assert.equal(shown, undefined, "non-sleep bash ignored");
handlers.tool_execution_start(bash("d", "sleep 1"), makeCtx("print"));
assert.equal(shown, undefined, "non-tui mode ignored");
handlers.session_shutdown({}, {});
console.log("sheep extension: all checks passed");
process.exit(0);
