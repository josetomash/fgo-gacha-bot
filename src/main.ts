import http from 'http';
import { Client } from '@typeit/discord';
import dotenv from 'dotenv';
import { ScraperServants } from './fgo/scraper.servants';
import { ScraperEssences } from './fgo/scraper.essences';

dotenv.config();

http.createServer((_, res) => res.end('ok'))
    .listen(Number(process.env.PORT) || 3000, () => {
        console.log('Keep-alive server running');
    });

export class Main {
    private static client: Client;

    static start(): void {
        Promise.all([
            new ScraperServants().scrape(),
            new ScraperEssences().scrape(),
        ]).then(() => {
            this.client = new Client();
            return this.client.login(
                process.env.BOT_TOKEN ?? 'INVALID_TOKEN',
                `${__dirname}/discords/*.ts`,
                `${__dirname}/discords/*.js`,
            );
        }).then(() => {
            console.log('Application started!');
        }).catch((error) => {
            console.error('Error starting the bot:', error);
        });
    }
}

Main.start();
