/* eslint-disable @typescript-eslint/no-explicit-any */
import { economy, getClaimCost } from './config/economy';
import { IPullCard } from './db/database';

export function buildClaimComponents(pullId: string, cards: IPullCard[]): any[] {
    const single = cards.length === 1;
    const rows: any[] = [];

    cards.forEach((card, index) => {
        const rowIndex = Math.floor(index / 5);

        if (!rows[rowIndex]) {
            rows[rowIndex] = { type: 1, components: [] };
        }

        const cost = getClaimCost(card.type, card.rarity);
        let label = single ? `Reclamar · ${cost}` : `${index + 1} · ${cost}`;

        if (card.claimed) {
            label = single ? 'Reclamado' : `${index + 1} ✓`;
        }

        rows[rowIndex].components.push({
            type: 2,
            style: card.claimed ? 2 : 3,
            label,
            emoji: { id: economy.quartzEmojiId, name: economy.quartzEmojiName },
            custom_id: `claim:${pullId}:${index}`,
            disabled: Boolean(card.claimed),
        });
    });

    return rows.slice(0, 5);
}
