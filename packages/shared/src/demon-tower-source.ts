/** Contracts for the isolated ZIP-sourced 九层妖塔 runtime. */
export interface DemonTowerSourceLayer {
  layerId: number;
  status: 'open' | 'cleared' | 'locked';
  bossHp: number;
  bossMaxHp: number;
  clues: number;
  channel: number;
  channelGoal: number;
  bossName: string;
  terrain: 'plain' | 'mount' | 'lake' | 'ocean';
  version: number;
}

export interface DemonTowerSourceServer {
  day: number;
  pop: number;
  lvAvg: number;
  sourceVersion: '2fe1c88e';
}

export interface DemonTowerSourceWorld {
  server: DemonTowerSourceServer;
  layers: DemonTowerSourceLayer[];
}

export interface DemonTowerSourceProgress {
  exists: boolean;
  version: number;
  saveData: string | null;
  updatedAt: string | null;
}

export interface DemonTowerSourceSaveInput {
  requestId: string;
  expectedVersion: number;
  saveData: string;
}

export interface DemonTowerSourceSaveReceipt {
  requestId: string;
  version: number;
  replayed: boolean;
  updatedAt: string;
}

export interface DemonTowerSourceWorldInput {
  requestId: string;
  layerId: number;
  amount: number;
  expectedVersion: number;
  saveData: string;
}

export interface DemonTowerSourceWorldReceipt {
  requestId: string;
  replayed: boolean;
  accepted: number;
  unlockedLayer: number | null;
  layer: DemonTowerSourceLayer;
  profileVersion: number;
  profileUpdatedAt: string;
}

export interface DemonTowerSourceFriend {
  id: string;
  playerId: string;
  name: string;
  level: number;
  avatar: Record<string, number> | null;
  saveData: string | null;
}

export interface DemonTowerSourceBattleProfile {
  playerId: string;
  saveData: string;
}

export interface DemonTowerSourceRankingEntry {
  playerId: string;
  name: string;
  level: number;
  power: number;
}

export interface DemonTowerSourceContribution {
  layerId: number;
  bossDamage: number;
  materials: number;
  clues: number;
}
