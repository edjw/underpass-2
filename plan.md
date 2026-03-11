Plan to implement                                                         │
│                                                                           │
│ Plan: Add device setup guidance to the Underpass page                     │
│                                                                           │
│ Context                                                                   │
│                                                                           │
│ Underpass records audio and transfers samples to the Elektron             │
│ Model:Samples via MIDI SDS, but the page gives no guidance on how to      │
│ configure the device itself. Users need to know what settings to change   │
│ on the hardware before and after using the app. The manual sections for   │
│ MIDI ports, audio routing, sample transfer, and sample assignment are the │
│  relevant references.                                                     │
│                                                                           │
│ What to add                                                               │
│                                                                           │
│ A collapsible "Setup Guide" section on the page (between the header and   │
│ the main controls), covering three topics drawn from the manual:          │
│                                                                           │
│ 1. Connecting (manual sections 6.7, 11.3.4)                               │
│                                                                           │
│ - Model:Samples is class compliant — no drivers needed, just plug in USB  │
│ - On the device: Settings > MIDI > PORTS — set INP FROM to USB (or M+U)   │
│ and OUT TO to USB (or M+U) for fastest transfer                           │
│ - Note: setting OUT TO to M+U slows USB transfer to DIN MIDI speed        │
│                                                                           │
│ 2. Resampling your own output (manual section 11.4)                       │
│                                                                           │
│ - To resample the M:S output back into itself via Underpass, the Audio In │
│  dropdown should show "Model:Samples" as a USB audio source               │
│ - On the device: Settings > AUDIO > INT OUT should be ON (default) so     │
│ internal audio reaches the USB output                                     │
│ - TRK OUT, DEL OUT, REV OUT control which parts of the mix reach USB —    │
│ ensure they're enabled for whichever tracks/effects you want to capture   │
│                                                                           │
│ 3. After transfer — using your samples (manual sections 12.6.2, 12.3)     │
│                                                                           │
│ - Samples transferred via SDS land in the INCOMING folder on the +Drive   │
│ (per manual section 12.6.2)                                               │
│ - To use a sample: select a track ([TRACK] + [T1-6]), press [WAVE],       │
│ navigate to the INCOMING folder, use LEVEL/DATA to find the sample, press │
│  LEVEL/DATA to assign it                                                  │
│ - Samples are 16-bit, 48 kHz, mono — Underpass already matches this       │
│ format exactly                                                            │
│ - The +Drive holds up to 1 GB of samples; each project can use up to 64   │
│ MB in RAM                                                                 │
│                                                                           │
│ Implementation                                                            │
│                                                                           │
│ File: index.html                                                          │
│                                                                           │
│ Add a collapsible <details> element after the <header> block (line ~51)   │
│ and before the enableAudio button. This keeps it framework-free and       │
│ consistent with the existing vanilla approach.                            │
│                                                                           │
│ Structure:                                                                │
│ <details class="mt-4 rounded-xl bg-chassis-dark text-xs text-label-dark"> │
│   <summary class="cursor-pointer px-4 py-3 hw-label hover:text-accent     │
│ transition">                                                              │
│     Device Setup Guide                                                    │
│   </summary>                                                              │
│   <div class="px-4 pb-4 space-y-3">                                       │
│     <!-- Three subsections with <h3> headings and <p>/<ul> content -->    │
│   </div>                                                                  │
│ </details>                                                                │
│                                                                           │
│ Uses existing CSS classes (hw-label, text-label-dark, bg-chassis-dark) —  │
│ no new styles needed. The <details> element is collapsed by default so it │
│  doesn't clutter the interface for returning users.                       │
│                                                                           │
│ File: README.md                                                           │
│                                                                           │
│ - Update step 8: change inbox/0 to INCOMING/0 (per manual section 12.6.2) │
│  and add a note that this may vary by firmware version                    │
│ - Update the app.js/processors.js file references in the Architecture     │
│ section to reflect the new TypeScript filenames (src/app.ts,              │
│ src/processors.ts)                                                        │
│                                                                           │
│ 4. Configurable output folder label                                       │
│                                                                           │
│ The recordings table currently hardcodes "inbox/" as a display prefix     │
│ (app.ts:442). Since the manual says SDS samples land in INCOMING, and     │
│ firmware versions may differ, make this configurable:                     │
│                                                                           │
│ - Add a text input field labelled "Folder" next to the existing Sample ID │
│  input, defaulting to INCOMING                                            │
│ - Use its value as the prefix in the recordings table display (e.g.       │
│ INCOMING/0, INCOMING/1)                                                   │
│ - This is display-only — SDS doesn't transmit folder paths, the device    │
│ decides where to store. But it helps users know where to look.            │
│                                                                           │
│ Files to modify                                                           │
│                                                                           │
│ - /Users/ed/Projects/underpass/index.html — add the setup guide section + │
│  folder input field                                                       │
│ - /Users/ed/Projects/underpass/README.md — fix INCOMING folder reference  │
│ and update file paths                                                     │
│ - /Users/ed/Projects/underpass/src/app.ts — use folder input value        │
│ instead of hardcoded "inbox/" on line 442                                 │
│                                                                           │
│ Key manual references used                                                │
│                                                                           │
│ - 6.7: Class compliant device (no drivers)                                │
│ - 11.3.4 PORTS: INP FROM / OUT TO settings for USB                        │
│ - 11.4: INT OUT, TRK OUT, DEL OUT, REV OUT for audio routing              │
│ - 12.1: Sample format (16-bit, 48 kHz, mono)                              │
│ - 12.3: Assigning a sample to a track ([WAVE] > navigate > LEVEL/DATA)    │
│ - 12.6.2: SDS samples land in INCOMING folder                             │
│                                                                           │
│ Verification                                                              │
│                                                                           │
│ 1. bun run dev — check the page renders with the new         │
│ collapsible section                                                       │
│ 2. Expand the guide and verify all three subsections display correctly    │
│ 3. Confirm the guide collapses/expands smoothly                           │
│ 4. Check the styling matches the existing chassis/hardware aesthetic      │
╰───────────────────────────────────────────────────────────────────────────╯
