import {
    Scraper, atlasGet, ATLAS_API, ATLAS_REGION,
} from './scraper';
import { CardType, ICard, IServant } from './types';
import { constants } from '../config/constants';
import { rules } from '../config/rules';
import { cache } from '../util/cache';

interface IBasicServant {
    id: number,
    collectionNo: number,
    type: string,
    name: string,
    className: string,
    rarity: number,
}

interface INiceServant {
    id: number,
    extraAssets?: {
        charaGraph?: {
            ascension?: Record<string, string>,
            costume?: Record<string, string>,
        },
    },
}

const ASCENSION_LETTERS = ['a', 'b', 'c', 'd'];

export class ScraperServants extends Scraper {
    constructor() {
        super(constants.servantCacheKey);
    }

    public async scrape(): Promise<void> {
        const servants = await atlasGet<IBasicServant[]>(
            `${ATLAS_API}/export/${ATLAS_REGION}/basic_servant.json`,
        );

        this.cards = [];

        servants.forEach((s) => {
            const playable = s.type === 'normal' || s.type === 'heroine';

            if (!playable || !(s.collectionNo > 0) || !s.name || !s.className) {
                return;
            }

            if (s.className.toLowerCase().includes('beast')) {
                return;
            }

            if (rules[CardType.Servant].find((rule) => rule.includes(s.name))) {
                return;
            }

            const servant: IServant = {
                id: s.collectionNo,
                atlasId: s.id,
                name: s.name,
                class: s.className,
                rarity: s.rarity,
                url: `https://apps.atlasacademy.io/db/${ATLAS_REGION}/servant/${s.collectionNo}`,
                type: CardType.Servant,
            };

            this.cards.push(servant);
        });

        if (!this.cards.length) {
            throw new Error(`No servants loaded. First API item: ${JSON.stringify(servants[0])}`);
        }

        cache.set(this.cacheKey, this.cards);
        console.log(`Loaded ${this.cards.length} servants`);
    }

    private async resolveImageUrl(card: ICard, stage: string): Promise<string> {
        const id = card.atlasId as number;
        let ascension: Record<string, string> = {};
        let costume: Record<string, string> = {};

        try {
            const detail = await atlasGet<INiceServant>(
                `${ATLAS_API}/nice/${ATLAS_REGION}/servant/${id}`,
            );
            const charaGraph = detail.extraAssets && detail.extraAssets.charaGraph;

            ascension = (charaGraph && charaGraph.ascension) || {};
            costume = (charaGraph && charaGraph.costume) || {};
        } catch (error) {
            console.error(`Could not fetch servant ${id}:`, error.message);
        }

        if (ascension[stage]) {
            return ascension[stage];
        }

        // Etapas que no son ascensiones (trajes, april, etc.): usa el primer traje
        if (!/^[1-4]$/.test(stage)) {
            const costumes = Object.keys(costume).map((key) => costume[key]);

            if (costumes.length) {
                return costumes[0];
            }
        }

        const best = ['4', '3', '2', '1'].map((key) => ascension[key]).find(Boolean);

        if (best) {
            return best;
        }

        const index = Math.min(Math.max(parseInt(stage, 10) || 1, 1), 4) - 1;

        return `https://static.atlasacademy.io/${ATLAS_REGION}/CharaGraph/${id}/${id}${ASCENSION_LETTERS[index]}.png`;
    }

    public async getCardImage(card: ICard, stage: string): Promise<string> {
        const normalizedStage = constants.stages.includes(stage) ? stage : '1';
        const filePath = this.getCardImagePath(card, normalizedStage);

        if (this.cardImageExists(card, normalizedStage)) {
            return filePath;
        }

        const imageUrl = await this.resolveImageUrl(card, normalizedStage);

        return this.downloadImage(imageUrl, filePath);
    }
}
