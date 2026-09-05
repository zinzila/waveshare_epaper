import React, { useState, useRef } from 'react';
import { Upload, Image as ImageIcon, Download, Copy, Check, Sliders, Layers } from 'lucide-react';

export const PbmConverter: React.FC = () => {
  const [threshold, setThreshold] = useState<number>(128);
  const [redThreshold, setRedThreshold] = useState<number>(160);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [imageName, setImageName] = useState<string>('logo');
  const [hasRed, setHasRed] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [stats, setStats] = useState<{ width: number; height: number; blackBytes: number; redBytes: number }>({
    width: 0,
    height: 0,
    blackBytes: 0,
    redBytes: 0,
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const blackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const redCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const processImage = (img: HTMLImageElement, name: string) => {
    let w = img.width;
    let h = img.height;

    // Constrain to 296 x 128
    if (w > 296 || h > 128) {
      const scale = Math.min(296 / w, 128 / h);
      w = Math.floor(w * scale);
      h = Math.floor(h * scale);
    }

    const sCanvas = sourceCanvasRef.current;
    const bCanvas = blackCanvasRef.current;
    const rCanvas = redCanvasRef.current;
    if (!sCanvas || !bCanvas || !rCanvas) return;

    sCanvas.width = w;
    sCanvas.height = h;
    bCanvas.width = w;
    bCanvas.height = h;
    rCanvas.width = w;
    rCanvas.height = h;

    const sCtx = sCanvas.getContext('2d')!;
    const bCtx = bCanvas.getContext('2d')!;
    const rCtx = rCanvas.getContext('2d')!;

    sCtx.drawImage(img, 0, 0, w, h);
    const imgData = sCtx.getImageData(0, 0, w, h);
    const pixels = imgData.data;

    const bImgData = bCtx.createImageData(w, h);
    const rImgData = rCtx.createImageData(w, h);

    let redDetected = false;

    // Fill white backgrounds
    for (let i = 0; i < bImgData.data.length; i += 4) {
      bImgData.data[i] = 244;
      bImgData.data[i + 1] = 242;
      bImgData.data[i + 2] = 235;
      bImgData.data[i + 3] = 255;

      rImgData.data[i] = 244;
      rImgData.data[i + 1] = 242;
      rImgData.data[i + 2] = 235;
      rImgData.data[i + 3] = 255;
    }

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        const a = pixels[idx + 3];

        if (a < 64) continue;

        // Red detection heuristic
        if (r > redThreshold && g < 100 && b < 100 && r - Math.max(g, b) > 60) {
          redDetected = true;
          rImgData.data[idx] = 220; // Red ink
          rImgData.data[idx + 1] = 38;
          rImgData.data[idx + 2] = 38;
          rImgData.data[idx + 3] = 255;
        } else {
          // Grayscale luminance
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          if (lum < threshold) {
            bImgData.data[idx] = 24; // Black ink
            bImgData.data[idx + 1] = 24;
            bImgData.data[idx + 2] = 27;
            bImgData.data[idx + 3] = 255;
          }
        }
      }
    }

    bCtx.putImageData(bImgData, 0, 0);
    rCtx.putImageData(rImgData, 0, 0);

    const rowBytes = Math.ceil(w / 8);
    const planeBytes = rowBytes * h;

    setHasRed(redDetected);
    setImageName(name);
    setImageLoaded(true);
    setStats({
      width: w,
      height: h,
      blackBytes: planeBytes,
      redBytes: redDetected ? planeBytes : 0,
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const name = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => processImage(img, name);
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const loadSample = (type: 'badge' | 'logo') => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 70;
    const ctx = canvas.getContext('2d')!;

    // White background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 160, 70);

    if (type === 'badge') {
      // Black outline
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeRect(5, 5, 150, 60);

      // Black text
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('WARNING', 40, 28);

      // Red banner icon
      ctx.fillStyle = '#FF0000';
      ctx.beginPath();
      ctx.arc(22, 23, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FF0000';
      ctx.font = '12px sans-serif';
      ctx.fillText('HOT SURFACE', 40, 48);
    } else {
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('WAVESHARE', 10, 35);
      ctx.fillStyle = '#FF0000';
      ctx.fillRect(10, 45, 140, 6);
    }

    const img = new Image();
    img.onload = () => processImage(img, `sample_${type}`);
    img.src = canvas.toDataURL();
  };

  const downloadPbm = (isRed: boolean) => {
    const canvas = isRed ? redCanvasRef.current : blackCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width;
    const h = canvas.height;
    const imgData = ctx.getImageData(0, 0, w, h).data;

    const rowBytes = Math.ceil(w / 8);
    const payload = new Uint8Array(rowBytes * h);

    for (let y = 0; y < h; y++) {
      const rowOffset = y * rowBytes;
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const r = imgData[idx];
        const g = imgData[idx + 1];
        const b = imgData[idx + 2];

        // Is ink? (non-white)
        const isInk = isRed ? r > 180 && g < 100 : r < 100 && g < 100 && b < 100;
        if (isInk) {
          const byteIdx = rowOffset + (x >> 3);
          const bitShift = 7 - (x & 7);
          payload[byteIdx] |= 1 << bitShift;
        }
      }
    }

    const header = `P4\n${w} ${h}\n`;
    const headerBytes = new TextEncoder().encode(header);
    const totalBytes = new Uint8Array(headerBytes.length + payload.length);
    totalBytes.set(headerBytes, 0);
    totalBytes.set(payload, headerBytes.length);

    const blob = new Blob([totalBytes], { type: 'image/x-portable-bitmap' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${imageName}_${isRed ? 'red' : 'black'}.pbm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copySnippet = () => {
    const snippet = `d.image("${imageName}_black.pbm", x=10, y=10, color=BLACK)\n` +
      (hasRed ? `d.image("${imageName}_red.pbm", x=10, y=10, color=RED, transparent=True)\n` : '');
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div id="pbm-converter-panel" className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg flex flex-col gap-5">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-800">
        <div>
          <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-emerald-400" />
            <span>PBM Image Converter (mkimage.py)</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Convert PNG/JPEG to 1-bit PBM P4 layer pairs with automatic black and red plane separation
          </p>
        </div>

        {/* Upload & sample triggers */}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />
          <button
            id="btn-upload-image"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Image</span>
          </button>
          <button
            id="btn-sample-badge"
            onClick={() => loadSample('badge')}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60"
          >
            Sample Badge
          </button>
          <button
            id="btn-sample-logo"
            onClick={() => loadSample('logo')}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60"
          >
            Sample Logo
          </button>
        </div>
      </div>

      {/* Threshold Sliders */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-zinc-950/60 p-4 rounded-xl border border-zinc-800/80 text-xs">
        <div>
          <div className="flex justify-between text-zinc-300 mb-1.5 font-medium">
            <span>Black Ink Luminance Threshold</span>
            <span className="font-mono text-emerald-400">{threshold} / 255</span>
          </div>
          <input
            type="range"
            min="0"
            max="255"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-full accent-emerald-500 cursor-pointer"
          />
          <p className="text-[11px] text-zinc-500 mt-1">
            Pixels darker than this value become black ink.
          </p>
        </div>

        <div>
          <div className="flex justify-between text-zinc-300 mb-1.5 font-medium">
            <span>Red Saturated Ink Threshold</span>
            <span className="font-mono text-red-400">{redThreshold} / 255</span>
          </div>
          <input
            type="range"
            min="100"
            max="255"
            value={redThreshold}
            onChange={(e) => setRedThreshold(Number(e.target.value))}
            className="w-full accent-red-500 cursor-pointer"
          />
          <p className="text-[11px] text-zinc-500 mt-1">
            Red channel sensitivity for separating red ink elements.
          </p>
        </div>
      </div>

      {/* Canvas Previews (Source, Black layer, Red layer) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Source */}
        <div className="bg-zinc-950/80 p-3 rounded-xl border border-zinc-800 flex flex-col items-center">
          <div className="w-full flex items-center justify-between text-xs font-semibold text-zinc-300 pb-2 border-b border-zinc-800/60 mb-2">
            <span>Source Artwork</span>
            {imageLoaded && <span className="font-mono text-[11px] text-zinc-500">{stats.width}×{stats.height}</span>}
          </div>
          <div className="min-h-[120px] flex items-center justify-center w-full bg-[#f4f2eb] rounded-lg p-2 overflow-auto">
            <canvas ref={sourceCanvasRef} className="max-w-full max-h-[140px] shadow-sm rounded" />
            {!imageLoaded && <span className="text-zinc-400 text-xs italic">Click 'Sample Badge' or Upload</span>}
          </div>
        </div>

        {/* Black Layer */}
        <div className="bg-zinc-950/80 p-3 rounded-xl border border-zinc-800 flex flex-col items-center">
          <div className="w-full flex items-center justify-between text-xs font-semibold text-zinc-300 pb-2 border-b border-zinc-800/60 mb-2">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-zinc-900 border border-zinc-600"></span>
              <span>Black Plane (_black.pbm)</span>
            </span>
            {imageLoaded && <span className="font-mono text-[11px] text-zinc-400">{stats.blackBytes} B</span>}
          </div>
          <div className="min-h-[120px] flex items-center justify-center w-full bg-[#f4f2eb] rounded-lg p-2 overflow-auto">
            <canvas ref={blackCanvasRef} className="max-w-full max-h-[140px] shadow-sm rounded" />
            {!imageLoaded && <span className="text-zinc-400 text-xs italic">Awaiting image</span>}
          </div>
          {imageLoaded && (
            <button
              id="btn-download-black-pbm"
              onClick={() => downloadPbm(false)}
              className="mt-3 w-full py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 flex items-center justify-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download {imageName}_black.pbm</span>
            </button>
          )}
        </div>

        {/* Red Layer */}
        <div className="bg-zinc-950/80 p-3 rounded-xl border border-zinc-800 flex flex-col items-center">
          <div className="w-full flex items-center justify-between text-xs font-semibold text-zinc-300 pb-2 border-b border-zinc-800/60 mb-2">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span>
              <span>Red Plane (_red.pbm)</span>
            </span>
            {imageLoaded && (
              <span className="font-mono text-[11px] text-red-400">
                {hasRed ? `${stats.redBytes} B` : 'No red detected'}
              </span>
            )}
          </div>
          <div className="min-h-[120px] flex items-center justify-center w-full bg-[#f4f2eb] rounded-lg p-2 overflow-auto">
            <canvas ref={redCanvasRef} className="max-w-full max-h-[140px] shadow-sm rounded" />
            {!imageLoaded && <span className="text-zinc-400 text-xs italic">Awaiting image</span>}
          </div>
          {imageLoaded && hasRed && (
            <button
              id="btn-download-red-pbm"
              onClick={() => downloadPbm(true)}
              className="mt-3 w-full py-1.5 rounded-lg text-xs font-medium bg-red-950 hover:bg-red-900 border border-red-800 text-red-200 flex items-center justify-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download {imageName}_red.pbm</span>
            </button>
          )}
        </div>
      </div>

      {/* MicroPython Code Snippet */}
      {imageLoaded && (
        <div className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
            <span>Generated MicroPython Code</span>
            <button
              id="btn-copy-image-snippet"
              onClick={copySnippet}
              className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy snippet'}</span>
            </button>
          </div>
          <pre className="font-mono text-xs text-emerald-400 bg-zinc-900 p-2.5 rounded-lg overflow-x-auto">
            <code>
              {`d.image("${imageName}_black.pbm", x=10, y=10, color=BLACK)`}
              {hasRed ? `\nd.image("${imageName}_red.pbm", x=10, y=10, color=RED, transparent=True)` : ''}
            </code>
          </pre>
        </div>
      )}
    </div>
  );
};
