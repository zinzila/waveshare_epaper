import React from 'react';
import { Cpu, Zap, ShieldAlert, CheckCircle2, ArrowRight } from 'lucide-react';

export const HardwareInspector: React.FC = () => {
  return (
    <div id="hardware-inspector-panel" className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-emerald-400" />
          <h2 className="text-base font-semibold text-zinc-100">Hardware & Wiring Reference</h2>
        </div>
        <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">
          Raspberry Pi Pico W / RP2040
        </span>
      </div>

      {/* Pinout Table & Critical Errata */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Pin Table */}
        <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex flex-col gap-3">
          <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Pin Connections (Default Header)</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500">
                  <th className="pb-2 font-medium">Signal</th>
                  <th className="pb-2 font-medium">Pico GP</th>
                  <th className="pb-2 font-medium">Function</th>
                  <th className="pb-2 font-medium">Direction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900 text-zinc-300 font-mono">
                <tr>
                  <td className="py-2 font-bold text-emerald-400">SCK</td>
                  <td className="py-2">GP10</td>
                  <td className="py-2 text-zinc-400">SPI1 Clock</td>
                  <td className="py-2">Output</td>
                </tr>
                <tr>
                  <td className="py-2 font-bold text-emerald-400">MOSI</td>
                  <td className="py-2">GP11</td>
                  <td className="py-2 text-zinc-400">SPI1 TX Data</td>
                  <td className="py-2">Output</td>
                </tr>
                <tr>
                  <td className="py-2 font-bold text-blue-400">CS</td>
                  <td className="py-2">GP9</td>
                  <td className="py-2 text-zinc-400">Chip Select</td>
                  <td className="py-2">Active-Low</td>
                </tr>
                <tr>
                  <td className="py-2 font-bold text-blue-400">DC</td>
                  <td className="py-2">GP8</td>
                  <td className="py-2 text-zinc-400">Data / Command</td>
                  <td className="py-2">0=cmd, 1=data</td>
                </tr>
                <tr>
                  <td className="py-2 font-bold text-amber-400">RST</td>
                  <td className="py-2">GP12</td>
                  <td className="py-2 text-zinc-400">Panel Reset</td>
                  <td className="py-2">Active-Low</td>
                </tr>
                <tr>
                  <td className="py-2 font-bold text-red-400">BUSY</td>
                  <td className="py-2">GP13</td>
                  <td className="py-2 text-zinc-400">Status Readout</td>
                  <td className="py-2 text-amber-400 font-semibold">Active-Low (0=Busy)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* BUSY Polarity & Safety Protection */}
        <div className="flex flex-col gap-3">
          <div className="bg-amber-950/30 border border-amber-800/40 p-3.5 rounded-xl text-xs text-amber-200">
            <div className="flex items-center gap-1.5 font-semibold text-amber-300 mb-1">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span>Corrected BUSY Polarity (Spec §7.3)</span>
            </div>
            <p className="leading-relaxed text-zinc-300">
              Legacy documentation incorrectly suggests <code className="text-amber-300 font-mono">while busy.value() == 1</code>.
              On actual Waveshare GDEW029Z10 panels, BUSY is <strong>active-low</strong>: <code className="text-amber-300 font-mono">0 = busy</code>, <code className="text-amber-300 font-mono">1 = idle</code>.
              The pin is pulled up (<code className="text-emerald-300 font-mono">Pin.IN, Pin.PULL_UP</code>) and re-polls with <code className="text-emerald-300 font-mono">0x71</code> GET_STATUS.
            </p>
          </div>

          <div className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 text-xs">
            <h4 className="font-semibold text-zinc-200 mb-2 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Panel Protection Guarantees</span>
            </h4>
            <ul className="space-y-1.5 text-zinc-400">
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-400">•</span>
                <span><strong>No Continuous Power:</strong> Panel is only energized during <code className="font-mono text-zinc-300">show()</code> and automatically deep sleeps.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-400">•</span>
                <span><strong>Context Manager Safety:</strong> <code className="font-mono text-zinc-300">with Display() as d:</code> calls <code className="font-mono text-zinc-300">sleep()</code> on normal exit and exceptions.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-400">•</span>
                <span><strong>180-second Refresh Throttle:</strong> Enforced by default to prevent physical pigment ghosting or damage.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Register Protocol Flow */}
      <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
        <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-3">
          Controller Register Lifecycle (GDEW029Z10)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800/80">
            <div className="font-mono font-semibold text-emerald-400">1. Power On & Init</div>
            <div className="text-[11px] text-zinc-400 mt-1">
              RST pulse (250ms/10ms/150ms)<br />
              <code className="text-zinc-300">0x04</code> POWER_ON<br />
              <code className="text-zinc-300">0x00</code> PANEL_SETTING (OTP)<br />
              <code className="text-zinc-300">0x61</code> RES: 128×296
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800/80">
            <div className="font-mono font-semibold text-emerald-400">2. Layer Upload</div>
            <div className="text-[11px] text-zinc-400 mt-1">
              <code className="text-zinc-300">0x10</code> DATA_START_1 (4736 B Black)<br />
              <code className="text-zinc-300">0x13</code> DATA_START_2 (4736 B Red)<br />
              Single write transactions per plane
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800/80">
            <div className="font-mono font-semibold text-amber-400">3. Refresh Refresh</div>
            <div className="text-[11px] text-zinc-400 mt-1">
              <code className="text-zinc-300">0x12</code> DISPLAY_REFRESH<br />
              wait_busy() blocks ~15s<br />
              Polling 0x71 with 30s timeout
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800/80">
            <div className="font-mono font-semibold text-purple-400">4. Deep Sleep</div>
            <div className="text-[11px] text-zinc-400 mt-1">
              <code className="text-zinc-300">0x02</code> POWER_OFF<br />
              <code className="text-zinc-300">0x07 [0xA5]</code> DEEP_SLEEP<br />
              2000ms settle &rarr; RST=0
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
