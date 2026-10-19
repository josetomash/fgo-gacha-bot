import axios, { AxiosRequestConfig } from 'axios';
import fs from 'fs';
import path from 'path';
import { ICard } from './types';

export const ATLAS_API = 'https://api.atlasacademy.io';
export const ATLAS_REGION = 'NA';

const USER_AGENT = 'fgo-gacha-bot (Discord bot)';

export interface ILoreComment {
    id?: number,
    priority?: number,
    comment?: string,
}

export interface ILoreProfile {
    comments?: ILoreComment[],
}

export const descriptionCache: Map<string, string | null> = new Map();

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function atlasGet<R>(url: string, config: AxiosRequestConfig = {}): Promise<R> {
    const maxAttempts = 4;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            // eslint-disable-next-line no-await-in-loop
            const response = await axios.get<R>(url, {
                ...config,
                headers: { 'User-Agent': USER_AGENT, ...(config.headers || {}) },
                timeout: 30000,
            });

            return response.data;
        } catch (error) {
            lastError = error;
            const status = error.response && error.response.status;
            const retryable = !status || status === 429 || status >= 500;

            if (!retryable) {
                break;
            }

            // eslint-disable-next-line no-await-in-loop
            await sleep(1000 * attempt);
        }
    }

    throw lastError;
}

export function pickDescription(profile?: ILoreProfile): string | undefined {
    const comments = (profile && profile.comments) || [];
    const usable = comments
        .filter((c) => c && typeof c.comment === 'string' && c.comment.trim().length > 0)
        .sort((a, b) => ((a.priority || 0) - (b.priority || 0)) || ((a.id || 0) - (b.id || 0)));

    if (!usable.length) {
        return undefined;
    }

    const text = (usable[0].comment as string).replace(/\s+/g, ' ').trim();

    return text.length > 280 ? `${text.slice(0, 277).trim()}...` : text;
}

export abstract class Scraper {
    protected cards: ICard[] = [];

    protected readonly cacheKey: string;

    protected constructor(cacheKey: string) {
        this.cacheKey = cacheKey;
    }

    protected getCardImagePath(card: ICard, stage?: string): string {
        return `${__dirname}/../../resources/images/${card.type}/cards/${card.id + (stage ? `_${stage}` : '')}.png`;
    }

    protected cardImageExists(card: ICard, stage?: string): boolean {
        return fs.existsSync(this.getCardImagePath(card, stage));
    }

    protected async saveCardImage(imageUrl: string, filePath: string): Promise<string> {
        const data = await atlasGet<Buffer>(imageUrl, { responseType: 'arraybuffer' });

        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, Buffer.from(data));

        return filePath;
    }

    // Descarga la imagen; si falla, devuelve la URL remota para que canvas la cargue directo
    protected async downloadImage(imageUrl: string, filePath: string): Promise<string> {
        try {
            return await this.saveCardImage(imageUrl, filePath);
        } catch (error) {
            console.error(`Could not download ${imageUrl}:`, error.message);

            return imageUrl;
        }
    }

    // Descripción opcional: si algo falla, simplemente devuelve undefined
    protected async loadDescription(card: ICard, endpoint: 'servant' | 'equip'): Promise<string | undefined> {
        const key = `${card.type}:${card.id}`;

        if (descriptionCache.has(key)) {
            return descriptionCache.get(key) || undefined;
        }

        try {
            const detail = await atlasGet<{ profile?: ILoreProfile }>(
                `${ATLAS_API}/nice/${ATLAS_REGION}/${endpoint}/${card.atlasId}`,
                { params: { lore: true } },
            );
            const description = pickDescription(detail.profile);

            descriptionCache.set(key, description || null);

            return description;
        } catch (error) {
            console.error(`Could not fetch description for ${card.name}:`, error.message);

            return undefined;
        }
    }

    public abstract scrape(): Promise<void>;

    public abstract getCardImage(card: ICard, stage?: string): Promise<string>;

    public abstract getDescription(card: ICard): Promise<string | undefined>;
}
