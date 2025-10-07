export type Phase = "Setup" | "Start" | "Draw" | "Main" | "End";

export type PlayerKey = "p1" | "p2";

export type Thresholds = {
  air: number;
  water: number;
  earth: number;
  fire: number;
};

export type LifeState = "alive" | "dd" | "dead";

export type PlayerState = {
  life: number;
  lifeState: LifeState;
  mana: number;
  thresholds: Thresholds;
};
