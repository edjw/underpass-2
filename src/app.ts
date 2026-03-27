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

import "./app.css";
import { createIcons, AudioLines, Circle, CircleHelp, Square, X, Scale, Github } from "lucide";

// AudioWorklet processors run in a separate thread — they must be loaded by URL.
// Vite builds processors.ts as a separate entry point (see vite.config.ts).
const processorsUrl = import.meta.env.DEV ? "/src/processors.ts" : "/processors.js";

// Render static Lucide icons in the DOM
createIcons({
  icons: { AudioLines, Circle, CircleHelp, Square, X, Scale, Github },
});

// Fail fast if the HTML is missing expected elements
function requireElement<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing required element: ${selector}`);
  return el;
}

let audioContext: AudioContext | null = null;
let activeStream: MediaStream | null = null;

const enableAudioButton = requireElement<HTMLButtonElement>("button#enableAudio");
const mainControlsSection = requireElement<HTMLElement>("section#mainControls");

function initAudioAndMidi() {
  enableAudioButton.style.display = "none";
  mainControlsSection.classList.remove("hidden");
  navigator.mediaDevices.ondevicechange?.(new Event("devicechange"));
  navigator.requestMIDIAccess({ sysex: true }).then(midiAccessSuccess).catch(function (err: DOMException) {
    if (err.name === "SecurityError" && err.message.includes("add-on")) {
      alert("Firefox requires a site permission add-on for Web MIDI SysEx. Please use Chrome, Edge, Brave, or install the required Firefox add-on.");
    } else {
      alert("Cannot access MIDI devices. Ensure your device is connected and permissions are granted.\n\nError " + err.name + ": " + err.message);
    }
  });
}

// Skip the enable button if microphone permission was already granted.
// We still call getUserMedia because Firefox needs an active stream to enumerate real device labels.
navigator.permissions.query({ name: "microphone" as PermissionName }).then((status) => {
  if (status.state === "granted") {
    navigator.mediaDevices.getUserMedia({ video: false, audio: true }).then((stream) => {
      stream.getTracks().forEach(t => t.stop());
      initAudioAndMidi();
    }).catch(() => {
      // Permission was granted but getUserMedia failed — fall back to button
    });
  }
}).catch(() => {
  // Permissions API not supported — fall back to button
});

enableAudioButton.onclick = function () {
  navigator.mediaDevices.getUserMedia({ video: false, audio: true }).then((stream) => {
    stream.getTracks().forEach(t => t.stop());
    initAudioAndMidi();
  }).catch((err: Error) => {
    console.log("error enabling audio:" + err);
    alert("Cannot enable audio in this browser:" + err);
  });
};


// Audio devices
//
const audioInputSelect = requireElement<HTMLSelectElement>("select#audioInput");

function audioInputChanged() {
  const audioSource = audioInputSelect.value;
  let audioSourceName = "undefined";
  if (audioInputSelect.options[audioInputSelect.selectedIndex])
    audioSourceName = audioInputSelect.options[audioInputSelect.selectedIndex].text;
  console.log("New audio source: " + audioSourceName);
  const constraints: MediaStreamConstraints = {
    audio: {
      deviceId: audioSource ? { exact: audioSource } : undefined,
      sampleRate: { exact: 48000 },
      sampleSize: { exact: 16 },
    },
  };

  navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
    if (activeStream) {
      activeStream.getTracks().forEach(t => t.stop());
    }
    activeStream = stream;
    recorderInit(stream);
  }).catch((err: Error) => {
    alert("Unable to access audio.\n\n" + err);
    console.log("Unable to access audio: " + err);
  });
}

audioInputSelect.onchange = audioInputChanged;

function enumerateDevicesSuccess(deviceInfos: MediaDeviceInfo[]) {
  const previousValue = audioInputSelect.value;
  while (audioInputSelect.firstChild) {
    audioInputSelect.removeChild(audioInputSelect.firstChild);
  }
  for (let i = 0; i !== deviceInfos.length; ++i) {
    const deviceInfo = deviceInfos[i];
    if (deviceInfo.kind !== "audioinput") continue;

    const option = document.createElement("option");
    option.value = deviceInfo.deviceId;
    option.text = deviceInfo.label || `audio input ${audioInputSelect.length + 1}`;
    audioInputSelect.appendChild(option);
  }
  audioInputSelect.value = "";
  if (previousValue) {
    for (let i = 0; i < audioInputSelect.options.length; i++) {
      if (audioInputSelect.options[i].value === previousValue) {
        audioInputSelect.value = previousValue;
        break;
      }
    }
  }
  if (!audioInputSelect.value) {
    for (let i = 0; i < audioInputSelect.options.length; i++) {
      if (audioInputSelect.options[i].text.includes("Model:Samples")) {
        audioInputSelect.value = audioInputSelect.options[i].value;
        break;
      }
    }
  }
  if (audioInputSelect.value !== previousValue && audioInputSelect.onchange)
    audioInputSelect.onchange(new Event("change"));
}

navigator.mediaDevices.ondevicechange = function () {
  navigator.mediaDevices.enumerateDevices().then(enumerateDevicesSuccess).catch(function (err: DOMException) {
    alert("Cannot select audio devices in this browser. Ensure permissions are granted. Error " + err.name + ": " + err.message);
  });
};


// MIDI devices
// See https://www.midi.org/specifications/midi1-specifications/m1-v4-2-1-midi-1-0-detailed-specification-96-1-4
//

let midiAccess: MIDIAccess | null = null;
let midiFromDevice: MIDIInput | null = null;
let midiToDevice: MIDIOutput | null = null;

const midiFromDeviceSelect = requireElement<HTMLSelectElement>("select#midiFromDevice");
const midiToDeviceSelect = requireElement<HTMLSelectElement>("select#midiToDevice");
const midiSelectors = [midiFromDeviceSelect, midiToDeviceSelect];


function midiFromDeviceChanged() {
  const sel = midiFromDeviceSelect.value;
  const oldMidiFromDevice = midiFromDevice;
  midiFromDevice = midiAccess!.inputs.get(sel) ?? null;
  if (oldMidiFromDevice && oldMidiFromDevice !== midiFromDevice)
    oldMidiFromDevice.onmidimessage = null;
  if (midiFromDevice) {
    console.log("New MIDI from device: " + midiFromDevice.name);
    midiFromDevice.onmidimessage = midiInputMessage;
  } else {
    console.log("No MIDI from device");
  }
}

midiFromDeviceSelect.onclick = midiFromDeviceChanged;
midiFromDeviceSelect.onchange = midiFromDeviceChanged;

function midiToDeviceChanged() {
  const sel = midiToDeviceSelect.value;
  midiToDevice = midiAccess!.outputs.get(sel) ?? null;
  if (midiToDevice)
    console.log("New MIDI to device: " + midiToDevice.name);
  else
    console.log("No MIDI to device");
}

midiToDeviceSelect.onclick = midiToDeviceChanged;
midiToDeviceSelect.onchange = midiToDeviceChanged;


function midiAccessSuccess(ma: MIDIAccess) {
  midiAccess = ma;

  const values = midiSelectors.map(select => select.value);
  midiSelectors.forEach(select => {
    while (select.firstChild) {
      select.removeChild(select.firstChild);
    }
  });
  ma.inputs.forEach(function (input, port) {
    const option = document.createElement("option");
    option.value = port;
    option.text = input.name ?? port;
    midiFromDeviceSelect.appendChild(option);
  });
  ma.outputs.forEach(function (output, port) {
    const option = document.createElement("option");
    option.value = port;
    option.text = output.name ?? port;
    midiToDeviceSelect.appendChild(option);
  });
  midiSelectors.forEach((select, selectorIndex) => {
    const val = values[selectorIndex];
    select.value = "";
    if (val) {
      for (let i = 0; i < select.options.length; i++) {
        if (select.options[i].value === val) {
          select.value = val;
          break;
        }
      }
    }
    if (!select.value) {
      for (let i = 0; i < select.options.length; i++) {
        if (select.options[i].text.includes("Model:Samples")) {
          select.value = select.options[i].value;
          break;
        }
      }
    }
    if (select.value !== val && select.onchange)
      select.onchange(new Event("change"));
  });

  midiAccess.onstatechange = function () { midiAccessSuccess(midiAccess!); };
}

let midiSampleDumpPackets: Uint8Array[] = [];
let midiSampleDumpHeader: Uint8Array | null = null;
let midiSampleDumpPacketsTotal = 0;
let midiSampleDumpPacketsSent = 0;
let midiSampleDumpPacketsAcknowledged = 0;

let midiTransferActive = false;
let midiTransferNakCount = 0;
let midiTransferTimeout: ReturnType<typeof setTimeout> | null = null;
const MIDI_TRANSFER_TIMEOUT_MS = 2000;
const MIDI_WAIT_TIMEOUT_MS = 10000;
let currentDeviceID = 0;

function clearMidiTimeout() {
  if (midiTransferTimeout) {
    clearTimeout(midiTransferTimeout);
    midiTransferTimeout = null;
  }
}

function startMidiTimeout() {
  clearMidiTimeout();
  midiTransferTimeout = setTimeout(() => {
    console.error("MIDI Transfer Timeout");
    abortMidiTransfer("Error: Device timeout");
  }, MIDI_TRANSFER_TIMEOUT_MS);
}

function abortMidiTransfer(reason: string) {
  clearMidiTimeout();
  midiTransferActive = false;
  if (recCurStatusNode) recCurStatusNode.textContent = reason;
  resetRecordButton();
  midiSampleDumpPacketsSent = midiSampleDumpPacketsTotal; // Stop sending
}

function midiSendSampleName(deviceID: number, sampleNumber: number, name: string) {
  const nameBytes = new TextEncoder().encode(name.substring(0, 127));
  const len = nameBytes.length;
  
  const payload = new Uint8Array(9 + len);
  payload[0] = 0xf0;
  payload[1] = 0x7e;
  payload[2] = deviceID & 0x7f;
  payload[3] = 0x05;
  payload[4] = 0x03;
  payload[5] = sampleNumber & 0x7f;
  payload[6] = (sampleNumber >> 7) & 0x7f;
  payload[7] = len & 0x7f;
  
  for (let i = 0; i < len; i++) {
    payload[8 + i] = nameBytes[i] & 0x7f;
  }
  
  payload[8 + len] = 0xf7;
  
  if (!midiToDevice) return;
  midiToDevice.send(payload);
  console.log("Sent Sample Name SysEx:", name);
}

function finishMidiTransfer() {
  clearMidiTimeout();
  midiTransferActive = false;
  const sampleID = Math.max(0, Math.min(16383, parseInt(sampleIDInput.value) || 0));
  const sampleName = sampleNameInput.value.trim() || `SAMP-${String(sampleID).padStart(2, '0')}`;
  midiSendSampleName(currentDeviceID, sampleID, sampleName);

  console.log("Data transfer complete");
  if (recCurStatusNode) recCurStatusNode.textContent = "Uploaded";
  resetRecordButton();
  sampleIDInput.value = String(sampleID + 1);
}

function midiInputMessage(event: MIDIMessageEvent) {
  const d = event.data!;
  if (d.length !== 6 || d[0] !== 0xf0 || d[1] !== 0x7e || d[5] !== 0xf7) {
    console.log("Ignoring unknown MIDI message " + midiMessageToString(d));
    return;
  }
  
  currentDeviceID = d[2];

  if (d[3] === 0x7f) { // ACK
    clearMidiTimeout();
    midiTransferNakCount = 0;
    midiSampleDumpPacketsAcknowledged++;
    const progress = midiSampleDumpPacketsAcknowledged / midiSampleDumpPacketsTotal;
    recorderShowMidiSDProgress(progress);

    if (midiSampleDumpPacketsSent < midiSampleDumpPacketsTotal) {
      if (!midiToDevice) { abortMidiTransfer("Error: MIDI output lost"); return; }
      midiToDevice.send(midiSampleDumpPackets[midiSampleDumpPacketsSent - 1]);
      midiSampleDumpPacketsSent++;
      startMidiTimeout();
    } else if (recCurStatusNode && recCurStatusNode.textContent !== "Uploaded") {
      finishMidiTransfer();
    }
  } else if (d[3] === 0x7e) { // NAK
    clearMidiTimeout();
    midiTransferNakCount++;
    if (midiTransferNakCount >= 5) {
      abortMidiTransfer("Error: Transfer corrupted (Too many NAKs)");
      return;
    }
    console.log("Received NAK, resending packet...");
    if (!midiToDevice) { abortMidiTransfer("Error: MIDI output lost"); return; }
    if (midiSampleDumpPacketsSent === 1 && midiSampleDumpHeader) {
      midiToDevice.send(midiSampleDumpHeader);
    } else if (midiSampleDumpPacketsSent > 1) {
      midiToDevice.send(midiSampleDumpPackets[midiSampleDumpPacketsSent - 2]);
    }
    startMidiTimeout();
  } else if (d[3] === 0x7d) { // CANCEL
    clearMidiTimeout();
    abortMidiTransfer("Cancelled by device");
  } else if (d[3] === 0x7c) { // WAIT
    clearMidiTimeout();
    midiTransferTimeout = setTimeout(() => {
      console.error("MIDI device did not resume after WAIT");
      abortMidiTransfer("Error: Device did not resume");
    }, MIDI_WAIT_TIMEOUT_MS);
  } else {
    console.log("Ignoring unknown MIDI message " + midiMessageToString(d));
  }
}

function midiSendSampleDump(sampleNumber: number, sampleRate: number, samples: Float32Array) {
  const header = newMidiSDHeader(0, sampleNumber, 16, sampleRate, samples.length, 0, samples.length - 1, 0x7f);
  const packets = newMidiSDDataPackets(0, 16, samples);

  recorderShowMidiSDProgress(0);
  midiTransferActive = true;
  midiSampleDumpPackets = packets;
  midiSampleDumpHeader = header;
  midiSampleDumpPacketsTotal = packets.length + 1;
  midiSampleDumpPacketsSent = 1;
  midiSampleDumpPacketsAcknowledged = 0;
  currentDeviceID = 0;
  if (!midiToDevice) return;
  midiToDevice.send(header);
  startMidiTimeout();
}

function newMidiSDHeader(deviceID: number, sampleNumber: number, sampleBits: number, sampleRate: number, sampleLength: number, loopStart: number, loopEnd: number, loopType: number): Uint8Array {
  const samplePeriod = Math.round(1000000000 / sampleRate);
  const header = new Uint8Array(21);
  header[0] = 0xf0;                        // begin system exclusive
  header[1] = 0x7e;                        // sample dump
  header[2] = deviceID & 0x7f;             // device ID
  header[3] = 0x01;                        // header
  header[4] = sampleNumber & 0x7f;         // sample number lsb
  header[5] = (sampleNumber >> 7) & 0x7f;  // sample number msb
  header[6] = sampleBits & 0x7f;           // sample format, length in bits
  header[7] = samplePeriod & 0x7f;         // sample period, lsb first
  header[8] = (samplePeriod >> 7) & 0x7f;
  header[9] = (samplePeriod >> 14) & 0x7f;
  header[10] = sampleLength & 0x7f;        // sample length, lsb first
  header[11] = (sampleLength >> 7) & 0x7f;
  header[12] = (sampleLength >> 14) & 0x7f;
  header[13] = loopStart & 0x7f;           // loop start, lsb first
  header[14] = (loopStart >> 7) & 0x7f;
  header[15] = (loopStart >> 14) & 0x7f;
  header[16] = loopEnd & 0x7f;             // loop end, lsb first
  header[17] = (loopEnd >> 7) & 0x7f;
  header[18] = (loopEnd >> 14) & 0x7f;
  header[19] = loopType & 0x7f;            // loop type, 0=fwd, 1=back/fwd, 7f=off
  header[20] = 0xf7;                       // end system exclusive
  return header;
}

function newMidiSDDataPackets(deviceID: number, sampleBits: number, samples: Float32Array): Uint8Array[] {
  const packets: Uint8Array[] = [];

  let saIndex = 0;
  while (saIndex < samples.length) {
    const packet = new Uint8Array(127);
    const packetID = packets.length;
    let pIndex = 0;

    packet[pIndex++] = 0xf0;            // begin system exclusive
    packet[pIndex++] = 0x7e;            // sample dump
    packet[pIndex++] = deviceID & 0x7f; // device ID
    packet[pIndex++] = 0x02;            // data packet
    packet[pIndex++] = packetID & 0x7f; // packet ID lsb (msb not transmitted)

    // Build packet body of 120 bytes until total length of body + header = 125.
    // 120 is divisible by 1,2,3 and 4, so all normal sample lengths divide
    // into the packet body evenly without a remainder splitting into the next packet.
    while (pIndex < 125) {
      const sampleFloat = saIndex < samples.length ? samples[saIndex++] : 0;
      const sampleFloatClamped = (Math.max(-1, Math.min(1, sampleFloat)) + 1) * 0.5;
      let sampleUnsigned = Number((((1 << sampleBits) - 1) * sampleFloatClamped).toFixed());
      let bitsRemaining = sampleBits;

      const shiftNeeded = (7 - (bitsRemaining % 7)) % 7;
      sampleUnsigned <<= shiftNeeded;
      bitsRemaining += shiftNeeded;

      while (bitsRemaining > 0) {
        const pDatum = (sampleUnsigned >> (bitsRemaining - 7)) & 0x7f;
        packet[pIndex++] = pDatum;
        bitsRemaining -= 7;
      }
    }

    let checksum = 0;
    for (let i = 1; i < pIndex; i++)
      checksum ^= packet[i];

    packet[pIndex++] = checksum & 0x7f; // checksum
    packet[pIndex++] = 0xf7;            // end system exclusive

    packets.push(packet);
  }

  return packets;
}

function midiMessageToString(p: Uint8Array): string {
  if (p.length === 0) return "";
  let buf = p[0].toString(16);
  for (let i = 1; i < p.length; i++)
    buf = buf.concat(" " + p[i].toString(16));
  return buf;
}


// Level meter
//

const levelMeterSpan = requireElement<HTMLSpanElement>("span#levelMeterInner");

function levelMeterShow(db: number) {
  const perc = 100 * ((db + 92) / (92 + 20));
  levelMeterSpan.style.width = perc + "%";
}


// Audio recorder
//

const recToggleButton = requireElement<HTMLButtonElement>("button#recordToggle");
let recIsRecording = false;

recToggleButton.onclick = function () {
  if (recIsRecording) {
    recorderStop();
  } else {
    recorderStart();
  }
};

const sampleIDInput = requireElement<HTMLInputElement>("input#sampleID");
const sampleNameInput = requireElement<HTMLInputElement>("input#sampleName");

const recTable = requireElement<HTMLTableElement>("table#recordings");
const recTrPrototype = requireElement<HTMLTemplateElement>("#recordingPrototype");

let recCurNode: HTMLTableRowElement | null = null;
let recCurFileNameNode: Element | null = null;
let recCurDurationNode: Element | null = null;
let recCurStatusNode: Element | null = null;
let recCurProgressInnerNode: HTMLSpanElement | null = null;

let recSourceNode: MediaStreamAudioSourceNode | null = null;
let recRmsDbNode: AudioWorkletNode | null = null;
let recSavingNode: AudioWorkletNode | null = null;

let recBuffers: Float32Array[][] = [[], []];
let recLength = 0;
const numChannels = 2;
let timeout: ReturnType<typeof setTimeout> | null = null;
const maxTime = 10;
let recGateOpened = false;


window.addEventListener("pagehide", recorderShutdown);

function recorderInit(stream: MediaStream) {
  recorderShutdown();
  audioContext = new AudioContext({ sampleRate: 48000 });

  recSourceNode = audioContext.createMediaStreamSource(stream);

  audioContext.audioWorklet.addModule(processorsUrl).then(() => {
    if (!audioContext || !recSourceNode) return; // shutdown happened during module load

    recRmsDbNode = new AudioWorkletNode(audioContext, "rms-db-processor");
    recRmsDbNode.port.onmessage = (event: MessageEvent<number>) => {
      levelMeterShow(event.data);
    };
    recSourceNode.connect(recRmsDbNode);
    recRmsDbNode.connect(audioContext.destination);

    recSavingNode = new AudioWorkletNode(audioContext, "gated-saving-processor");
    recSavingNode.port.onmessage = (event: MessageEvent<Float32Array[]>) => {
      // First chunk after gate opens — start the max-time countdown
      if (!recGateOpened && recIsRecording) {
        recGateOpened = true;
        if (recCurStatusNode) recCurStatusNode.textContent = "";
        timeout = setTimeout(() => {
          recorderStop();
        }, maxTime * 1000);
      }

      const channels = event.data;
      for (let i = 0; i < channels.length; i++) {
        const channel = channels[i];
        recBuffers[i].push(channel);
        if (i === 0)
          recLength += channel.length;
      }
      recorderShowDuration(recLength);
    };
  }).catch((err: Error) => {
    console.error("Failed to load audio worklet:", err);
    alert("Failed to initialise audio processing. Please reload the page.");
  });
}

function recorderShutdown() {
  if (timeout) {
    clearTimeout(timeout);
    timeout = null;
  }
  if (recIsRecording) {
    resetRecordButton();
  }
  if (activeStream) {
    activeStream.getTracks().forEach(t => t.stop());
    activeStream = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  recSourceNode = null;
  recRmsDbNode = null;
  recSavingNode = null;
}

// Create a Lucide file-audio icon element for recording rows
function createFileAudioIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  // Lucide file-audio paths
  svg.innerHTML = '<path d="M17.5 22h.5a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M2 19a2 2 0 1 1 4 0v1a2 2 0 1 1-4 0v-4a6 6 0 0 1 12 0v4a2 2 0 1 1-4 0v-1a2 2 0 1 1 4 0"/>';
  return svg;
}

function resetRecordButton() {
  recIsRecording = false;
  recToggleButton.querySelector("span")!.textContent = "Record";
  const currentIcon = recToggleButton.querySelector("svg")!;
  const newIcon = document.createElement("i");
  newIcon.setAttribute("data-lucide", "circle");
  newIcon.className = "size-5 text-accent";
  currentIcon.replaceWith(newIcon);
  createIcons({ icons: { Circle }, nameAttr: "data-lucide", root: recToggleButton });
  recToggleButton.classList.remove("!bg-accent");
}

function recorderStart() {
  if (!audioContext) {
    alert("Select an audio input first");
    return;
  }
  if (midiTransferActive) {
    alert("Please wait for the current transfer to finish");
    return;
  }

  // Create new recordings node from template
  recCurNode = recTrPrototype.content.firstElementChild!.cloneNode(true) as HTMLTableRowElement;

  // Inject the file-audio icon into the icon cell
  const iconCell = recCurNode.querySelector(".recIcon")!;
  iconCell.appendChild(createFileAudioIcon());

  recCurFileNameNode = recCurNode.querySelector(".recFileName")!;
  recCurFileNameNode.textContent = "inbox/" + sampleIDInput.value;
  recCurDurationNode = recCurNode.querySelector(".recDuration")!;
  recCurStatusNode = recCurNode.querySelector(".recStatus")!;
  recCurProgressInnerNode = recCurNode.querySelector<HTMLSpanElement>(".progressInner")!;

  // Insert at top of the recordings list, dropping at the bottom if necessary
  if (!recTable.childNodes || recTable.childNodes.length === 0)
    recTable.appendChild(recCurNode);
  else
    recTable.insertBefore(recCurNode, recTable.childNodes[0]);
  if (recTable.childNodes.length > 6)
    recTable.removeChild(recTable.childNodes[recTable.childNodes.length - 1]);

  // Start actual recording
  recorderShowDuration(0);
  recBuffers = [[], []];
  recLength = 0;
  recGateOpened = false;

  if (!recSourceNode || !recSavingNode) {
    alert("Audio pipeline is still loading. Try again in a moment.");
    if (recCurNode) recCurNode.remove();
    return;
  }

  recSavingNode.port.postMessage({ type: "reset" });
  recSourceNode.connect(recSavingNode);
  recSavingNode.connect(audioContext.destination);
  if (recCurStatusNode) recCurStatusNode.textContent = "Waiting...";

  // Update toggle button to show "Stop" state
  recIsRecording = true;
  recToggleButton.querySelector("span")!.textContent = "Stop";
  const stopIcon = recToggleButton.querySelector("svg")!;
  const stopI = document.createElement("i");
  stopI.setAttribute("data-lucide", "square");
  stopI.className = "size-5 text-accent";
  stopIcon.replaceWith(stopI);
  createIcons({ icons: { Square }, nameAttr: "data-lucide", root: recToggleButton });
  recToggleButton.classList.add("!bg-accent");
}

function recorderStop() {
  if (timeout) {
    clearTimeout(timeout);
    timeout = null;
  }

  if (recSourceNode && recSavingNode) {
    recSourceNode.disconnect(recSavingNode);
    if (audioContext) recSavingNode.disconnect(audioContext.destination);
  }

  resetRecordButton();
  const buffers = numChannels === 2
    ? [mergeBuffers(recBuffers[0], recLength), mergeBuffers(recBuffers[1], recLength)]
    : [mergeBuffers(recBuffers[0], recLength)];
  const monosummed = numChannels === 2 ? monosum(buffers[0], buffers[1]) : buffers[0];
  console.log("Captured " + monosummed.length + " samples");

  if (monosummed.length === 0) {
    if (recCurStatusNode) recCurStatusNode.textContent = "Empty recording";
    return;
  }

  if (midiToDevice && audioContext) {
    const sampleID = Math.max(0, Math.min(16383, parseInt(sampleIDInput.value) || 0));
    if (recCurStatusNode) recCurStatusNode.textContent = "Uploading...";
    midiSendSampleDump(sampleID, audioContext.sampleRate, monosummed);
  } else {
    if (recCurStatusNode) recCurStatusNode.textContent = midiToDevice ? "No audio context" : "No MIDI output";
  }
}


function recorderShowDuration(numSamples: number) {
  if (!audioContext) return;
  const duration = numSamples / audioContext.sampleRate;
  const minutes = Math.floor(duration / 60);
  const seconds = Math.floor(duration - 60 * minutes);
  const millis = Math.floor(1000 * (duration - 60 * minutes - seconds));
  if (recCurDurationNode) recCurDurationNode.textContent = str2(minutes) + ":" + str2(seconds) + "." + str3(millis);
}


function recorderShowMidiSDProgress(value: number) {
  if (value > 1) value = 1;

  if (!recCurProgressInnerNode) return;
  recCurProgressInnerNode.style.width = (100 * value) + "%";
  recCurProgressInnerNode.textContent = Math.floor(100 * value) + "%";

  if (Math.floor(10000 * value) === 10000) {
    recCurProgressInnerNode.classList.replace("bg-accent", "bg-neutral-500");
  }
}


function mergeBuffers(buffers: Float32Array[], length: number): Float32Array {
  const result = new Float32Array(length);
  let offset = 0;
  for (let i = 0; i < buffers.length; i++) {
    result.set(buffers[i], offset);
    offset += buffers[i].length;
  }
  return result;
}


function monosum(inputL: Float32Array, inputR: Float32Array): Float32Array {
  const len = inputL.length;
  const result = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    result[i] = 0.5 * (inputL[i] + inputR[i]);
  }
  return result;
}


function str2(n: number): string {
  if (n > 100) n = n % 100;
  return n < 10 ? ("0" + n.toString()) : n.toString();
}

function str3(n: number): string {
  if (n > 1000) n = n % 1000;
  return n < 10 ? ("00" + n.toString()) : (n < 100 ? ("0" + n.toString()) : n.toString());
}


// Legal notice
//

const legalButton = requireElement<HTMLButtonElement>("button#legalButton");
const legalNotice = requireElement<HTMLDivElement>("div#legalNotice");
const legalCloseButton = requireElement<HTMLButtonElement>("button#legalClose");

legalButton.onclick = function () {
  legalNotice.classList.toggle("hidden");
};

legalCloseButton.onclick = function () {
  legalNotice.classList.add("hidden");
};


// Help panel
//

const helpButton = requireElement<HTMLButtonElement>("button#helpButton");
const helpPanel = requireElement<HTMLDivElement>("div#helpPanel");
const helpCloseButton = requireElement<HTMLButtonElement>("button#helpClose");

helpButton.onclick = function () {
  helpPanel.classList.toggle("hidden");
};

helpCloseButton.onclick = function () {
  helpPanel.classList.add("hidden");
};
