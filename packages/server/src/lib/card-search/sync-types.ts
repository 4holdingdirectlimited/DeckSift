export interface SyncSourceCard {
  id: string;
  name: string;
  setCode: string;
  imageUrl: string | undefined;
  /**
   * Full card object (raw Scryfall card JSON, or the normalized PlayingCard
   * shape for other games) when the bulk source carries it. Stored in
   * cards.card_data at sync time so hydration never needs the network.
   */
  cardData?: unknown;
}

export interface SyncSourceCardDetail {
  name: string;
  setCode: string;
  imageUrl: string | undefined;
}

export interface SyncSource {
  gameKey: string;
  label: string;
  defaultUrl: string;
  fetchHeaders: Record<string, string>;
  fetchCards(
    baseUrl: string,
    addLog: (msg: string) => void,
  ): Promise<SyncSourceCard[]>;
  fetchOne(id: string, baseUrl: string): Promise<SyncSourceCardDetail | null>;
}
