import React, { useRef, useEffect, useState } from 'react';
import { Play, RotateCcw, ZoomIn, ZoomOut, Check, RefreshCw, Layers } from 'lucide-react';
import { Color, Orientation } from '../types';

interface DisplayCanvasProps {
  orientation: Orientation;
  onOrientationChange: (o: Orientation) => void;
  pixels: { black: boolean[][]; red: boolean[][] };
  onRefreshSimulate: () => void;
  isRefreshing: boolean;
  throttleSeconds: number;
}

export const DisplayCanvas: React.FC<DisplayCanvasProps> = ({
  orientation,
  onOrientationChange,
  pixels,
  onRefreshSimulate,
  isRefreshing,
  throttleSeconds,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState<number>(2);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [refreshPhase, setRefreshPhase] = useState<number>(0);

  const width = orientation === 'LANDSCAPE' ? 296 : 128;
  const height = orientation === 'LANDSCAPE' ? 128 : 296;

  // Refresh visual animation
  useEffect(() => {
    if (!isRefreshing) {
      setRefreshPhase(0);
      return;
    }
    let phase = 1;
    setRefreshPhase(1);
    const interval = setInterval(() => {
      phase++;
      if (phase > 4) {
        clearInterval(interval);
      } else {
        setRefreshPhase(phase);
      }
    }, 450);
    return () => clearInterval(interval);
  }, [isRefreshing]);

  // Render pixels onto canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    if (isRefreshing) {
      // E-Ink refresh simulation phases
      if (refreshPhase === 1) {
        ctx.fillStyle = '#111827'; // Dark flash
        ctx.fillRect(0, 0, width, height);
        return;
      } else if (refreshPhase === 2) {
        ctx.fillStyle = '#DC2626'; // Red flash
        ctx.fillRect(0, 0, width, height);
        return;
      } else if (refreshPhase === 3) {
        ctx.fillStyle = '#F4F2EB'; // White flush
        ctx.fillRect(0, 0, width, height);
        return;
      }
    }

    // Default authentic e-Ink paper background
    ctx.fillStyle = '#F4F2EB';
    ctx.fillRect(0, 0, width, height);

    // Render ink layers
    // The complementary rule:
    // black has priority if black is true, red has priority if red is true
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const isBlack = pixels.black[y]?.[x] ?? false;
        const isRed = pixels.red[y]?.[x] ?? false;

        if (isRed) {
          ctx.fillStyle = '#DC2626'; // e-Ink Red
          ctx.fillRect(x, y, 1, 1);
        } else if (isBlack) {
          ctx.fillStyle = '#18181B'; // e-Ink Black
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }, [pixels, width, height, isRefreshing, refreshPhase]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);
    if (x >= 0 && x < width && y >= 0 && y < height) {
      setHoverPos({ x, y });
    }
  };

  const handleMouseLeave = () => {
    setHoverPos(null);
  };

  const currentHoverColor = (): Color => {
    if (!hoverPos) return 'WHITE';
    const isRed = pixels.red[hoverPos.y]?.[hoverPos.x];
    if (isRed) return 'RED';
    const isBlack = pixels.black[hoverPos.y]?.[hoverPos.x];
    if (isBlack) return 'BLACK';
    return 'WHITE';
  };

  return (
    <div id="display-canvas-panel" className="flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg">
      {/* Top Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></div>
          <h2 className="text-base font-semibold text-zinc-100">Panel Simulator</h2>
          <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
            {width} × {height} px
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-red-950/60 border border-red-800/40 text-red-300 font-medium">
            Tri-Color (B/W/R)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Orientation Toggle */}
          <div className="flex items-center bg-zinc-800 rounded-lg p-1 text-xs">
            <button
              id="btn-orientation-landscape"
              onClick={() => onOrientationChange('LANDSCAPE')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                orientation === 'LANDSCAPE'
                  ? 'bg-zinc-700 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Landscape (296×128)
            </button>
            <button
              id="btn-orientation-portrait"
              onClick={() => onOrientationChange('PORTRAIT')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                orientation === 'PORTRAIT'
                  ? 'bg-zinc-700 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Portrait (128×296)
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center bg-zinc-800 rounded-lg p-1 text-xs text-zinc-300">
            <button
              id="btn-zoom-out"
              onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
              disabled={zoom <= 1}
              className="p-1 hover:text-zinc-100 disabled:opacity-40"
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 font-mono text-xs">{zoom}x</span>
            <button
              id="btn-zoom-in"
              onClick={() => setZoom((z) => Math.min(4, z + 0.5))}
              disabled={zoom >= 4}
              className="p-1 hover:text-zinc-100 disabled:opacity-40"
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Simulate Refresh / show() */}
          <button
            id="btn-simulate-show"
            onClick={onRefreshSimulate}
            disabled={isRefreshing}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow transition-all ${
              isRefreshing
                ? 'bg-amber-600 text-white cursor-wait'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
            title="Simulates Display.show() with e-ink refresh waveform and deep sleep"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Refreshing Panel...' : 'Simulate show()'}</span>
          </button>
        </div>
      </div>

      {/* Hardware Panel Display Frame */}
      <div className="my-6 flex flex-col items-center justify-center">
        {/* Physical Waveshare Bezel Mockup */}
        <div className="relative bg-zinc-800 p-4 pb-6 rounded-2xl shadow-2xl border border-zinc-700/60 max-w-full overflow-auto">
          {/* Header silkscreen */}
          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mb-2 px-1">
            <span>Waveshare 2.9inch e-Paper (B)</span>
            <span>GDEW029Z10</span>
          </div>

          {/* e-Paper Screen Area */}
          <div
            className="border-2 border-zinc-600 bg-[#F4F2EB] shadow-inner overflow-hidden flex items-center justify-center relative select-none"
            style={{
              width: `${width * zoom}px`,
              height: `${height * zoom}px`,
            }}
          >
            <canvas
              ref={canvasRef}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              className="image-rendering-pixelated cursor-crosshair w-full h-full"
              style={{ imageRendering: 'pixelated' }}
            />

            {/* Refreshing Flash Overlay */}
            {isRefreshing && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-zinc-900/30">
                <div className="bg-zinc-950/80 backdrop-blur-xs text-zinc-100 text-xs font-mono px-3 py-1.5 rounded-md border border-zinc-700 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                  <span>E-Ink Refresh Cycle (Waveform LUT)</span>
                </div>
              </div>
            )}
          </div>

          {/* Bottom silkscreen & pinout label */}
          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 mt-2 px-1">
            <span>SPI1 (GP8-13) • 3.3V</span>
            <span>296×128 • 180s Safety Throttle</span>
          </div>
        </div>
      </div>

      {/* Status Footer & Inspector */}
      <div className="flex flex-wrap items-center justify-between text-xs text-zinc-400 pt-3 border-t border-zinc-800 gap-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#F4F2EB] border border-zinc-400"></span>
            <span>White</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#18181B] border border-zinc-600"></span>
            <span>Black</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626]"></span>
            <span>Red</span>
          </div>
        </div>

        <div className="flex items-center gap-4 font-mono text-xs">
          {hoverPos ? (
            <div className="text-zinc-300">
              X: <span className="text-emerald-400">{hoverPos.x}</span> Y:{' '}
              <span className="text-emerald-400">{hoverPos.y}</span> | Color:{' '}
              <span
                className={
                  currentHoverColor() === 'RED'
                    ? 'text-red-400 font-bold'
                    : currentHoverColor() === 'BLACK'
                    ? 'text-zinc-100 font-bold'
                    : 'text-zinc-400'
                }
              >
                {currentHoverColor()}
              </span>
            </div>
          ) : (
            <span className="text-zinc-500">Hover canvas to inspect pixel coordinates</span>
          )}

          {throttleSeconds > 0 && (
            <div className="flex items-center gap-1 text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40">
              <span>Throttle active: {throttleSeconds}s remaining</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
