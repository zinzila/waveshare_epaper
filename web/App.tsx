import React, { useState, useEffect } from 'react';
import {
  Monitor,
  Code2,
  Image as ImageIcon,
  Cpu,
  ShieldCheck,
  RotateCcw,
  Type,
  Square,
  Circle as CircleIcon,
  Minus,
  Sparkles,
  RefreshCw,
  Download,
  Layers,
} from 'lucide-react';
import { Color, Orientation, DrawCommand } from './types';
import { DisplayCanvas } from './components/DisplayCanvas';
import { CodeViewer } from './components/CodeViewer';
import { PbmConverter } from './components/PbmConverter';
import { HardwareInspector } from './components/HardwareInspector';
import { TestRunnerView } from './components/TestRunnerView';

export default function App() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'code' | 'converter' | 'hardware' | 'tests'>('simulator');
  const [orientation, setOrientation] = useState<Orientation>('LANDSCAPE');
  const [activeColor, setActiveColor] = useState<Color>('BLACK');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [throttleSeconds, setThrottleSeconds] = useState<number>(0);

  // Drawing state
  const [commands, setCommands] = useState<DrawCommand[]>([]);

  // Pixel grid: black plane & red plane (296x128 max)
  const [pixels, setPixels] = useState<{ black: boolean[][]; red: boolean[][] }>(() => {
    const b: boolean[][] = Array.from({ length: 296 }, () => Array(296).fill(false));
    const r: boolean[][] = Array.from({ length: 296 }, () => Array(296).fill(false));
    return { black: b, red: r };
  });

  // Quick form states
  const [textInput, setTextInput] = useState<string>('Pico e-Paper');
  const [textX, setTextX] = useState<number>(4);
  const [textY, setTextY] = useState<number>(4);
  const [textScale, setTextScale] = useState<number>(2);

  // Initialize with main.py demo
  useEffect(() => {
    loadPreset('main');
  }, []);

  // Throttle timer countdown
  useEffect(() => {
    if (throttleSeconds <= 0) return;
    const timer = setInterval(() => {
      setThrottleSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [throttleSeconds]);

  const getDimensions = () => {
    return orientation === 'LANDSCAPE' ? { w: 296, h: 128 } : { w: 128, h: 296 };
  };

  const executeCommandsOnPixels = (cmds: DrawCommand[], currentOrientation: Orientation) => {
    const dims = currentOrientation === 'LANDSCAPE' ? { w: 296, h: 128 } : { w: 128, h: 296 };
    const b: boolean[][] = Array.from({ length: dims.h }, () => Array(dims.w).fill(false));
    const r: boolean[][] = Array.from({ length: dims.h }, () => Array(dims.w).fill(false));

    const setPixel = (px: number, py: number, color: Color) => {
      if (px < 0 || px >= dims.w || py < 0 || py >= dims.h) return;
      if (color === 'BLACK') {
        b[py][px] = true;
        r[py][px] = false;
      } else if (color === 'RED') {
        b[py][px] = false;
        r[py][px] = true;
      } else {
        // WHITE eraser
        b[py][px] = false;
        r[py][px] = false;
      }
    };

    const drawLine = (x0: number, y0: number, x1: number, y1: number, color: Color) => {
      const dx = Math.abs(x1 - x0);
      const dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      let cx = x0;
      let cy = y0;
      while (true) {
        setPixel(cx, cy, color);
        if (cx === x1 && cy === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          cx += sx;
        }
        if (e2 <= dx) {
          err += dx;
          cy += sy;
        }
      }
    };

    const drawRect = (x: number, y: number, rw: number, rh: number, color: Color, fill: boolean) => {
      if (fill) {
        for (let j = y; j < y + rh; j++) {
          for (let i = x; i < x + rw; i++) {
            setPixel(i, j, color);
          }
        }
      } else {
        for (let i = x; i < x + rw; i++) {
          setPixel(i, y, color);
          setPixel(i, y + rh - 1, color);
        }
        for (let j = y; j < y + rh; j++) {
          setPixel(x, j, color);
          setPixel(x + rw - 1, j, color);
        }
      }
    };

    const drawCircle = (cx: number, cy: number, radius: number, color: Color, fill: boolean) => {
      if (fill) {
        for (let dy = -radius; dy <= radius; dy++) {
          const span = Math.round(Math.sqrt(Math.max(0, radius * radius - dy * dy)));
          for (let dx = -span; dx <= span; dx++) {
            setPixel(cx + dx, cy + dy, color);
          }
        }
      } else {
        for (let deg = 0; deg < 360; deg++) {
          const rad = (deg * Math.PI) / 180;
          const px = Math.round(cx + radius * Math.cos(rad));
          const py = Math.round(cy + radius * Math.sin(rad));
          setPixel(px, py, color);
        }
      }
    };

    // Simple 8x8 font rendering for text
    const drawChar = (char: string, ox: number, oy: number, color: Color, scale: number) => {
      const code = char.charCodeAt(0);
      for (let gy = 0; gy < 8; gy++) {
        for (let gx = 0; gx < 8; gx++) {
          let ink = false;
          if (char === 'P' || char === 'p') {
            if (gx === 0 || (gy === 0 && gx < 6) || (gy === 4 && gx < 6) || (gx === 6 && gy < 4)) ink = true;
          } else if (char === 'i') {
            if ((gx === 2 && gy > 1) || (gx === 2 && gy === 0)) ink = true;
          } else if (char === 'c') {
            if ((gx === 0 && gy > 1 && gy < 7) || (gy === 2 && gx < 6) || (gy === 7 && gx < 6)) ink = true;
          } else if (char === 'o') {
            if ((gx === 0 || gx === 5) && gy > 1 && gy < 7) ink = true;
            if ((gy === 2 || gy === 7) && gx < 6) ink = true;
          } else if (char === 'e' || char === 'E') {
            if (gx === 0 || gy === 0 || gy === 3 || (char === 'E' && gy === 7)) ink = true;
          } else if (char === '2') {
            if (gy === 0 || (gx === 7 && gy < 4) || gy === 4 || (gx === 0 && gy > 4) || gy === 7) ink = true;
          } else if (char === '.') {
            if (gx === 3 && gy === 7) ink = true;
          } else if (char === '9') {
            if (gy === 0 || gy === 4 || gy === 7 || (gx === 0 && gy < 4) || gx === 7) ink = true;
          } else if (char === 'B') {
            if (gx === 0 || gy === 0 || gy === 3 || gy === 7 || (gx === 6 && gy !== 3)) ink = true;
          } else {
            // General glyph heuristic
            if (gy === 0 || gx === 0 || ((code >> (gx % 7)) & 1 && gy === 4)) ink = true;
          }

          if (ink) {
            for (let sy = 0; sy < scale; sy++) {
              for (let sx = 0; sx < scale; sx++) {
                setPixel(ox + gx * scale + sx, oy + gy * scale + sy, color);
              }
            }
          }
        }
      }
    };

    for (const cmd of cmds) {
      if (cmd.type === 'clear') {
        for (let j = 0; j < dims.h; j++) {
          for (let i = 0; i < dims.w; i++) {
            setPixel(i, j, cmd.color);
          }
        }
      } else if (cmd.type === 'pixel') {
        setPixel(cmd.params.x, cmd.params.y, cmd.color);
      } else if (cmd.type === 'line') {
        drawLine(cmd.params.x0, cmd.params.y0, cmd.params.x1, cmd.params.y1, cmd.color);
      } else if (cmd.type === 'rect') {
        drawRect(cmd.params.x, cmd.params.y, cmd.params.w, cmd.params.h, cmd.color, cmd.params.fill);
      } else if (cmd.type === 'circle') {
        drawCircle(cmd.params.x, cmd.params.y, cmd.params.r, cmd.color, cmd.params.fill);
      } else if (cmd.type === 'text') {
        const str = cmd.params.s || '';
        const scale = cmd.params.scale || 1;
        for (let ci = 0; ci < str.length; ci++) {
          drawChar(str[ci], cmd.params.x + ci * 8 * scale, cmd.params.y, cmd.color, scale);
        }
      }
    }

    setPixels({ black: b, red: r });
  };

  const addCommand = (cmd: DrawCommand) => {
    const updated = [...commands, cmd];
    setCommands(updated);
    executeCommandsOnPixels(updated, orientation);
  };

  const handleClear = (color: Color = 'WHITE') => {
    const clearCmd: DrawCommand = {
      id: Math.random().toString(),
      type: 'clear',
      color,
      params: {},
      description: `d.clear(${color})`,
    };
    setCommands([clearCmd]);
    executeCommandsOnPixels([clearCmd], orientation);
  };

  const loadPreset = (preset: 'main' | 'sensor' | 'badge') => {
    const dims = orientation === 'LANDSCAPE' ? { w: 296, h: 128 } : { w: 128, h: 296 };
    let newCmds: DrawCommand[] = [];

    if (preset === 'main') {
      newCmds = [
        { id: '1', type: 'clear', color: 'WHITE', params: {}, description: 'd.clear()' },
        { id: '2', type: 'text', color: 'BLACK', params: { s: 'Pico e-Paper', x: 4, y: 4, scale: 1 }, description: 'd.text("Pico e-Paper", 4, 4, BLACK)' },
        { id: '3', type: 'text', color: 'RED', params: { s: '2.9 inch B', x: 4, y: 18, scale: 2 }, description: 'd.text("2.9 inch B", 4, 18, RED, scale=2)' },
        { id: '4', type: 'line', color: 'BLACK', params: { x0: 0, y0: 38, x1: dims.w - 1, y1: 38 }, description: `d.line(0, 38, d.width - 1, 38, BLACK)` },
        { id: '5', type: 'rect', color: 'BLACK', params: { x: 4, y: 46, w: 55, h: 30, fill: false }, description: 'd.rect(4, 46, 55, 30, BLACK)' },
        { id: '6', type: 'rect', color: 'RED', params: { x: 65, y: 46, w: 55, h: 30, fill: true }, description: 'd.rect(65, 46, 55, 30, RED, fill=True)' },
        { id: '7', type: 'circle', color: 'BLACK', params: { x: 155, y: 61, r: 15, fill: false }, description: 'd.circle(155, 61, 15, BLACK)' },
        { id: '8', type: 'circle', color: 'RED', params: { x: 195, y: 61, r: 15, fill: true }, description: 'd.circle(195, 61, 15, RED, fill=True)' },
        { id: '9', type: 'text', color: 'BLACK', params: { s: 'OK: GDEW029Z10', x: 4, y: 86, scale: 1 }, description: 'd.text("OK: GDEW029Z10", 4, 86, BLACK)' },
      ];
    } else if (preset === 'sensor') {
      newCmds = [
        { id: '1', type: 'clear', color: 'WHITE', params: {}, description: 'd.clear()' },
        { id: '2', type: 'text', color: 'BLACK', params: { s: 'ENV MONITOR', x: 8, y: 6, scale: 1 }, description: 'd.text("ENV MONITOR", 8, 6, BLACK)' },
        { id: '3', type: 'text', color: 'RED', params: { s: '24.8 C', x: 8, y: 22, scale: 3 }, description: 'd.text("24.8 C", 8, 22, RED, scale=3)' },
        { id: '4', type: 'line', color: 'BLACK', params: { x0: 0, y0: 55, x1: dims.w - 1, y1: 55 }, description: 'd.line(0, 55, d.width - 1, 55, BLACK)' },
        { id: '5', type: 'rect', color: 'RED', params: { x: 190, y: 8, w: 96, h: 36, fill: true }, description: 'd.rect(190, 8, 96, 36, RED, fill=True)' },
        { id: '6', type: 'text', color: 'WHITE', params: { s: 'ALERT', x: 205, y: 18, scale: 2 }, description: 'd.text("ALERT", 205, 18, WHITE, scale=2)' },
        { id: '7', type: 'text', color: 'BLACK', params: { s: 'RH: 48%  hPa: 1013', x: 8, y: 65, scale: 1 }, description: 'd.text("RH: 48%  hPa: 1013", 8, 65, BLACK)' },
        { id: '8', type: 'line', color: 'BLACK', params: { x0: 8, y0: 110, x1: 50, y1: 95 }, description: 'd.line(8, 110, 50, 95, BLACK)' },
        { id: '9', type: 'line', color: 'BLACK', params: { x0: 50, y0: 95, x1: 90, y1: 105 }, description: 'd.line(50, 95, 90, 105, BLACK)' },
        { id: '10', type: 'line', color: 'RED', params: { x0: 90, y0: 105, x1: 140, y1: 85 }, description: 'd.line(90, 105, 140, 85, RED)' },
      ];
    } else {
      // Badge
      newCmds = [
        { id: '1', type: 'clear', color: 'WHITE', params: {}, description: 'd.clear()' },
        { id: '2', type: 'rect', color: 'BLACK', params: { x: 2, y: 2, w: dims.w - 4, h: dims.h - 4, fill: false }, description: 'd.rect(2, 2, d.width - 4, d.height - 4, BLACK)' },
        { id: '3', type: 'rect', color: 'RED', params: { x: 6, y: 6, w: dims.w - 12, h: 28, fill: true }, description: 'd.rect(6, 6, d.width - 12, 28, RED, fill=True)' },
        { id: '4', type: 'text', color: 'WHITE', params: { s: 'VISITOR PASS', x: 50, y: 12, scale: 2 }, description: 'd.text("VISITOR PASS", 50, 12, WHITE, scale=2)' },
        { id: '5', type: 'circle', color: 'BLACK', params: { x: 40, y: 70, r: 24, fill: true }, description: 'd.circle(40, 70, 24, BLACK, fill=True)' },
        { id: '6', type: 'circle', color: 'WHITE', params: { x: 40, y: 70, r: 18, fill: true }, description: 'd.circle(40, 70, 18, WHITE, fill=True)' },
        { id: '7', type: 'circle', color: 'RED', params: { x: 40, y: 70, r: 8, fill: true }, description: 'd.circle(40, 70, 8, RED, fill=True)' },
        { id: '8', type: 'text', color: 'BLACK', params: { s: 'DEV: PICO W', x: 80, y: 55, scale: 2 }, description: 'd.text("DEV: PICO W", 80, 55, BLACK, scale=2)' },
        { id: '9', type: 'text', color: 'RED', params: { s: 'LEVEL 4 ACCESS', x: 80, y: 75, scale: 1 }, description: 'd.text("LEVEL 4 ACCESS", 80, 75, RED)' },
      ];
    }

    setCommands(newCmds);
    executeCommandsOnPixels(newCmds, orientation);
  };

  const handleAddText = () => {
    if (!textInput) return;
    addCommand({
      id: Math.random().toString(),
      type: 'text',
      color: activeColor,
      params: { s: textInput, x: textX, y: textY, scale: textScale },
      description: `d.text("${textInput}", ${textX}, ${textY}, ${activeColor}${textScale > 1 ? `, scale=${textScale}` : ''})`,
    });
  };

  const handleAddShape = (type: 'rect' | 'circle', fill: boolean) => {
    if (type === 'rect') {
      addCommand({
        id: Math.random().toString(),
        type: 'rect',
        color: activeColor,
        params: { x: 10, y: 10, w: 60, h: 30, fill },
        description: `d.rect(10, 10, 60, 30, ${activeColor}${fill ? ', fill=True' : ''})`,
      });
    } else {
      addCommand({
        id: Math.random().toString(),
        type: 'circle',
        color: activeColor,
        params: { x: 50, y: 50, r: 20, fill },
        description: `d.circle(50, 50, 20, ${activeColor}${fill ? ', fill=True' : ''})`,
      });
    }
  };

  const handleRefreshSimulate = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      // Start 180s refresh interval protection timer
      setThrottleSeconds(180);
    }, 2200);
  };

  const generatePythonScript = () => {
    let script = 'from epdws.display import Display, BLACK, RED, WHITE\n\n';
    script += `with Display(orientation=${orientation}) as d:\n`;
    for (const cmd of commands) {
      script += `    ${cmd.description}\n`;
    }
    script += '    d.show()  # upload -> refresh -> deep sleep\n';
    return script;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center font-bold text-white shadow-md">
              eP
            </div>
            <div>
              <h1 className="text-sm font-bold text-zinc-100 leading-tight">
                Waveshare Pico e-Paper 2.9 (B)
              </h1>
              <p className="text-[11px] text-zinc-400">
                MicroPython & Python Graphics Library • GDEW029Z10
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center bg-zinc-950/80 p-1 rounded-xl border border-zinc-800 text-xs">
            <button
              id="tab-simulator"
              onClick={() => setActiveTab('simulator')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === 'simulator'
                  ? 'bg-zinc-800 text-emerald-400 font-semibold shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Simulator</span>
            </button>
            <button
              id="tab-code"
              onClick={() => setActiveTab('code')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === 'code'
                  ? 'bg-zinc-800 text-emerald-400 font-semibold shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Library Code</span>
            </button>
            <button
              id="tab-converter"
              onClick={() => setActiveTab('converter')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === 'converter'
                  ? 'bg-zinc-800 text-emerald-400 font-semibold shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>PBM Image Tool</span>
            </button>
            <button
              id="tab-hardware"
              onClick={() => setActiveTab('hardware')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === 'hardware'
                  ? 'bg-zinc-800 text-emerald-400 font-semibold shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Hardware & Wiring</span>
            </button>
            <button
              id="tab-tests"
              onClick={() => setActiveTab('tests')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === 'tests'
                  ? 'bg-zinc-800 text-emerald-400 font-semibold shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Tests (33)</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'simulator' && (
          <div className="space-y-6">
            {/* Top Display Canvas */}
            <DisplayCanvas
              orientation={orientation}
              onOrientationChange={(o) => {
                setOrientation(o);
                executeCommandsOnPixels(commands, o);
              }}
              pixels={pixels}
              onRefreshSimulate={handleRefreshSimulate}
              isRefreshing={isRefreshing}
              throttleSeconds={throttleSeconds}
            />

            {/* Drawing Controls & Code Output */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Interactive Drawing Toolbox */}
              <div className="lg:col-span-6 bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                  <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    <span>Interactive Drawing Toolbox</span>
                  </h3>
                  <div className="flex items-center gap-1">
                    <button
                      id="btn-preset-main"
                      onClick={() => loadPreset('main')}
                      className="text-[11px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium"
                    >
                      main.py Demo
                    </button>
                    <button
                      id="btn-preset-sensor"
                      onClick={() => loadPreset('sensor')}
                      className="text-[11px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium"
                    >
                      Sensor Dashboard
                    </button>
                    <button
                      id="btn-preset-badge"
                      onClick={() => loadPreset('badge')}
                      className="text-[11px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium"
                    >
                      Badge
                    </button>
                  </div>
                </div>

                {/* Color Selection */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Active Color
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      id="btn-color-black"
                      onClick={() => setActiveColor('BLACK')}
                      className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold border transition-all ${
                        activeColor === 'BLACK'
                          ? 'bg-zinc-950 text-white border-zinc-500 ring-2 ring-emerald-500/40'
                          : 'bg-zinc-800 text-zinc-300 border-zinc-700/60 hover:bg-zinc-700'
                      }`}
                    >
                      <span className="w-3 h-3 rounded-full bg-black border border-zinc-500"></span>
                      <span>BLACK</span>
                    </button>
                    <button
                      id="btn-color-red"
                      onClick={() => setActiveColor('RED')}
                      className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold border transition-all ${
                        activeColor === 'RED'
                          ? 'bg-red-950 text-red-200 border-red-600 ring-2 ring-red-500/40'
                          : 'bg-zinc-800 text-zinc-300 border-zinc-700/60 hover:bg-zinc-700'
                      }`}
                    >
                      <span className="w-3 h-3 rounded-full bg-red-600"></span>
                      <span>RED</span>
                    </button>
                    <button
                      id="btn-color-white"
                      onClick={() => setActiveColor('WHITE')}
                      className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold border transition-all ${
                        activeColor === 'WHITE'
                          ? 'bg-zinc-200 text-zinc-900 border-zinc-400 ring-2 ring-emerald-500/40'
                          : 'bg-zinc-800 text-zinc-300 border-zinc-700/60 hover:bg-zinc-700'
                      }`}
                    >
                      <span className="w-3 h-3 rounded-full bg-white border border-zinc-400"></span>
                      <span>WHITE (Eraser)</span>
                    </button>
                  </div>
                </div>

                {/* Text Primitive Form */}
                <div className="bg-zinc-950/60 p-3.5 rounded-xl border border-zinc-800/80 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
                    <span className="flex items-center gap-1.5">
                      <Type className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Text Primitive (d.text)</span>
                    </span>
                    <span className="text-[11px] text-zinc-500">8x8 Built-in Glyph</span>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    <input
                      id="input-text-string"
                      type="text"
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      placeholder="Text to render..."
                      className="col-span-4 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                    />
                    <div>
                      <label className="text-[10px] text-zinc-500 block mb-0.5">X</label>
                      <input
                        id="input-text-x"
                        type="number"
                        value={textX}
                        onChange={(e) => setTextX(Number(e.target.value))}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 block mb-0.5">Y</label>
                      <input
                        id="input-text-y"
                        type="number"
                        value={textY}
                        onChange={(e) => setTextY(Number(e.target.value))}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 block mb-0.5">Scale</label>
                      <select
                        id="select-text-scale"
                        value={textScale}
                        onChange={(e) => setTextScale(Number(e.target.value))}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-1.5 py-1 text-xs text-zinc-200"
                      >
                        <option value={1}>1x (8px)</option>
                        <option value={2}>2x (16px)</option>
                        <option value={3}>3x (24px)</option>
                      </select>
                    </div>
                    <div className="flex items-end">
                      <button
                        id="btn-add-text"
                        onClick={handleAddText}
                        className="w-full py-1 rounded-lg text-xs font-semibold bg-emerald-700/80 hover:bg-emerald-600 text-zinc-100 transition-colors"
                      >
                        Add Text
                      </button>
                    </div>
                  </div>
                </div>

                {/* Shape Quick Add */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    id="btn-add-rect-outline"
                    onClick={() => handleAddShape('rect', false)}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 font-medium"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Rect Outline</span>
                  </button>
                  <button
                    id="btn-add-rect-fill"
                    onClick={() => handleAddShape('rect', true)}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 font-medium"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Rect Filled</span>
                  </button>
                  <button
                    id="btn-add-circle-outline"
                    onClick={() => handleAddShape('circle', false)}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 font-medium"
                  >
                    <CircleIcon className="w-3.5 h-3.5" />
                    <span>Circle Outline</span>
                  </button>
                  <button
                    id="btn-add-circle-fill"
                    onClick={() => handleAddShape('circle', true)}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 font-medium"
                  >
                    <CircleIcon className="w-3.5 h-3.5 fill-current" />
                    <span>Circle Filled</span>
                  </button>
                </div>

                {/* Clear canvas button */}
                <div className="pt-2 border-t border-zinc-800 flex justify-end">
                  <button
                    id="btn-clear-canvas"
                    onClick={() => handleClear('WHITE')}
                    className="flex items-center gap-1 text-xs text-zinc-400 hover:text-red-400 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Clear Canvas (d.clear())</span>
                  </button>
                </div>
              </div>

              {/* Right Column: Live Python Code Output */}
              <div className="lg:col-span-6 bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg flex flex-col justify-between">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                  <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-emerald-400" />
                    <span>Live MicroPython Script</span>
                  </h3>
                  <button
                    id="btn-copy-live-script"
                    onClick={() => navigator.clipboard.writeText(generatePythonScript())}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
                  >
                    Copy Script
                  </button>
                </div>

                <div className="my-3 flex-1 overflow-auto bg-zinc-950 p-3.5 rounded-xl border border-zinc-800/80 font-mono text-xs leading-relaxed text-emerald-300 max-h-[360px]">
                  <pre>{generatePythonScript()}</pre>
                </div>

                <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800 text-xs text-zinc-400 space-y-1">
                  <div className="font-semibold text-zinc-300">Complementary Writes Rule (§4.2)</div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Overdrawing always behaves predictably: painting <code className="text-red-400 font-bold">RED</code> over <code className="text-zinc-200 font-bold">BLACK</code> automatically clears black ink from the black plane. <code className="text-zinc-300 font-bold">WHITE</code> acts as a true eraser on both planes.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'code' && <CodeViewer />}
        {activeTab === 'converter' && <PbmConverter />}
        {activeTab === 'hardware' && <HardwareInspector />}
        {activeTab === 'tests' && <TestRunnerView />}
      </main>

      {/* Footer */}
      <footer className="bg-zinc-900 border-t border-zinc-800 py-4 mt-12 text-center text-xs text-zinc-500">
        <p>Waveshare Pico e-Paper 2.9 (B) Library • MicroPython on Raspberry Pi Pico W • 33/33 Tests Passing</p>
      </footer>
    </div>
  );
}
