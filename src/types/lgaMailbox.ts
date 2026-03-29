export interface LGAMessage {
  id: string
  direction: 'sent' | 'received'
  sol: number
  timeOfDay: number       // 0-1 fraction of sol
  subject: string
  body: string
  description?: string
  read: boolean
  type?: 'info' | 'mission' | 'alert'
  from?: string
  missionId?: string
}
