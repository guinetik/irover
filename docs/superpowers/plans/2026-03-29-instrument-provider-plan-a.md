# Instrument Provider — Plan A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a data-driven instrument infrastructure (JSON config + types + registry + factory + tick controller + provider composable) and ship the instrument help dialog as the visible deliverable — zero changes to the existing system's wiring.

**Architecture:** `instruments.json` declares all static instrument config including help content. `InstrumentRegistry` maps string keys to controller classes. `InstrumentFactory` and `InstrumentTickController` are built and unit-tested but not wired into the live app. `useInstrumentProvider` loads the JSON and exposes defs to Vue. `InstrumentOverlay.vue` gets a minimal `?` help button that reads from the provider by slot.

**Tech Stack:** Vue 3, TypeScript strict, Vitest, existing `InstrumentController` base class at `src/three/instruments/InstrumentController.ts`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/types/instruments.ts` | Create | `InstrumentDef`, `InstrumentHelp`, `InstrumentHelpSection`, `InstrumentHelpImage` types |
| `public/data/instruments.json` | Create | All 14 instrument configs + help content |
| `src/types/__tests__/instrumentsData.test.ts` | Create | Validates instruments.json structure at build time |
| `src/instruments/InstrumentRegistry.ts` | Create | `CONTROLLER_REGISTRY` string→class map |
| `src/instruments/__tests__/InstrumentRegistry.test.ts` | Create | Registry resolves all controllerType keys from JSON |
| `src/instruments/InstrumentFactory.ts` | Create | Creates `InstrumentTuple` from def |
| `src/instruments/__tests__/InstrumentFactory.test.ts` | Create | Factory returns valid tuple; throws on unknown key |
| `src/instruments/InstrumentTickController.ts` | Create | Holds tuples, forwards `tick()`, exposes getters |
| `src/instruments/__tests__/InstrumentTickController.test.ts` | Create | tick forwards; getController resolves; dispose calls through |
| `src/composables/useInstrumentProvider.ts` | Create | Loads JSON, caches, exposes `defs` + `defBySlot` |
| `src/components/InstrumentHelpDialog.vue` | Create | Help dialog — receives `InstrumentHelp` prop, renders sections + images |
| `src/components/InstrumentOverlay.vue` | Minimal edit | Add `?` button + `InstrumentHelpDialog` wiring only |

---

## Task 1: Types

**Files:**
- Create: `src/types/instruments.ts`

- [ ] **Create the types file**

```typescript
// src/types/instruments.ts

export interface InstrumentHelpImage {
  /** Path to screenshot, e.g. "/images/help/dan-panel.jpg". Player-sourced. */
  src: string
  /** Describes exactly what screenshot to capture — shown as caption in dialog. */
  alt: string
}

export interface InstrumentHelpSection {
  /** Uppercase heading, e.g. "OPERATION", "WATCH FOR", "POWER BUDGET" */
  heading: string
  /** Plain text body — no HTML. */
  body: string
}

export interface InstrumentHelp {
  /** One-line gameplay summary shown at the top of the help dialog. */
  summary: string
  sections: InstrumentHelpSection[]
  images?: InstrumentHelpImage[]
}

export interface InstrumentUpgradeDef {
  name: string
  desc: string
  req: string
}

