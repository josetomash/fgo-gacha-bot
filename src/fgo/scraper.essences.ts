import {
    Scraper, atlasGet, ATLAS_API, ATLAS_REGION,
} from './scraper';
import { CardType, ICard } from './types';
import { constants } from '../config/constants';
import { cache } from '../util/cache';

interface IBasicEquip {
    id: number,
    collectionNo: number,
    name: string,
    rarity: number,
}

interface INiceEquip {
    id: number,
    extraAssets?: {
        charaGraph?: {
            equip?: Record<string, string>,
        },
    },
}

export class ScraperEssences extends Scraper {
    constructor() {
        super(constants.essenceCacheKey);
    }

    public async scrape(): Promise<void> {
        const equips = await atlasGet<IBasicEquip[]>(
            `${ATLAS_API}/export/${ATLAS_REGION}/basic_equip.json`,
        );

        this.cards = [];

        equips.forEach((e) => {
            if (!(e.collectionNo > 0) || !e.name) {
                return;
            }

            const essence: ICard = {
                id: e.collectionNo,
                atlasId: e.id,
                name: e.name,
                rarity: e.rarity,
                url: `https://apps.atlasacademy.io/db/${ATLAS_REGION}/craft-essence/${e.collectionNo}`,
                type: CardType.Essence,
            };

            this.cards.push(essence);
        });

        if (!this.cards.length) {
            throw new Error(`No essences loaded. First API item: ${JSON.stringify(equips[0])}`);
        }

        cache.set(this.cacheKey, this.cards);
        console.log(`Loaded ${this.cards.length} essences`);
    }

    private async resolveImageUrl(card: ICard): Promise<string> {
        const id = card.atlasId as number;

        try {
            const detail = await atlasGet<INiceEquip>(
                `${ATLAS_API}/nice/${ATLAS_REGION}/equip/${id}`,
            );
            const equip = detail.extraAssets
                && detail.extraAssets.charaGraph
                && detail.extraAssets.charaGraph.equip;
            const urls = equip ? Object.keys(equip).map((key) => equip[key]) : [];

            if (urls.length) {
                return urls[0];
            }
        } catch (error) {
            console.error(`Could not fetch essence ${id}:`, error.message);
        }

        return `https://static.atlasacademy.io/${ATLAS_REGION}/CharaGraph/${id}/${id}a.png`;
    }

    public async getCardImage(card: ICard): Promise<string> {
        const filePath = this.getCardImagePath(card);

        if (this.cardImageExists(card)) {
            return filePath;
        }

        const imageUrl = await this.resolveImageUrl(card);

        return this.downloadImage(imageUrl, filePath);
    }
}
