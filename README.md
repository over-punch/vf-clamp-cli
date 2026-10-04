# @overpunch/vf-clamp-cli

A command-line interface for [`@overpunch/vf-clamp`](https://www.npmjs.com/package/@overpunch/vf-clamp) — restrict variable font axis ranges from the terminal without writing any JavaScript.

![vf-clamp CLI: inspecting a variable font's axes and named instances, then clamping Regular–Bold to a Text WOFF2](https://raw.githubusercontent.com/over-punch/vf-clamp-cli/main/assets/demo.gif?v=1)

## Try it live

Want to see what axis-clamping does before installing anything? **[vfclamp.com](https://vfclamp.com)** is an interactive web demo of the same axis-constraint engine that powers this CLI — upload a variable font, pick named instances or set axis ranges in the browser, and download the restricted result. The CLI runs the identical engine locally and headless for scripting and batch workflows.

> **A range includes the styles between.** Selecting Light and Bold also delivers Regular, Medium and SemiBold, because a variable range is continuous. To hand over only what was bought, select an adjacent run (Light, Regular, Medium, SemiBold, Bold) or export non-adjacent styles separately. The npm package's [`planOutputs()`](https://github.com/over-punch/vf-clamp#selling-named-styles-safely) does this grouping automatically.

## Install

Requires **Node.js 18 or newer**.

```bash
npm install -g @overpunch/vf-clamp-cli
```

## Discovery

```bash
vf-clamp --help              # top-level overview, both subcommands
vf-clamp --version           # also: -v
vf-clamp clamp --help        # subcommand-specific help, examples, axis spec guide
vf-clamp instances --help
```

## Usage

### Inspect a font

List all variable axes and named instances in a font file (TTF, OTF, WOFF, or WOFF2):

```bash
vf-clamp instances MyFont.ttf
vf-clamp instances MyFont.ttf --json     # machine-readable
```

Example output (exact column spacing depends on your font):

```
Axes:
  wght  Weight     100 → 900  (default: 400)
  slnt  Slant      -10 → 0    (default: 0)

Instances (18):
  Thin              wght=100 slnt=0
  ExtraLight        wght=200 slnt=0
  Light             wght=300 slnt=0
  Regular           wght=400 slnt=0
  Medium            wght=500 slnt=0
  SemiBold          wght=600 slnt=0
  Bold              wght=700 slnt=0
  ...
```

### Clamp a font

Produce a restricted VF spanning the hull of named instances:

```bash
vf-clamp clamp MyFont.ttf --instance Light --instance Bold --name Light-Bold
```

Short flags are accepted for every option:

```bash
vf-clamp clamp MyFont.ttf -i Light -i Bold -n Light-Bold
```

Restrict using explicit axis ranges:

```bash
vf-clamp clamp MyFont.ttf -a wght:300:700 -n Custom -f woff2
```

Pin a single axis value, or keep an axis at its full original range:

```bash
vf-clamp clamp MyFont.ttf -a wght:400 -n Regular-Only
vf-clamp clamp MyFont.ttf -i Light -i Bold -a wdth:*       # keep wdth untouched
```

Combine instances and axis overrides:

```bash
vf-clamp clamp MyFont.ttf -i Light -i Bold -a slnt:-5:0 -n LightBold-Slanted
```

Read source font from stdin and pipe results:

```bash
cat MyFont.ttf | vf-clamp clamp - -i Bold -n Bold-only -o ./out
```

Write output to a specific directory:

```bash
vf-clamp clamp MyFont.ttf -i Light -i Bold -o ./dist/fonts
```

When `--name` is omitted, the output filename is derived from the instance names (`Light-Bold`) or axis tags. All names are sanitised for filesystem safety: characters like `/`, `\`, `:`, `..`, ASCII control codes, and Windows reserved device names are stripped or rejected.

### Clamp using a config file

For multiple outputs in one pass, use a JSON config file. All outputs are produced in a single engine invocation — the font is parsed once, not N times.

```bash
vf-clamp clamp MyFont.ttf -c clamp.config.json
```

**clamp.config.json:**

```json
{
  "format": "ttf",
  "outputDir": "./output",
  "outputs": [
    {
      "name": "Light-Bold",
      "instances": ["Light", "Bold"]
    },
    {
      "name": "Condensed",
      "axes": { "wdth": { "min": 50, "max": 75 } }
    },
    {
      "name": "WeightRange-KeepWidth",
      "axes": { "wght": { "min": 100, "max": 700 }, "wdth": null }
    }
  ]
}
```

Each output must specify either `instances`, `axes` (non-empty), or both. Axis values may be a number (pin), `{ "min": …, "max": … }` (range), or `null` (keep full original range).

CLI flags `--instance`, `--axis`, and `--name` are ignored when `--config` is used; a warning is printed to stderr.

## Options

### `vf-clamp instances <font>`

| Argument / Option | Description |
|----------|-------------|
| `<font>` | Path to TTF, OTF, WOFF, or WOFF2 file (or `-` for stdin) |
| `--json` | Print results as JSON to stdout |
| `-q, --quiet` | Suppress progress messages on stderr |
| `--verbose` | Print Python tracebacks on engine errors |

### `vf-clamp clamp <font> [options]`

| Option | Description |
|--------|-------------|
| `<font>` | Path to TTF, OTF, WOFF, or WOFF2 file (or `-` for stdin) |
| `-i, --instance <name>` | Named instance to include (repeatable) |
| `-a, --axis <tag:value>` | Pin an axis to a fixed value |
| `-a, --axis <tag:min:max>` | Restrict an axis to a range |
| `-a, --axis <tag:*>` (or `tag:keep`) | Keep axis at its full original range |
| `-n, --name <name>` | Output name (filename stem; sanitised for filesystem safety) |
| `-f, --format <fmt>` | Output format: `ttf` (default), `otf`, `woff`, `woff2` |
| `-o, --output <dir>` | Output directory (default: current directory) |
| `-c, --config <file>` | JSON config file (for multiple outputs) |
| `--no-force` | Refuse to overwrite existing output files |
| `--dry-run` | Validate inputs without invoking the engine or writing files |
| `--json` | Print results as JSON to stdout |
| `-q, --quiet` | Suppress progress messages on stderr |
| `--verbose` | Print Python tracebacks on engine errors |

## Output and exit codes

For scripting, output paths are written one-per-line to **stdout**; all progress and error messages go to **stderr**:

```bash
vf-clamp clamp MyFont.ttf -i Light -i Bold | xargs -n1 woff2_compress
```

Exit codes follow BSD `sysexits` conventions:

| Code | Meaning |
|------|---------|
| 0 | Success |
| 2 | Usage / validation error (bad flags, malformed `--axis`, missing inputs) |
| 65 | Input data error (bad font, bad JSON config) |
| 66 | Input file missing or unreadable |
| 70 | Internal engine error |
| 78 | Invalid configuration |
| 130 | Aborted by Ctrl-C (SIGINT) |

## Performance Note

The underlying engine uses Pyodide (Python WASM). The first run in a process takes approximately **10–20 seconds** to initialise. Subsequent calls in the same process are **1–2 seconds**. This is expected — plan config-file batching for large workflows so the engine pays cold-start only once.

## Related

- [`@overpunch/vf-clamp`](https://www.npmjs.com/package/@overpunch/vf-clamp) — the core library
- [vfclamp.com](https://vfclamp.com) — web interface

## The vf-clamp family

- [`@overpunch/vf-clamp`](https://github.com/over-punch/vf-clamp): the core npm package and hosted REST API
- [CLI](https://github.com/over-punch/vf-clamp-cli) (this repo) · [Glyphs plugin](https://github.com/over-punch/vf-clamp-glyphs) · [RoboFont extension](https://github.com/over-punch/vf-clamp-robofont) · [VS Code extension](https://github.com/over-punch/vf-clamp-vscode)
- [vfclamp.com](https://vfclamp.com): the interactive demo
- Why it matters: [*Sell the Styles, Ship the Space*](https://vfclamp.com/talk/paper), a survey of 394 foundries with file-size benchmarks and model licence language

## License

MIT © [Liiift Studio](https://overpunch.ca)