export interface InstrumentDef {
  /** Stable lowercase identifier, e.g. "dan", "chemcam" */
  id: string
  /** Matches slot keys in InstrumentOverlay (1–14) */
  slot: number
  icon: string
  name: string
  /** Subtitle shown in overlay header */
  type: string
  /** Short description shown in overlay body */
  desc: string
  /** Display string for power draw, e.g. "10W" or "6W / 100W drilling" */
  power: string
  /** Key into CONTROLLER_REGISTRY */
  controllerType: string
  /** Key into TICK_HANDLER_REGISTRY (populated in Plan B) */
  tickHandlerType: string
  upgrade: InstrumentUpgradeDef
  help: InstrumentHelp
}
```

- [ ] **Commit**

```bash
git add src/types/instruments.ts
git commit -m "feat(instruments): add InstrumentDef and InstrumentHelp types"
```

---

## Task 2: instruments.json

**Files:**
- Create: `public/data/instruments.json`
- Create: `public/images/help/.gitkeep` (placeholder for screenshot directory)

- [ ] **Create screenshot placeholder directory**

```bash
mkdir -p public/images/help
touch public/images/help/.gitkeep
```

- [ ] **Create instruments.json**

```json
{
  "version": 1,
  "instruments": [
    {
      "id": "mastcam",
      "slot": 1,
      "icon": "CAM",
      "name": "MASTCAM",
      "type": "SURVEY CAMERA",
      "desc": "Twin mast cameras for wide-area survey. Filter by rock type — matches show as highlights. Tag a target before spending laser or drill time on it.",
      "power": "4–31W",
      "controllerType": "MastCamController",
      "tickHandlerType": "MastCamTickHandler",
      "upgrade": {
        "name": "INFRARED / MULTISPECTRAL",
        "desc": "Stronger mineral contrast in the passive survey view.",
        "req": "Requires: Science Pack Alpha drop"
      },
      "help": {
        "summary": "Visual classifier. Tags rocks for ChemCam and drill targeting.",
        "sections": [
          {
            "heading": "OPERATION",
            "body": "Press [1] to select MastCam. Aim at a rock and hold [E] to scan. The scan takes approximately 2 seconds. A floating label confirms the tag. Repeat for at least 3 rocks before using ChemCam or the drill."
          },
          {
            "heading": "WATCH FOR",
            "body": "ChemCam and the drill require a MastCam tag — untagged rocks cannot be analyzed or cored. This interlock is enforced by the instrument. Hematite and sulfate are rarer than basalt and worth prioritizing for downstream analysis."
          }
        ],
        "images": [
          {
            "src": "/images/help/mastcam-tag.jpg",
            "alt": "MastCam view showing a rock target with scan progress bar and the floating tag label after completion"
          }
        ]
      }
    },
    {
      "id": "chemcam",
      "slot": 2,
      "icon": "LZR",
      "name": "CHEMCAM",
      "type": "LASER SPECTROGRAPH",
      "desc": "Standoff laser spectroscopy: vaporizes a pin spot and reads elemental composition. Use after MastCam to judge if a rock is worth drilling.",
      "power": "6–111W",
      "controllerType": "ChemCamController",
      "tickHandlerType": "ChemCamTickHandler",
      "upgrade": {
        "name": "MULTI-SHOT BURST",
        "desc": "3 shots on different spots for averaged reading. Better accuracy.",
        "req": "Requires: Science Pack Alpha drop"
      },
      "help": {
        "summary": "Laser spectrometer. Identifies rock composition at standoff distance.",
        "sections": [
          {
            "heading": "OPERATION",
            "body": "MastCam tag required first. Press [2] to select ChemCam. Aim at a tagged rock and hold [E] to fire. Keep aim steady — the sequence fires multiple pulses over several seconds. When the spectrum readout appears, acknowledge it to archive the result."
          },
          {
            "heading": "WATCH FOR",
            "body": "ChemCam only fires on MastCam-tagged rocks — selecting an untagged target does nothing. ChemCam has a limited shot count before cooldown. Results are queued for UHF transmission automatically — no extra steps required."
          }
        ],
        "images": [
          {
            "src": "/images/help/chemcam-spectrum.jpg",
            "alt": "ChemCam spectrum readout panel showing elemental peaks and the acknowledge button"
          }
        ]
      }
    },
    {
      "id": "drill",
      "slot": 3,
      "icon": "ARM",
      "name": "DRILL",
      "type": "ARM POWDER SAMPLER",
      "desc": "Rotary percussive bit on the arm turret. Collects powdered rock for the lab. Run MastCam and ChemCam on the target first for best results.",
      "power": "6W / 100W drilling",
      "controllerType": "DrillController",
      "tickHandlerType": "DrillTickHandler",
      "upgrade": {
        "name": "BIT WEAR KIT",
        "desc": "Reduces drill time on tagged rocks.",
        "req": "Requires: Deep Analysis Kit drop"
      },
      "help": {
        "summary": "Core sampler. Collects rock powder for SAM analysis.",
        "sections": [
          {
            "heading": "OPERATION",
            "body": "Drive within 1.5m of a rock target. Press [3] to select the drill. Aim the arm with the mouse. Hold [E] to drill — the sample is collected and added to inventory automatically when complete. Nothing to pick up manually."
          },
          {
            "heading": "WATCH FOR",
            "body": "Drilling is the highest power draw on the vehicle. After a drill cycle, open the RTG panel and activate the Power Shunt to recover the battery. The shunt disables driving while active — hold position. Targets analyzed by both MastCam and ChemCam yield significantly more science value from the sample."
          }
        ],
        "images": [
          {
            "src": "/images/help/drill-active.jpg",
            "alt": "Drill arm extended toward a rock target with the drill progress indicator active"
          }
        ]
      }
    },
    {
      "id": "apxs",
      "slot": 4,
      "icon": "⊕",
      "name": "APXS",
      "type": "CONTACT SPECTROMETER",
      "desc": "Alpha particle X-ray spectrometer. Placed against rock or soil for bulk elemental chemistry. Slower than ChemCam but more accurate for light elements.",
      "power": "5W idle / 18W active",
      "controllerType": "APXSController",
      "tickHandlerType": "APXSTickHandler",
      "upgrade": {
        "name": "LONG INTEGRATION",
        "desc": "Longer dwells, lower detection limits.",
        "req": "Requires: Contact Science Package drop"
      },
      "help": {
        "summary": "Contact spectrometer. Elemental analysis by physical proximity.",
        "sections": [
          {
            "heading": "OPERATION",
            "body": "Drive close to a rock target. Press [4] to select APXS. Hold [E] to initiate contact. A brief calibration sequence begins — follow the on-screen prompts. The integration runs automatically after calibration. Do not move the rover while APXS is integrating."
          },
          {
            "heading": "WATCH FOR",
            "body": "APXS requires physical proximity — standoff analysis is not possible. It is slower than ChemCam but more accurate for light elements. A rock analyzed by both ChemCam and APXS yields significantly more science value than one analyzed by only one. Results are queued for transmission automatically."
          }
        ],
        "images": [
          {
            "src": "/images/help/apxs-contact.jpg",
            "alt": "APXS instrument panel showing the contact calibration prompt and integration progress bar"
          }
        ]
      }
    },
    {
      "id": "dan",
      "slot": 5,
      "icon": "NEU",
      "name": "DAN",
      "type": "NEUTRON SCANNER",
      "desc": "Fires neutrons into the ground and detects hydrogen. Maps subsurface water content while driving. A signal spike indicates ice or hydrated minerals.",
      "power": "10W",
      "controllerType": "DANController",
      "tickHandlerType": "DANTickHandler",
      "upgrade": {
        "name": "DEPTH EXTENDER",
        "desc": "Scan depth from 0.5m to 1.0m below surface.",
        "req": "Requires: Subsurface Package drop"
      },
      "help": {
        "summary": "Subsurface hydrogen detector. Finds ice and hydrated minerals while driving.",
        "sections": [
          {
            "heading": "OPERATION",
            "body": "Press [5] to select DAN. Press ACTIVATE or [E] to enable passive scan. Drive normally — DAN scans automatically while moving. Watch the signal readout. When the return count spikes, stop immediately. Hold [E] for 4 seconds to initiate prospecting. Stay still for the full integration cycle."
          },
          {
            "heading": "WATCH FOR",
            "body": "Driving away from a signal resets integration — stop the moment you see a spike. Once prospecting begins, the rover cannot move for the full cycle duration (approximately 2 Mars hours). Attempting to drive cancels the prospect. The spike may be subtle — watch the readout carefully while driving."
          }
        ],
        "images": [
          {
            "src": "/images/help/dan-signal.jpg",
            "alt": "DAN instrument panel showing the neutron return count readout with a visible signal spike"
          },
          {
            "src": "/images/help/dan-prospecting.jpg",
            "alt": "DAN prospecting phase active — rover stationary, integration timer running"
          }
        ]
      }
    },
    {
      "id": "sam",
      "slot": 6,
      "icon": "DRL",
      "name": "SAM",
      "type": "SAMPLE ANALYSIS SUITE",
      "desc": "Onboard analytical lab: gas chromatograph, mass spectrometer, tunable laser. Identifies organics, measures isotope ratios, characterizes molecular composition.",
      "power": "25W active",
      "controllerType": "SAMController",
      "tickHandlerType": "SAMTickHandler",
      "upgrade": {
        "name": "SENSITIVITY MODULE",
        "desc": "Detects organics at 10x lower concentration.",
        "req": "Requires: Full Science Suite drop"
      },
      "help": {
        "summary": "Onboard lab. Runs chemical analysis on drill samples.",
        "sections": [
          {
            "heading": "OPERATION",
            "body": "Drill a sample first — it enters inventory automatically. Press [6] to select SAM. Open the experiment panel, load the sample, and select a mode: Pyrolysis (organics and volatiles), Wet Chemistry (soluble minerals), or Isotope Analysis (elemental ratios). Confirm to queue. Acknowledge the readout when the experiment finishes."
          },
          {
            "heading": "WATCH FOR",
            "body": "SAM draws 25W while an experiment is running — the highest passive draw on the vehicle. Monitor your power budget. Only one experiment runs at a time. The experiment processes in the background; you can drive while it runs. Do not let the RTG degrade while SAM is active."
          }
        ],
        "images": [
          {
            "src": "/images/help/sam-panel.jpg",
            "alt": "SAM instrument panel showing experiment mode selection and the active experiment progress bar"
          }
        ]
      }
    },
    {
      "id": "rtg",
      "slot": 7,
      "icon": "⚡",
      "name": "RTG",
      "type": "POWER GENERATOR",
      "desc": "Radioisotope Thermoelectric Generator. Converts plutonium-238 decay heat to electricity. The rover's only power source.",
      "power": "110W baseline",
      "controllerType": "RTGController",
      "tickHandlerType": "RoverVfxTickHandler",
      "upgrade": {
        "name": "HEAT EXCHANGER",
        "desc": "Improves thermal efficiency. Faster charge rate.",
        "req": "Requires: Engineering Package drop"
      },
      "help": {
        "summary": "Primary power source. The only instrument where failure ends the mission.",
        "sections": [
          {
            "heading": "OPERATION",
            "body": "Boot via the power HUD on startup. Monitor durability in this panel. OVERDRIVE temporarily boosts reactor output — all instruments lock out for approximately 19 seconds during and after the burst. POWER SHUNT immediately refills the battery but disables driving while the cycle is active."
          },
          {
            "heading": "WATCH FOR",
            "body": "RTG at 0% durability ends the mission immediately — no recovery. Every other instrument can break and the mission continues in degraded state. The RTG cannot. Repair as soon as durability drops. Repair cost scales with damage level — early repair is always cheaper. Each repair slightly lowers the maximum durability ceiling."
          }
        ],
        "images": [
          {
            "src": "/images/help/rtg-panel.jpg",
            "alt": "RTG instrument panel showing durability bar, OVERDRIVE and POWER SHUNT buttons"
          }
        ]
      }
    },
    {
      "id": "rems",
      "slot": 8,
      "icon": "☂",
      "name": "REMS",
      "type": "WEATHER STATION",
      "desc": "Twin boom sensors on the mast: temperature, wind, pressure, humidity, UV. Provides continuous environmental monitoring and storm alerts.",
      "power": "1W",
      "controllerType": "REMSController",
      "tickHandlerType": "REMSTickHandler",
      "upgrade": {
        "name": "DUST STORM PREDICTOR",
        "desc": "Forecasts storms 2 sols ahead.",
        "req": "Requires: Meteorology Package drop"
      },
      "help": {
        "summary": "Weather station. Passive environmental monitoring with sample quality bonus.",
        "sections": [
          {
            "heading": "OPERATION",
            "body": "Press [8] to select REMS. Press ACTIVATE or [E] to enable surveying. REMS runs passively at approximately 1W once on. Current conditions — pressure, temperature, wind speed, UV index — update continuously in the panel."
          },
          {
            "heading": "WATCH FOR",
            "body": "When REMS is active and surveying, it applies a +10% sample quality bonus to all science collected within approximately 3 meters of the rover. Keep REMS running during any science work. It also provides dust storm level alerts — watch the REMS panel for incoming storm warnings before they affect instrument operation."
          }
        ],
        "images": [
          {
            "src": "/images/help/rems-readout.jpg",
            "alt": "REMS panel showing live pressure, temperature, wind, and UV readouts with surveying status active"
          }
        ]
      }
    },
    {
      "id": "rad",
      "slot": 9,
      "icon": "☢",
      "name": "RAD",
      "type": "RADIATION DETECTOR",
      "desc": "Measures high-energy radiation: protons, heavy ions, neutrons, gamma rays. Monitors cumulative dose and alerts on solar particle events.",
      "power": "2W",
      "controllerType": "RADController",
      "tickHandlerType": "RadTickHandler",
      "upgrade": {
        "name": "PARTICLE SPECTROMETER",
        "desc": "Identifies individual isotopes in cosmic ray flux.",
        "req": "Requires: Deep Space Package drop"
      },
      "help": {
        "summary": "Radiation monitor. Tracks cumulative dose and alerts on solar events.",
        "sections": [
          {
            "heading": "OPERATION",
            "body": "Press [9] to select RAD. Press ACTIVATE or [E] to enable monitoring. RAD runs passively at approximately 2W. Cumulative dose is tracked across the session and shown in the panel."
          },
          {
            "heading": "WATCH FOR",
            "body": "High-radiation zones increase instrument durability decay rates — all instruments degrade faster under elevated radiation. RAD alerts you to solar particle events before they peak. Moving to lower-radiation terrain reduces passive damage to all instruments."
          }
        ],
        "images": [
          {
            "src": "/images/help/rad-panel.jpg",
            "alt": "RAD panel showing current radiation level, cumulative dose, and zone indicator"
          }
        ]
      }
    },
    {
      "id": "heater",
      "slot": 10,
      "icon": "♨",
      "name": "HEATER",
      "type": "THERMAL MANAGEMENT",
      "desc": "Warm Electronics Box heating system. Keeps internal temperature above survival thresholds. Competes with science instruments for power.",
      "power": "0–12W",
      "controllerType": "HeaterController",
      "tickHandlerType": "HeaterTickHandler",
      "upgrade": {
        "name": "INSULATION UPGRADE",
        "desc": "Reduces heat loss rate by 30%. Less heater draw at cold sites.",
        "req": "Requires: Engineering Package drop"
      },
      "help": {
        "summary": "Thermal management. Automatic — protects instruments from cold damage.",
        "sections": [
          {
            "heading": "OPERATION",
            "body": "Press [H] to open the thermal panel. The heater runs automatically — no manual activation. The thermostat engages below -10°C and shuts off above +5°C. Current rover internal temperature and ambient temperature are shown in the panel."
          },
          {
            "heading": "WATCH FOR",
            "body": "The heater draws up to 12W when active — competing directly with science instruments for power. Colder landing sites mean more heater cycles and less power available for science. Monitor the thermal zone indicator: COLD reduces instrument efficiency, CRITICAL locks some instruments entirely."
          }
        ],
        "images": [
          {
            "src": "/images/help/heater-panel.jpg",
            "alt": "Heater panel showing internal temperature, ambient temperature, heater draw, and thermal zone status"
          }
        ]
      }
    },
    {
      "id": "lga",
      "slot": 11,
      "icon": "📡",
      "name": "LGA",
      "type": "LOW-GAIN ANTENNA",
      "desc": "Omnidirectional low-gain antenna for direct-to-Earth communication. Primary command uplink and mission mailbox.",
      "power": "5W",
      "controllerType": "AntennaLGController",
      "tickHandlerType": "AntennaTickHandler",
      "upgrade": {
        "name": "SIGNAL AMPLIFIER",
        "desc": "Doubles direct-to-Earth data rate.",
        "req": "Requires: Comms Package drop"
      },
      "help": {
        "summary": "Mission mailbox. Missions arrive here; completed results transmit from here.",
        "sections": [
          {
            "heading": "OPERATION",
            "body": "Press [R] to open the LGA panel. Missions from Mission Control arrive as messages in your inbox. When a mission is complete and awaiting transmit, file results from this panel. Press ACTIVATE or [E] to toggle the antenna link."
          },
          {
            "heading": "WATCH FOR",
            "body": "Check the LGA when unsure what to do next — new mission assignments appear here. The LGA has a low data rate and is not suitable for large science packages; use UHF for bulk science transmission. The DSN Archaeology upgrade (if installed) extends the receiver into legacy frequency bands."
          }
        ],
        "images": [
          {
            "src": "/images/help/lga-inbox.jpg",
            "alt": "LGA panel showing the message inbox with an unread mission assignment"
          }
        ]
      }
    },
    {
      "id": "uhf",
      "slot": 12,
      "icon": "📶",
      "name": "UHF",
      "type": "UHF RELAY ANTENNA",
      "desc": "High-bandwidth UHF antenna for relay via overhead orbiters (MRO, MAVEN). Primary science downlink.",
      "power": "8W",
      "controllerType": "AntennaUHFController",
      "tickHandlerType": "AntennaTickHandler",
      "upgrade": {
        "name": "DUAL-BAND MODULE",
        "desc": "Enables simultaneous uplink/downlink during passes. Halves transfer time.",
        "req": "Requires: Comms Package drop"
      },
      "help": {
        "summary": "Science downlink. Transmits queued data automatically during orbital relay windows.",
        "sections": [
          {
            "heading": "OPERATION",
            "body": "Press [T] to open the UHF panel. Press ACTIVATE or [E] to enable. All science results you collect are queued automatically — you do not select individual items. When an orbital relay window opens, the antenna transmits from the top of the queue. Science Points are awarded when Earth acknowledges receipt."
          },
          {
            "heading": "WATCH FOR",
            "body": "Relay windows are on a fixed schedule — if the panel shows time to next pass, wait for it. Missing a window means waiting for the following orbit. Data transmits oldest-first. SP is awarded on acknowledgment, not on collection — data sitting in the queue does not count toward mission objectives."
          }
        ],
        "images": [
          {
            "src": "/images/help/uhf-panel.jpg",
            "alt": "UHF panel showing orbital pass schedule, transmission queue length, and active uplink progress"
          }
        ]
      }
    },
    {
      "id": "wheels",
      "slot": 13,
      "icon": "○",
      "name": "WHLS",
      "type": "MOBILITY / DRIVE",
      "desc": "Rocker-bogie wheel motors and steering actuators. Power draw only active while the chassis is moving.",
      "power": "0–5W",
      "controllerType": "RoverWheelsController",
      "tickHandlerType": "RoverMovementTickHandler",
      "upgrade": {
        "name": "EFFICIENCY MOTORS",
        "desc": "Lower draw per meter; same top speed.",
        "req": "Requires: Engineering Package drop"
      },
      "help": {
        "summary": "Drive system. WASD to move; wheel condition affects speed.",
        "sections": [
          {
            "heading": "OPERATION",
            "body": "Press [B] to open the wheels panel. WASD controls movement. Current drive speed and active modifiers are shown in the panel. Use REPAIR if wheel condition has degraded."
          },
          {
            "heading": "WATCH FOR",
            "body": "Wheel condition degrades over time and from hazard events. Degraded wheels reduce movement speed. Power draw is only active while moving. Some operations lock the drive system temporarily — the RTG Power Shunt disables driving while active, and DAN prospecting immobilizes the rover for the full integration cycle."
          }
        ],
        "images": [
          {
            "src": "/images/help/wheels-panel.jpg",
            "alt": "Wheels panel showing drive speed, wheel condition, and active speed modifiers"
          }
        ]
      }
    },
    {
      "id": "mic",
      "slot": 14,
      "icon": "🎙",
      "name": "MIC",
      "type": "AUDIO SENSOR",
      "desc": "Rover-mounted microphone capturing Mars ambient sound. Audio sourced from NASA Perseverance recordings.",
      "power": "1W",
      "controllerType": "MicController",
      "tickHandlerType": "MicTickHandler",
      "upgrade": {
        "name": "HIGH-FIDELITY MIC",
        "desc": "Wider frequency response captures faint geological sounds at greater distance.",
        "req": "Requires: Science Pack Alpha drop"
      },
      "help": {
        "summary": "Ambient microphone. Layers wind, atmosphere, and storm audio.",
        "sections": [
          {
            "heading": "OPERATION",
            "body": "Select the MIC slot to open the panel. Press ACTIVATE or [E] to enable ambient audio. The microphone layers wind, atmospheric pressure, and storm intensity into the ambient soundscape."
          },
          {
            "heading": "WATCH FOR",
            "body": "Audio reacts in real time to wind speed, time of day, and storm intensity — louder and more turbulent during dust storms. Approximately 1W passive draw while active."
          }
        ],
        "images": []
      }
    }
  ]
}
```

- [ ] **Commit**

```bash
git add public/data/instruments.json public/images/help/.gitkeep
git commit -m "feat(instruments): add instruments.json with config and help content for all 14 instruments"
```

---

## Task 3: instruments.json Validation Test

**Files:**
- Create: `src/types/__tests__/instrumentsData.test.ts`

- [ ] **Write the test**

```typescript
// src/types/__tests__/instrumentsData.test.ts
import { describe, it, expect } from 'vitest'
import instrumentsRaw from '../../../public/data/instruments.json'
import type { InstrumentDef } from '../instruments'

