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
import type { TickHandler } from './InstrumentFactory'
import { createDrillTickHandler } from './tickHandlers/drillTickHandler'
import { createMastCamTickHandler } from './tickHandlers/mastCamTickHandler'
import { createChemCamTickHandler } from './tickHandlers/chemCamTickHandler'
import { createDanTickHandler } from './tickHandlers/danTickHandler'
import { createAntennaLGTickHandler } from './tickHandlers/antennaLGTickHandler'
import { createAntennaUHFTickHandler } from './tickHandlers/antennaUHFTickHandler'
import { createAPXSTickHandler } from './tickHandlers/apxsTickHandler'
import { createSAMTickHandler } from './tickHandlers/samTickHandler'
import { createRTGTickHandler } from './tickHandlers/rtgTickHandler'
import { createREMSTickHandler } from './tickHandlers/remsTickHandler'
import { createRadTickHandler } from './tickHandlers/radTickHandler'
import { createHeaterTickHandler } from './tickHandlers/heaterTickHandler'
import { createRoverWheelsTickHandler } from './tickHandlers/roverWheelsTickHandler'
import { createMicTickHandler } from './tickHandlers/micTickHandler'

export type ControllerConstructor = new () => InstrumentController
export type TickHandlerFactory = (controller: InstrumentController) => TickHandler

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
export const TICK_HANDLER_REGISTRY: Record<string, TickHandlerFactory> = {
  DrillTickHandler: createDrillTickHandler,
  MastCamTickHandler: createMastCamTickHandler,
  ChemCamTickHandler: createChemCamTickHandler,
  DANTickHandler: createDanTickHandler,
  AntennaLGTickHandler: createAntennaLGTickHandler,
  AntennaUHFTickHandler: createAntennaUHFTickHandler,
  APXSTickHandler: createAPXSTickHandler,
  SAMTickHandler: createSAMTickHandler,
  RoverVfxTickHandler: createRTGTickHandler,
  REMSTickHandler: createREMSTickHandler,
  RadTickHandler: createRadTickHandler,
  HeaterTickHandler: createHeaterTickHandler,
  RoverMovementTickHandler: createRoverWheelsTickHandler,
  MicTickHandler: createMicTickHandler,
}
