import { CardType } from '../fgo/types';

export const economy = {
    startingQuartz: 500,
    regenAmount: 500,
    regenIntervalMs: 30 * 60 * 1000,
    maxQuartz: 1000,
    claimWindowMs: 10 * 60 * 1000,
    maxCardsPerRoll: 25,
    quartzEmojiId: '1561580005073358888',
    quartzEmojiName: 'quarzo',
    quartzEmoji: '<:quarzo:1561580005073358888>',
};

const claimCosts: Record<string, Record<number, number>> = {
    [CardType.Servant]: {
        0: 100, 1: 50, 2: 75, 3: 100, 4: 200, 5: 400,
    },
    [CardType.Essence]: {
        0: 20, 1: 20, 2: 30, 3: 50, 4: 100, 5: 200,
    },
};

export function getClaimCost(type: CardType, rarity: number): number {
    return (claimCosts[type] && claimCosts[type][rarity]) || 100;
}

export function stars(rarity: number): string {
    return rarity > 0 ? '★'.repeat(rarity) : '☆';
}
