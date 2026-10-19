import fs from 'fs';
import path from 'path';
import { ICard, CardType } from '../fgo/types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ICollectedCard {
    card: ICard;
    rollCost: number;   // Total Saint Quartz spent on the roll that yielded this card
    rollSize: number;   // Number of cards in that roll
    obtainedAt: string; // ISO 8601 date string
}

export interface IUserCollection {
    servants: ICollectedCard[];
    essences: ICollectedCard[];
}

type CollectionsDb = Record<string, IUserCollection>;

// ─── Persistence ─────────────────────────────────────────────────────────────

const DB_PATH = path.join(__dirname, '../../data/collections.json');

function load(): CollectionsDb {
    try {
        if (fs.existsSync(DB_PATH)) {
            return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')) as CollectionsDb;
        }
    } catch (err) {
        console.error('collection.ts: could not load collections.json:', err);
    }
    return {};
}

function save(db: CollectionsDb): void {
    try {
        fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    } catch (err) {
        console.error('collection.ts: could not save collections.json:', err);
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the collection for a user. Returns empty lists if the user has no
 * collection yet.
 */
export function getUserCollection(userId: string): IUserCollection {
    const db = load();
    return db[userId] ?? { servants: [], essences: [] };
}

/**
 * Calculates Saint Quartz cost for a roll.
 *   1 card  → 3 SQ
 *   10 cards → 30 SQ  (standard multi)
 *   11 cards → 30 SQ  (standard 10+1 multi, 11th card is free)
 *   N > 11   → 30 SQ + (N - 11) × 3 SQ
 */
export function calcRollCost(cardCount: number): number {
    if (cardCount <= 0) return 0;
    if (cardCount === 1) return 3;
    if (cardCount <= 11) return 30;
    return 30 + (cardCount - 11) * 3;
}

/**
 * Appends all cards from a gacha roll to the user's persistent collection.
 * Strips the `image` path from the card before storing (it may change between
 * runs as images are re-downloaded to different paths).
 */
export function addCardsToCollection(
    userId: string,
    cards: ICard[],
    rollCost: number,
): void {
    const db = load();
    if (!db[userId]) {
        db[userId] = { servants: [], essences: [] };
    }
    const col = db[userId];
    const now = new Date().toISOString();
    const rollSize = cards.length;

    cards.forEach((card) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { image, ...cardData } = card;
        const entry: ICollectedCard = {
            card: cardData as ICard,
            rollCost,
            rollSize,
            obtainedAt: now,
        };

        if (card.type === CardType.Servant) {
            col.servants.push(entry);
        } else {
            col.essences.push(entry);
        }
    });

    save(db);
}
