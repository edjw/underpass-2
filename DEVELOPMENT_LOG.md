# Underpass: Development Log

This document outlines the recent architectural improvements, bug fixes, and feature additions made to the **Underpass** MIDI SDS sample transfer tool. 

## 1. Web MIDI API Permissions & Browser Support
**The Problem:** The app was blindly requesting Web MIDI SysEx permissions. When tested in Firefox, it crashed with a vague "Cannot select MIDI devices" alert because Firefox enforces a highly restrictive security model around the `sysex: true` flag. Firefox explicitly blocks SysEx requests and throws a `SecurityError` unless the requesting site is packaged as a trusted browser add-on.
**The Fix:** Updated the `navigator.requestMIDIAccess` error handler to explicitly check for `SecurityError` and the string `add-on`. If triggered, the app now gracefully explains the Firefox restriction to the user and recommends using a Chromium-based browser (Chrome, Edge, Brave) which natively supports Web MIDI SysEx via a standard permission prompt.

## 2. Elektron "Extended SDS" Sample Naming
**The Problem:** The standard MIDI Sample Dump Standard (SDS) only supports numerical sample IDs. The Elektron Model:Samples documentation states that an "Extended SDS header" must be sent to attach a string name to the sample, but this protocol is entirely undocumented by the MIDI Manufacturers Association.
**The Fix:** By reverse-engineering the open-source Linux utility `elektroid`, we identified that Elektron uses an undocumented sub-protocol under the SDS "Information" extension (`0x05`). 
*   **UI:** Added a "Sample Name" text input to `index.html`.
*   **Logic:** Implemented a new function `midiSendSampleName()` that constructs the highly specific SysEx payload: `[0xF0, 0x7E, deviceID, 0x05, 0x03, sampleID (LSB), sampleID (MSB), stringLength, ...stringBytes, 0xF7]`. This payload is automatically fired *after* the main waveform data has successfully transferred.

## 3. Audio Resampling Pitch Correction
**The Problem:** The `AudioContext` was being initialized without explicit options: `new AudioContext()`. This causes the browser to default to the host OS's hardware sample rate (often 44.1kHz). If a user's microphone was 48kHz, the browser would silently downsample it to 44.1kHz. When sent to the Model:Samples (which expects native 48kHz), the sample would play back at the wrong pitch.
**The Fix:** Hardcoded the context initialization to `new AudioContext({ sampleRate: 48000 })`. This forces the browser to maintain the 48kHz rate, aligning perfectly with the Model:Samples hardware architecture.

## 4. Robust MIDI Handshake Protocol (ACK / NAK)
**The Problem:** The original implementation of `midiInputMessage` blindly assumed *any* ACK (`0x7F`) meant "send the next packet", completely ignored NAKs (`0x7E`), ignored hardware cancellations (`0x7D`), hardcoded the receiving Device ID to `0x00`, and had no timeout fallback if a packet dropped in transit.
**The Fix:** 
*   **Dynamic Device IDs:** The script now extracts the target Device ID directly from incoming MIDI messages (`d[2]`) instead of assuming `0`.
*   **Packet Tracking:** Added support for NAK (`0x7E`) messages. If the hardware requests a resend, the app automatically steps back and re-transmits the previous packet.
*   **Corrupt Transfer Abortion:** Added a retry threshold. If the app receives 5 NAKs in a row for the same packet, it aborts the transfer and displays `Error: Transfer corrupted (Too many NAKs)`.
*   **Hardware Cancellation:** Added support for `0x7D` (Cancel). If the Model:Samples runs out of memory or the user presses stop on the device, the web app gracefully halts.
*   **Timeout Safety:** Implemented a 2000ms timeout on all outgoing packets. If the hardware stops responding entirely, the app resets rather than hanging indefinitely.

## 5. UI/UX: Disabled Button States
**The Problem:** The "Record" and "Stop" buttons did not visually indicate when they were disabled, and their CSS 3D-press animation triggered even when clicked in a disabled state.
**The Fix:** 
*   Added Tailwind utility classes (`disabled:opacity-50 disabled:cursor-not-allowed`) to both buttons.
*   Updated `app.css` to restrict the pointer cursor and the active transform animation to `button:not(:disabled)` and `.hw-button:active:not(:disabled)`. 

## 6. Memory Leak Remediation
**The Problem:** Every time the user changed their audio input device, `recorderInit` was called, which blindly appended a new `document.addEventListener("unload", recorderShutdown)` listener. Over a long session, this stacked hundreds of duplicate event listeners.
**The Fix:** Extracted the listener to the top level of the module so it only registers once. Furthermore, updated the event from the deprecated `"unload"` standard to the modern `"pagehide"` standard.