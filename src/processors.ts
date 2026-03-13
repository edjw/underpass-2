/*  Underpass is Copyright (C) 2021 Markus Noga
    Underpass 2 is Copyright (C) 2026 Ed Johnson-Williams

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.   */

class RmsDbProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    let rmsSumOfChannels = 0;

    for (let i = 0; i < input.length; i++) {
      const channel = input[i];
      let sqSum = 0;
      for (let j = 0; j < channel.length; j++) {
        const val = channel[j];
        sqSum += val * val;
      }
      const rms = Math.sqrt(sqSum / channel.length);
      rmsSumOfChannels += rms;
    }

    const rmsAverage = rmsSumOfChannels / input.length;
    const db = 20 * Math.log10(Math.max(rmsAverage, 1 / 32768));
    this.port.postMessage(db);

    return true;
  }
}

registerProcessor("rms-db-processor", RmsDbProcessor);


class GatedSavingProcessor extends AudioWorkletProcessor {
  private state: "waiting" | "passing" = "waiting";
  private ringBuffer: Float32Array[][] = [];
  private static readonly PRE_ROLL_FRAMES = 2;
  private static readonly THRESHOLD = 0.01; // ~-40dB peak amplitude

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent) => {
      if (event.data.type === "reset") {
        this.state = "waiting";
        this.ringBuffer = [];
      }
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (input.length === 0) return true;

    // Deep copy all channels so the next iteration doesn't overwrite the buffer
    const channelClones: Float32Array[] = [];
    for (let i = 0; i < input.length; i++) {
      channelClones.push(new Float32Array(input[i]));
    }

    if (this.state === "passing") {
      this.port.postMessage(channelClones);
      return true;
    }

    // Waiting state: check peak amplitude across all channels
    let peak = 0;
    for (let i = 0; i < channelClones.length; i++) {
      const channel = channelClones[i];
      for (let j = 0; j < channel.length; j++) {
        const abs = Math.abs(channel[j]);
        if (abs > peak) peak = abs;
      }
    }

    if (peak >= GatedSavingProcessor.THRESHOLD) {
      // Gate opened — flush pre-roll ring buffer then current frame
      this.state = "passing";
      for (const frame of this.ringBuffer) {
        this.port.postMessage(frame);
      }
      this.ringBuffer = [];
      this.port.postMessage(channelClones);
    } else {
      // Still silent — store in ring buffer, evicting oldest if full
      this.ringBuffer.push(channelClones);
      if (this.ringBuffer.length > GatedSavingProcessor.PRE_ROLL_FRAMES) {
        this.ringBuffer.shift();
      }
    }

    return true;
  }
}

registerProcessor("gated-saving-processor", GatedSavingProcessor);
