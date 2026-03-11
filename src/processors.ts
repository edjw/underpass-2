/*  Underpass is Copyright (C) 2021 Markus Noga

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


class SavingProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];

    if (input.length === 0) return true;

    // Deep copy all channels so the next iteration doesn't overwrite the buffer
    const channelClones: Float32Array[] = [];
    for (let i = 0; i < input.length; i++) {
      channelClones.push(new Float32Array(input[i]));
    }

    this.port.postMessage(channelClones);

    return true;
  }
}

registerProcessor("saving-processor", SavingProcessor);
