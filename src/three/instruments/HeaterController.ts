import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'
import type { ThermalZone } from '@/composables/useMarsThermal'

export class HeaterController extends InstrumentController {
  readonly id = 'heater'
  readonly name = 'HTR'
  readonly slot = 9
  readonly focusNodeName = 'radiators'
  override readonly altNodeNames = ['body001', 'Chassis']
  readonly focusOffset = new THREE.Vector3(0, 0.2, 0.1)
  readonly viewAngle = -0.6
  readonly viewPitch = 0.4
  override readonly canActivate = false

  // Thermal state — updated from useMarsThermal each frame by the view
  internalTempC = 15
  ambientC = -10
  heaterW = 0
  zone: ThermalZone = 'OPTIMAL'
}
