// One entry in a TopList ("most played" column). Rows either link somewhere
// (`to`) or run an action (`onClick`).
export interface TopRow {
  key: string;
  title: string;
  subtitle?: string;
  coverArt?: string;
  plays?: number;
  to?: string;
  onClick?: () => void;
  round?: boolean;
}
