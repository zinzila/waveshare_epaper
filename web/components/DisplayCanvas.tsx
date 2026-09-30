import React, { useRef, useEffect, useState } from 'react';
import { ZoomIn, ZoomOut, RefreshCw, Smartphone, Monitor } from 'lucide-react';
import { Color, Orientation } from '../types.ts';

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
  // viewMode: 'logical' (canvas view) vs 'device' (physical handheld module as in user photo)
  const [viewMode, setViewMode] = useState<'logical' | 'device'>('logical');
  const [deviceRotated, setDeviceRotated] = useState<boolean>(false);

  // Logical canvas dimensions
  const logicalWidth = orientation === 'LANDSCAPE' ? 296 : 128;
  const logicalHeight = orientation === 'LANDSCAPE' ? 128 : 296;

  // Active rendering dimensions on the HTML canvas element
  const isPhysicalHandheld = viewMode === 'device' && !deviceRotated;
  const renderWidth = isPhysicalHandheld ? 128 : logicalWidth;
  const renderHeight = isPhysicalHandheld ? 296 : logicalHeight;

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

    canvas.width = renderWidth;
    canvas.height = renderHeight;

    if (isRefreshing) {
      if (refreshPhase === 1) {
        ctx.fillStyle = '#111827'; // Dark flash
        ctx.fillRect(0, 0, renderWidth, renderHeight);
        return;
      } else if (refreshPhase === 2) {
        ctx.fillStyle = '#DC2626'; // Red flash
        ctx.fillRect(0, 0, renderWidth, renderHeight);
        return;
      } else if (refreshPhase === 3) {
        ctx.fillStyle = '#F4F2EB'; // White flush
        ctx.fillRect(0, 0, renderWidth, renderHeight);
        return;
      }
    }

    // Default authentic e-Ink paper background
    ctx.fillStyle = '#F4F2EB';
    ctx.fillRect(0, 0, renderWidth, renderHeight);

    if (isPhysicalHandheld && orientation === 'LANDSCAPE') {
      // Transpose landscape buffer (296x128) onto physical vertical panel (128x296)
      // Matching physical glass scanning when held upright with USB at top:
      // lx goes 0..295 top-to-bottom (py = lx)
      // ly goes 0..127 right-to-left (px = 127 - ly)
      for (let ly = 0; ly < 128; ly++) {
        for (let lx = 0; lx < 296; lx++) {
          const isBlack = pixels.black[ly]?.[lx] ?? false;
          const isRed = pixels.red[ly]?.[lx] ?? false;

          const px = 127 - ly;
          const py = lx;

          if (isRed) {
            ctx.fillStyle = '#DC2626';
            ctx.fillRect(px, py, 1, 1);
          } else if (isBlack) {
            ctx.fillStyle = '#18181B';
            ctx.fillRect(px, py, 1, 1);
          }
        }
      }
    } else {
      // Direct 1:1 pixel rendering for logical view (or native portrait)
      for (let y = 0; y < renderHeight; y++) {
        for (let x = 0; x < renderWidth; x++) {
          const isBlack = pixels.black[y]?.[x] ?? false;
          const isRed = pixels.red[y]?.[x] ?? false;

          if (isRed) {
            ctx.fillStyle = '#DC2626';
            ctx.fillRect(x, y, 1, 1);
          } else if (isBlack) {
            ctx.fillStyle = '#18181B';
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }
    }
  }, [pixels, renderWidth, renderHeight, isRefreshing, refreshPhase, isPhysicalHandheld, orientation]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = renderWidth / rect.width;
    const scaleY = renderHeight / rect.height;
    const cx = Math.floor((e.clientX - rect.left) * scaleX);
    const cy = Math.floor((e.clientY - rect.top) * scaleY);

    if (cx >= 0 && cx < renderWidth && cy >= 0 && cy < renderHeight) {
      if (isPhysicalHandheld && orientation === 'LANDSCAPE') {
        // Map back to logical coordinates for hover inspector
        const lx = cy;
        const ly = 127 - cx;
        setHoverPos({ x: lx, y: ly });
      } else {
        setHoverPos({ x: cx, y: cy });
      }
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
            {renderWidth} × {renderHeight} px
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-red-950/60 border border-red-800/40 text-red-300 font-medium">
            Tri-Color (B/W/R)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle: Logical vs Physical Device */}
          <div className="flex items-center bg-zinc-800 rounded-lg p-1 text-xs">
            <button
              onClick={() => setViewMode('logical')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-medium transition-colors ${
                viewMode === 'logical'
                  ? 'bg-zinc-700 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Logical coordinate canvas as addressed by Python drawing commands"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Logical Canvas</span>
            </button>
            <button
              onClick={() => setViewMode('device')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-medium transition-colors ${
                viewMode === 'device'
                  ? 'bg-emerald-700 text-emerald-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Physical handheld board showing native hardware scan & panel orientation"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Handheld Board (As on Device)</span>
            </button>
          </div>

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
              Landscape
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
              Portrait
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
        <div className="relative flex flex-col items-center">
          {/* Top USB & Flex Cable Representation in Handheld Mode */}
          {isPhysicalHandheld && (
            <div className="flex flex-col items-center mb-1 select-none">
              {/* Black USB Cable */}
              <div className="w-3.5 h-6 bg-zinc-800 rounded-t border-t border-x border-zinc-600 shadow"></div>
              {/* Orange FPC Flex with Green Tape Tab */}
              <div className="relative w-14 h-4 bg-amber-600/90 border border-amber-500 rounded-xs flex items-center justify-center shadow-xs">
                <div className="w-4 h-5 bg-emerald-700 border border-emerald-600 rounded-xs -mt-2"></div>
              </div>
            </div>
          )}

          {/* Physical Glass / Bezel Housing */}
          <div className="relative bg-zinc-800/95 p-3.5 pb-5 rounded-2xl shadow-2xl border-2 border-zinc-700/80 max-w-full overflow-auto">
            {/* Header silkscreen */}
            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mb-2 px-1">
              <span>Waveshare 2.9" e-Paper (B)</span>
              <span>{isPhysicalHandheld ? 'Native Panel: 128×296' : 'GDEW029Z10'}</span>
            </div>

            {/* Glass panel with outer border matching hardware photo */}
            <div className="p-1.5 rounded-lg bg-zinc-900/60 border border-zinc-600/50 shadow-inner">
              <div
                className="border border-zinc-500/80 bg-[#F4F2EB] shadow-inner overflow-hidden flex items-center justify-center relative select-none"
                style={{
                  width: `${renderWidth * zoom}px`,
                  height: `${renderHeight * zoom}px`,
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
            </div>

            {/* Bottom silkscreen & pinout label */}
            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 mt-2 px-1">
              <span>SPI1 (GP8-13) • 3.3V</span>
              <span>{isPhysicalHandheld ? 'Hardware Scan: Top-to-Bottom' : '180s Safety Throttle'}</span>
            </div>
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
              Logical X: <span className="text-emerald-400">{hoverPos.x}</span> Y:{' '}
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
