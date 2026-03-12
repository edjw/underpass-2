# underpass-2

A sampling companion for [Elektron Model:Samples™](https://www.elektron.se/products/modelsamples/) devices.

> **Fork notice:** This project is a fork of [underpass](https://github.com/mlnoga/underpass) by Markus Noga, which has been dormant since 2021. Full commit history from the original is preserved. Licensed under [GPL v3](./LICENSE).

## Changes from the original

- Migrated from vanilla JS/CSS to **TypeScript + Vite + Tailwind CSS**
- Improved MIDI SDS transfer stability and UI feedback
- Merged record and stop into a single toggle button
- Added audio processing fixes (mono summing, sample rate handling)

## Value proposition
underpass-2 adds the missing record button which turns your sample player into a sampler. Just plug it into the USB port of a suitable host. Then sample from any audio input on the host; or resample the output from your device without any loss of quality.

## Supported platforms

Any computer running a browser which supports WebRTC, WebAudio and WebMIDI.
* [Chrome](https://www.google.com/chrome/), [Edge](https://www.microsoft.com/edge), [Firefox](https://www.mozilla.org/firefox/) (v108+), and [Opera](https://www.opera.com/) on Windows, macOS and Linux
* Chrome on Android supports WebMIDI; USB audio support may vary by device
* iOS cannot be supported. Apple have not implemented WebMIDI in Safari or the underlying WebKit engine

## Usage
1. Connect your device to the host using a suitable USB cable (USB-C to Micro-USB, or use an adapter)
2. Power on your device
3. Open the app in a supported browser (see above)
4. Select the appropriate audio input. Choose any line in to sample, or `Model:Samples` to resample the output of your device
5. Play some audio into your input. You should see the level meter moving
6. Hit record. You should see the duration timer counting up, while the level meter continues to move
7. Hit stop. You should see a progress bar for the transfer of the sample to your device counting up to 100%
8. On your device, push the sample selection button. Navigate to `inbox/0` and push the active trigger button to play it back
9. Rinse and repeat. Subsequent samples will be numbered 1, 2 and so on. Or choose your own number via the Sample ID input field

## Legal
This is free software licensed under [GNU GPL v3](./LICENSE). It comes without any warranty. Use entirely at your own risk.

All trademarks, registered trademarks, brand names, product names, company names and logos used in this application are the property of their respective owners. They are used for identification purposes only.

## Architecture
underpass-2 is a single page web application built with [TypeScript](https://www.typescriptlang.org/), [Vite](https://vite.dev/), and [Tailwind CSS](https://tailwindcss.com/). It uses [WebRTC](https://webrtc.org/) to identify and select audio devices. Audio data is captured using [Web Audio](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) in 16-bit stereo at 48 kHz. This involves two [worklets](https://developers.google.com/web/updates/2017/12/audio-worklet) defined in [processors.ts](./src/processors.ts) which run in separate threads: a `RmsDbProcessor` which calculates [RMS](https://en.wikipedia.org/wiki/Root_mean_square) amplitude and converts this to [decibels](https://en.wikipedia.org/wiki/Decibel) for the level meter; and a `SavingProcessor` which stores the raw PCM data. Once recording completes, stored data are further processed in the main thread. This involves summing to mono, and converting it into sample dump packets as defined on p.35 of the [MIDI](https://www.midi.org/specifications/midi1-specifications/m1-v4-2-1-midi-1-0-detailed-specification-96-1-4) standard. These packets are transferred to the device using [WebMIDI](https://www.w3.org/TR/webmidi/).
