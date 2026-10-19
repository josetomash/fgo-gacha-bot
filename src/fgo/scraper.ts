import axios, { AxiosRequestConfig } from 'axios';
import fs from 'fs';
import path from 'path';
import { ICard } from './types';

export const ATLAS_API = 'https://api.atlasacademy.io';
export const ATLAS_REGION = 'NA';

const USER_AGENT = 'fgo-gacha-bot (Discord bot)';

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

    public abstract scrape(): Promise<void>;

    public abstract getCardImage(card: ICard, stage?: string): Promise<string>;
}