const instruments = instrumentsRaw.instruments as InstrumentDef[]

describe('instruments.json', () => {
  it('has at least one instrument', () => {
    expect(instruments.length).toBeGreaterThan(0)
  })

  it('every instrument has required top-level fields', () => {
    for (const inst of instruments) {
      expect(inst.id, `${inst.id} missing id`).toBeTruthy()
      expect(typeof inst.slot, `${inst.id} slot must be number`).toBe('number')
      expect(inst.name, `${inst.id} missing name`).toBeTruthy()
      expect(inst.type, `${inst.id} missing type`).toBeTruthy()
      expect(inst.desc, `${inst.id} missing desc`).toBeTruthy()
      expect(inst.power, `${inst.id} missing power`).toBeTruthy()
      expect(inst.controllerType, `${inst.id} missing controllerType`).toBeTruthy()
      expect(inst.tickHandlerType, `${inst.id} missing tickHandlerType`).toBeTruthy()
    }
  })

  it('every instrument has a valid help object', () => {
    for (const inst of instruments) {
      expect(inst.help, `${inst.id} missing help`).toBeDefined()
      expect(inst.help.summary, `${inst.id} help missing summary`).toBeTruthy()
      expect(inst.help.sections.length, `${inst.id} help must have at least one section`).toBeGreaterThan(0)
      for (const section of inst.help.sections) {
        expect(section.heading, `${inst.id} section missing heading`).toBeTruthy()
        expect(section.body, `${inst.id} section missing body`).toBeTruthy()
      }
    }
  })

  it('slot numbers are unique', () => {
    const slots = instruments.map(i => i.slot)
    const unique = new Set(slots)
    expect(unique.size).toBe(slots.length)
  })

  it('all 14 instruments are present', () => {
    expect(instruments.length).toBe(14)
  })

  it('ids are unique', () => {
    const ids = instruments.map(i => i.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('images have src and alt if present', () => {
    for (const inst of instruments) {
      if (!inst.help.images) continue
      for (const img of inst.help.images) {
        expect(img.src, `${inst.id} image missing src`).toBeTruthy()
        expect(img.alt, `${inst.id} image missing alt`).toBeTruthy()
      }
    }
  })
})
```

- [ ] **Run the test — expect PASS**

```bash
npm run test -- src/types/__tests__/instrumentsData.test.ts
```

Expected: all tests pass.

- [ ] **Commit**

```bash
git add src/types/__tests__/instrumentsData.test.ts
git commit -m "test(instruments): validate instruments.json schema"
```

---

## Task 4: InstrumentRegistry

**Files:**
- Create: `src/instruments/InstrumentRegistry.ts`

The registry maps `controllerType` strings from `instruments.json` to the concrete controller classes. This is the only file in the codebase that imports all 14 controllers.

`TICK_HANDLER_REGISTRY` is defined as an empty map in Plan A — Plan B populates it when wiring the live system.

- [ ] **Create the registry**

```typescript
// src/instruments/InstrumentRegistry.ts
import { MastCamController } from '@/three/instruments/MastCamController'
import { ChemCamController } from '@/three/instruments/ChemCamController'
import { DrillController } from '@/three/instruments/DrillController'
import { APXSController } from '@/three/instruments/APXSController'
import { DANController } from '@/three/instruments/DANController'
import { SAMController } from '@/three/instruments/SAMController'
import { RTGController } from '@/three/instruments/RTGController'
import { REMSController } from '@/three/instruments/REMSController'
import { RADController } from '@/three/instruments/RADController'
import { HeaterController } from '@/three/instruments/HeaterController'
import { AntennaLGController } from '@/three/instruments/AntennaLGController'
import { AntennaUHFController } from '@/three/instruments/AntennaUHFController'
import { RoverWheelsController } from '@/three/instruments/RoverWheelsController'
import { MicController } from '@/three/instruments/MicController'
import type { InstrumentController } from '@/three/instruments/InstrumentController'

export type ControllerConstructor = new () => InstrumentController

export const CONTROLLER_REGISTRY: Record<string, ControllerConstructor> = {
  MastCamController,
  ChemCamController,
  DrillController,
  APXSController,
  DANController,
  SAMController,
  RTGController,
  REMSController,
  RADController,
  HeaterController,
  AntennaLGController,
  AntennaUHFController,
  RoverWheelsController,
  MicController,
}

/**
 * Tick handler registry — populated in Plan B when the live system is wired.
 * Defined here so InstrumentFactory can reference it without Plan B changes.
 */
export const TICK_HANDLER_REGISTRY: Record<string, unknown> = {}
```

- [ ] **Commit**

```bash
git add src/instruments/InstrumentRegistry.ts
git commit -m "feat(instruments): add InstrumentRegistry mapping controllerType strings to classes"
```

---

## Task 5: InstrumentRegistry Test

**Files:**
- Create: `src/instruments/__tests__/InstrumentRegistry.test.ts`

- [ ] **Write the test**

```typescript
// src/instruments/__tests__/InstrumentRegistry.test.ts
import { describe, it, expect } from 'vitest'
import { CONTROLLER_REGISTRY } from '../InstrumentRegistry'
import instrumentsRaw from '../../../public/data/instruments.json'
import type { InstrumentDef } from '@/types/instruments'

const instruments = instrumentsRaw.instruments as InstrumentDef[]

describe('InstrumentRegistry', () => {
  it('every controllerType in instruments.json resolves in CONTROLLER_REGISTRY', () => {
    for (const inst of instruments) {
      const Ctor = CONTROLLER_REGISTRY[inst.controllerType]
      expect(Ctor, `No registry entry for controllerType "${inst.controllerType}" (instrument: ${inst.id})`).toBeDefined()
      expect(typeof Ctor).toBe('function')
    }
  })

  it('controller registry entries are constructors', () => {
    for (const [key, Ctor] of Object.entries(CONTROLLER_REGISTRY)) {
      expect(typeof Ctor, `${key} is not a function`).toBe('function')
    }
  })
})
```

- [ ] **Run the test — expect PASS**

```bash
npm run test -- src/instruments/__tests__/InstrumentRegistry.test.ts
```

- [ ] **Commit**

```bash
git add src/instruments/__tests__/InstrumentRegistry.test.ts
git commit -m "test(instruments): verify registry resolves all controllerType keys from instruments.json"
```

---

## Task 6: InstrumentFactory

**Files:**
- Create: `src/instruments/InstrumentFactory.ts`

In Plan A, the factory creates `(controller, null)` tuples — tick handlers are not instantiated yet. The tuple type reflects this.

- [ ] **Create the factory**

```typescript
// src/instruments/InstrumentFactory.ts
import type { InstrumentDef } from '@/types/instruments'
import type { InstrumentController } from '@/three/instruments/InstrumentController'
import { CONTROLLER_REGISTRY } from './InstrumentRegistry'

export interface InstrumentTuple {
  def: InstrumentDef
  controller: InstrumentController
  /** Null in Plan A — populated by Plan B when the live system is wired. */
  tickHandler: null
}

/**
 * Creates an InstrumentTuple from a definition.
 * Throws if the controllerType is not registered — fail fast during development.
 *
 * Plan A: tickHandler is always null.
 * Plan B: this function will accept a context arg and resolve tickHandler from TICK_HANDLER_REGISTRY.
 */
export function createInstrumentTuple(def: InstrumentDef): InstrumentTuple {
  const Ctor = CONTROLLER_REGISTRY[def.controllerType]
  if (!Ctor) {
    throw new Error(
      `[InstrumentFactory] Unknown controllerType "${def.controllerType}" for instrument "${def.id}". ` +
      `Register it in CONTROLLER_REGISTRY.`
    )
  }
  const controller = new Ctor()
  return { def, controller, tickHandler: null }
}
```

- [ ] **Commit**

```bash
git add src/instruments/InstrumentFactory.ts
git commit -m "feat(instruments): add InstrumentFactory — creates controller tuples from InstrumentDef"
```

---

## Task 7: InstrumentFactory Test

**Files:**
- Create: `src/instruments/__tests__/InstrumentFactory.test.ts`

- [ ] **Write the test**

```typescript
// src/instruments/__tests__/InstrumentFactory.test.ts
import { describe, it, expect } from 'vitest'
import { createInstrumentTuple } from '../InstrumentFactory'
import type { InstrumentDef } from '@/types/instruments'
import instrumentsRaw from '../../../public/data/instruments.json'

const instruments = instrumentsRaw.instruments as InstrumentDef[]

describe('createInstrumentTuple', () => {
  it('returns a tuple with def, controller, and null tickHandler for every instrument in JSON', () => {
    for (const def of instruments) {
      const tuple = createInstrumentTuple(def)
      expect(tuple.def).toBe(def)
      expect(tuple.controller).toBeDefined()
      expect(tuple.tickHandler).toBeNull()
    }
  })

  it('controller has expected InstrumentController shape', () => {
    const tuple = createInstrumentTuple(instruments[0]!)
    expect(typeof tuple.controller.attach).toBe('function')
    expect(typeof tuple.controller.dispose).toBe('function')
    expect(typeof tuple.controller.durabilityPct).toBe('number')
  })

  it('throws a clear error for unknown controllerType', () => {
    const badDef: InstrumentDef = {
      ...instruments[0]!,
      id: 'test',
      controllerType: 'NonExistentController',
    }
    expect(() => createInstrumentTuple(badDef)).toThrow(
      'Unknown controllerType "NonExistentController"'
    )
  })
})
```

- [ ] **Run the test — expect PASS**

```bash
npm run test -- src/instruments/__tests__/InstrumentFactory.test.ts
```

- [ ] **Commit**

```bash
git add src/instruments/__tests__/InstrumentFactory.test.ts
git commit -m "test(instruments): verify InstrumentFactory creates valid tuples and throws on unknown key"
```

---

## Task 8: InstrumentTickController

**Files:**
- Create: `src/instruments/InstrumentTickController.ts`

In Plan A, `tick()` is a no-op since all `tickHandler` fields are null. The controller is built and tested as infrastructure for Plan B.

- [ ] **Create the tick controller**

```typescript
// src/instruments/InstrumentTickController.ts
import type { InstrumentDef } from '@/types/instruments'
import type { InstrumentController } from '@/three/instruments/InstrumentController'
import type { InstrumentTuple } from './InstrumentFactory'

export class InstrumentTickController {
  private readonly tuples: InstrumentTuple[]

  constructor(tuples: InstrumentTuple[]) {
    this.tuples = tuples
  }

  /**
   * Forward tick to all registered tick handlers.
   * No-op in Plan A (all tickHandlers are null).
   */
  tick(delta: number): void {
    for (const tuple of this.tuples) {
      if (tuple.tickHandler && typeof (tuple.tickHandler as any).tick === 'function') {
        ;(tuple.tickHandler as any).tick(delta)
      }
    }
  }

  /** Look up controller by instrument id (e.g. "dan") */
  getControllerById(id: string): InstrumentController | undefined {
    return this.tuples.find(t => t.def.id === id)?.controller
  }

  /** Look up controller by slot number */
  getControllerBySlot(slot: number): InstrumentController | undefined {
    return this.tuples.find(t => t.def.slot === slot)?.controller
  }

  /** Look up def by slot number */
  getDefBySlot(slot: number): InstrumentDef | undefined {
    return this.tuples.find(t => t.def.slot === slot)?.def
  }

  /** All defs, in slot order */
  getDefs(): InstrumentDef[] {
    return [...this.tuples].sort((a, b) => a.def.slot - b.def.slot).map(t => t.def)
  }

  dispose(): void {
    for (const tuple of this.tuples) {
      tuple.controller.dispose()
      if (tuple.tickHandler && typeof (tuple.tickHandler as any).dispose === 'function') {
        ;(tuple.tickHandler as any).dispose()
      }
    }
  }
}
```

- [ ] **Commit**

```bash
git add src/instruments/InstrumentTickController.ts
git commit -m "feat(instruments): add InstrumentTickController — tick forwarding and controller lookup"
```

---

## Task 9: InstrumentTickController Test

**Files:**
- Create: `src/instruments/__tests__/InstrumentTickController.test.ts`

- [ ] **Write the test**

```typescript
// src/instruments/__tests__/InstrumentTickController.test.ts
import { describe, it, expect, vi } from 'vitest'
import { InstrumentTickController } from '../InstrumentTickController'
import { createInstrumentTuple } from '../InstrumentFactory'
import instrumentsRaw from '../../../public/data/instruments.json'
import type { InstrumentDef } from '@/types/instruments'

const instruments = instrumentsRaw.instruments as InstrumentDef[]

function makeController(): InstrumentTickController {
  const tuples = instruments.map(def => createInstrumentTuple(def))
  return new InstrumentTickController(tuples)
}

describe('InstrumentTickController', () => {
  it('getControllerById returns controller for known id', () => {
    const ctrl = makeController()
    const dan = ctrl.getControllerById('dan')
    expect(dan).toBeDefined()
  })

  it('getControllerById returns undefined for unknown id', () => {
    const ctrl = makeController()
    expect(ctrl.getControllerById('does-not-exist')).toBeUndefined()
  })

  it('getControllerBySlot returns controller for known slot', () => {
    const ctrl = makeController()
    const slot5 = ctrl.getControllerBySlot(5)
    expect(slot5).toBeDefined()
  })

  it('getDefBySlot returns def with matching slot', () => {
    const ctrl = makeController()
    const def = ctrl.getDefBySlot(5)
    expect(def?.id).toBe('dan')
  })

  it('getDefs returns all defs in slot order', () => {
    const ctrl = makeController()
    const defs = ctrl.getDefs()
    expect(defs.length).toBe(14)
    for (let i = 1; i < defs.length; i++) {
      expect(defs[i]!.slot).toBeGreaterThan(defs[i - 1]!.slot)
    }
  })

  it('tick does not throw when all tickHandlers are null', () => {
    const ctrl = makeController()
    expect(() => ctrl.tick(0.016)).not.toThrow()
  })

  it('tick forwards to tickHandlers that have a tick method', () => {
    const tuples = instruments.slice(0, 1).map(def => createInstrumentTuple(def))
    const fakeTick = vi.fn()
    ;(tuples[0] as any).tickHandler = { tick: fakeTick, dispose: vi.fn() }
    const ctrl = new InstrumentTickController(tuples)
    ctrl.tick(0.016)
    expect(fakeTick).toHaveBeenCalledWith(0.016)
  })

  it('dispose calls controller.dispose for all tuples', () => {
    const tuples = instruments.map(def => createInstrumentTuple(def))
    const spies = tuples.map(t => vi.spyOn(t.controller, 'dispose'))
    const ctrl = new InstrumentTickController(tuples)
    ctrl.dispose()
    for (const spy of spies) {
      expect(spy).toHaveBeenCalled()
    }
  })
})
```

- [ ] **Run the test — expect PASS**

```bash
npm run test -- src/instruments/__tests__/InstrumentTickController.test.ts
```

- [ ] **Commit**

```bash
git add src/instruments/__tests__/InstrumentTickController.test.ts
git commit -m "test(instruments): verify InstrumentTickController tick, lookup, and dispose"
```

---

## Task 10: useInstrumentProvider

**Files:**
- Create: `src/composables/useInstrumentProvider.ts`

Plan A: loads JSON, creates tuples via factory, exposes defs. Does NOT wire tick controller to any animation loop.

- [ ] **Create the composable**

```typescript
// src/composables/useInstrumentProvider.ts
import type { InstrumentDef } from '@/types/instruments'
import { createInstrumentTuple } from '@/instruments/InstrumentFactory'
import { InstrumentTickController } from '@/instruments/InstrumentTickController'
import instrumentsRaw from '../../public/data/instruments.json'

interface InstrumentProviderState {
  defs: InstrumentDef[]
  tickController: InstrumentTickController
}

let _state: InstrumentProviderState | null = null

function createState(): InstrumentProviderState {
  const defs = (instrumentsRaw.instruments as InstrumentDef[])
  const tuples = defs.map(def => createInstrumentTuple(def))
  const tickController = new InstrumentTickController(tuples)
  return { defs, tickController }
}

/**
 * Singleton instrument provider. Loads instruments.json once and caches.
 *
 * Plan A: exposes defs and tickController.
 * tickController.tick() is a no-op in Plan A — wired into the animation loop in Plan B.
 */
export function useInstrumentProvider() {
  if (!_state) {
    _state = createState()
  }

  function defBySlot(slot: number): InstrumentDef | undefined {
    return _state!.defs.find(d => d.slot === slot)
  }

  return {
    defs: _state.defs,
    defBySlot,
    tickController: _state.tickController,
  }
}

/** Reset singleton — for tests only. */
export function _resetInstrumentProvider(): void {
  _state = null
}
```

- [ ] **Commit**

```bash
git add src/composables/useInstrumentProvider.ts
git commit -m "feat(instruments): add useInstrumentProvider composable — loads JSON, exposes defs"
```

---

## Task 11: InstrumentHelpDialog

**Files:**
- Create: `src/components/InstrumentHelpDialog.vue`

- [ ] **Create the dialog component**

```vue
<!-- src/components/InstrumentHelpDialog.vue -->
<template>
  <Teleport to="body">
    <Transition name="help-fade">
      <div v-if="open && help" class="help-overlay" @click.self="$emit('close')">
        <div class="help-dialog" role="dialog" aria-modal="true">

          <div class="help-header">
            <div class="help-title">
              <span class="help-instrument-name">{{ instrumentName }}</span>
              <span class="help-separator"> · </span>
              <span class="help-label">FIELD REFERENCE</span>
            </div>
            <button type="button" class="help-close" aria-label="Close" @click="$emit('close')">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>

          <div class="help-body">
            <p class="help-summary">{{ help.summary }}</p>

            <div v-for="section in help.sections" :key="section.heading" class="help-section">
              <div class="help-section-heading">── {{ section.heading }} ─────────────────────</div>
              <p class="help-section-body">{{ section.body }}</p>
            </div>

            <div v-if="help.images && help.images.length > 0" class="help-images">
              <figure
                v-for="img in help.images"
                :key="img.src"
                class="help-figure"
              >
                <img
                  :src="img.src"
                  :alt="img.alt"
                  class="help-img"
                  @error="onImgError"
                />
                <figcaption class="help-caption">{{ img.alt }}</figcaption>
              </figure>
            </div>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import type { InstrumentHelp } from '@/types/instruments'

defineProps<{
  help: InstrumentHelp | null
  instrumentName: string
  open: boolean
}>()

defineEmits<{ close: [] }>()

function onImgError(e: Event): void {
  const img = e.target as HTMLImageElement
  img.style.display = 'none'
  const caption = img.nextElementSibling as HTMLElement | null
  if (caption) caption.textContent = `[ screenshot pending: ${img.alt} ]`
}
</script>

<style scoped>
.help-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.help-dialog {
  width: 480px;
  max-width: 100%;
  max-height: 80vh;
  background: rgba(10, 8, 6, 0.97);
  border: 1px solid rgba(196, 149, 106, 0.2);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: var(--font-instrument, 'Courier New', monospace);
}

.help-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 10px;
  border-bottom: 1px solid rgba(196, 149, 106, 0.15);
  background: rgba(255, 255, 255, 0.02);
  flex-shrink: 0;
}

.help-title {
  font-size: 11px;
  letter-spacing: 0.1em;
}

.help-instrument-name {
  color: rgba(220, 210, 200, 0.9);
  font-weight: 600;
}

.help-separator {
  color: rgba(196, 149, 106, 0.5);
  margin: 0 4px;
}

.help-label {
  color: rgba(196, 149, 106, 0.8);
}

.help-close {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  color: rgba(200, 200, 220, 0.5);
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.help-close:hover {
  background: rgba(196, 149, 106, 0.12);
  border-color: rgba(196, 149, 106, 0.35);
  color: rgba(220, 210, 200, 0.9);
}

.help-body {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
  font-size: 12px;
  line-height: 1.6;
}

.help-body::-webkit-scrollbar { width: 4px; }
.help-body::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
.help-body::-webkit-scrollbar-thumb { background: rgba(196,149,106,0.25); border-radius: 2px; }

.help-summary {
  color: rgba(200, 200, 220, 0.5);
  font-style: italic;
  margin: 0 0 16px;
  font-size: 11px;
}

.help-section {
  margin-bottom: 16px;
}

.help-section-heading {
  color: rgba(196, 149, 106, 0.7);
  font-size: 10px;
  letter-spacing: 0.08em;
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
}

.help-section-body {
  color: rgba(220, 210, 200, 0.8);
  margin: 0;
  font-size: 12px;
}

.help-images {
  margin-top: 16px;
}

.help-figure {
  margin: 0 0 12px;
}

.help-img {
  width: 100%;
  border: 1px solid rgba(196, 149, 106, 0.2);
  border-radius: 4px;
  display: block;
}

.help-caption {
  margin-top: 4px;
  font-size: 10px;
  color: rgba(200, 200, 220, 0.35);
  font-style: italic;
}

.help-fade-enter-active,
.help-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.help-fade-enter-from,
.help-fade-leave-to {
  opacity: 0;
  transform: scale(0.97) translateY(6px);
}
</style>
```

- [ ] **Commit**

```bash
git add src/components/InstrumentHelpDialog.vue
git commit -m "feat(instruments): add InstrumentHelpDialog component"
```

---

## Task 12: Wire Help Button into InstrumentOverlay

**Files:**
- Modify: `src/components/InstrumentOverlay.vue`

Three changes only — nothing else in this file is touched:
1. Import `useInstrumentProvider` and `InstrumentHelpDialog`
2. Add `helpOpen` ref and `helpDef` computed
3. Add `?` button to the header and `<InstrumentHelpDialog>` after the overlay div

- [ ] **Add imports to the script block** — find the existing imports at the top of `<script setup>` and add:

```typescript
import { ref, computed } from 'vue'  // ref and computed may already be imported — add only what's missing
import InstrumentHelpDialog from '@/components/InstrumentHelpDialog.vue'
import { useInstrumentProvider } from '@/composables/useInstrumentProvider'
```

- [ ] **Add state in script block** — after the existing `const { playUiCue } = useUiSound()` line:

```typescript
const { defBySlot } = useInstrumentProvider()
const helpOpen = ref(false)
const helpDef = computed(() => props.activeSlot != null ? defBySlot(props.activeSlot) : undefined)
```

- [ ] **Add help button to the header template** — find the `ov-header` div and add the button after `ov-slot`:

```html
<div class="ov-header">
  <div class="ov-icon">{{ instrument.icon }}</div>
  <div class="ov-title">
    <div class="ov-name">{{ instrument.name }}</div>
    <div class="ov-type">{{ instrument.type }}</div>
  </div>
  <div class="ov-slot">{{ instrument.slot }}</div>
  <button
    v-if="helpDef?.help"
    type="button"
    class="ov-help-btn"
    title="Field reference"
    @click="helpOpen = true"
  >?</button>
</div>
```

- [ ] **Add InstrumentHelpDialog after the closing `</div>` of `.instrument-overlay`** (still inside the `<Teleport>`):

```html
<InstrumentHelpDialog
  :help="helpDef?.help ?? null"
  :instrument-name="helpDef?.name ?? ''"
  :open="helpOpen"
  @close="helpOpen = false"
/>
```

- [ ] **Add help button styles** at the bottom of `<style scoped>`:

```css
.ov-help-btn {
  background: rgba(196, 149, 106, 0.08);
  border: 1px solid rgba(196, 149, 106, 0.2);
  border-radius: 4px;
  color: rgba(196, 149, 106, 0.7);
  font-family: var(--font-instrument, monospace);
  font-size: 11px;
  font-weight: 600;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin-left: 6px;
  flex-shrink: 0;
}

.ov-help-btn:hover {
  background: rgba(196, 149, 106, 0.18);
  border-color: rgba(196, 149, 106, 0.45);
  color: rgba(220, 210, 200, 0.9);
}
```

- [ ] **Run the dev server and verify**

```bash
npm run dev
```

Open any instrument overlay. Confirm:
- `?` button appears in the header for all 14 instruments
- Clicking `?` opens the help dialog
- Dialog shows summary, sections, and image placeholders (broken img shows pending caption)
- Clicking backdrop or close button dismisses the dialog
- All existing overlay functionality (OVERDRIVE, DAN prospect, SAM progress, etc.) still works

- [ ] **Run all tests**

```bash
npm run test
```

Expected: all existing tests pass, all new tests pass.

- [ ] **Commit**

```bash
git add src/components/InstrumentOverlay.vue
git commit -m "feat(instruments): add help button to InstrumentOverlay wired to InstrumentHelpDialog"
```

---

## Done

Plan A complete. The following are now in place and untouched from the existing system:

- `createMarsSiteTickHandlers.ts` — still operational
- Hardcoded `INSTRUMENTS` record in `InstrumentOverlay.vue` — still operational
- `MarsSiteViewController.ts` / `MartianSiteView.vue` — untouched

Plan B will wire `InstrumentTickController` into the animation loop, delete the hardcoded record, and decompose the view controllers.
