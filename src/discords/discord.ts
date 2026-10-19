/* eslint-disable @typescript-eslint/no-explicit-any */
import { Command, CommandMessage, Discord } from '@typeit/discord';
import { Gacha } from '../fgo/gacha';
import { CardType, IResponse } from '../fgo/types';
import { economy, stars } from '../config/economy';
import { buildClaimComponents } from '../claimUi';
import {
    getCollection, getPlayer, IPullCard, minutesUntilRegen, savePull,
} from '../db/database';

interface CommandArgs {
    stage: string;
    howManyCards: string;
}

const gacha = new Gacha();

async function sendRoll(
    command: CommandMessage<CommandArgs>,
    response: IResponse,
    kind: 'gacha' | 'waifu',
    stage: string,
    intro: string,
): Promise<void> {
    const now = Date.now();
    const userId = command.author.id;
    const cards: IPullCard[] = (response.cards || []).map((card) => ({
        type: card.type,
        id: card.id,
        name: card.name,
        rarity: card.rarity,
    }));

    const pullId = await savePull({
        userId,
        channelId: command.channel.id,
        command: kind,
        stage: stage || '1',
        cards,
        createdAt: now,
        expiresAt: now + economy.claimWindowMs,
    });
    const player = await getPlayer(userId);
    const minutes = economy.regenIntervalMs / 60000;

    await (command.client as any).api.channels(command.channel.id).messages.post({
        data: {
            content: intro,
            embeds: [{
                description: response.description,
                color: 0xf1c40f,
                image: { url: 'attachment://result.png' },
                footer: {
                    text: `Quarzo santo: ${player.quartz}/${economy.maxQuartz} · +${economy.regenAmount} cada ${minutes} min · `
                        + `${economy.claimWindowMs / 60000} min para reclamar`,
                },
            }],
            components: buildClaimComponents(pullId, cards),
            message_reference: { message_id: command.id },
            allowed_mentions: { replied_user: false },
        },
        files: [{ name: 'result.png', file: response.image }],
    });
}

@Discord('!!')
export class DiscordApp {
    @Command('gacha :stage :howManyCards')
    async gacha(command: CommandMessage<CommandArgs>): Promise<void> {
        try {
            const { stage, howManyCards } = command.args;
            const response = await gacha.gacha(stage, Number(howManyCards));

            await sendRoll(command, response, 'gacha', stage, 'Aquí está tu roll. Pulsa el número de la carta que quieras reclamar:');
        } catch (error) {
            console.error('gacha command failed:', error);
            await command.reply('algo falló generando tu roll, intenta de nuevo en un momento.');
        }
    }

    @Command('waifu :stage')
    async waifu(command: CommandMessage<CommandArgs>): Promise<void> {
        try {
            const { stage } = command.args;
            const response = await gacha.waifu(stage);

            await sendRoll(command, response, 'waifu', stage, 'Aquí está tu waifu:');
        } catch (error) {
            console.error('waifu command failed:', error);
            await command.reply('algo falló generando tu waifu, intenta de nuevo en un momento.');
        }
    }

    @Command('quartz')
    async quartz(command: CommandMessage<CommandArgs>): Promise<void> {
        try {
            const player = await getPlayer(command.author.id);
            const recharge = player.quartz >= economy.maxQuartz
                ? ''
                : ` Próxima recarga de +${economy.regenAmount} en ~${minutesUntilRegen(player)} min.`;

            await command.reply(`${economy.quartzEmoji} Tienes **${player.quartz}** / ${economy.maxQuartz} de quarzo santo.${recharge}`);
        } catch (error) {
            console.error('quartz command failed:', error);
            await command.reply('no pude consultar tu saldo, intenta de nuevo.');
        }
    }

    @Command('collection')
    async collection(command: CommandMessage<CommandArgs>): Promise<void> {
        try {
            const cards = await getCollection(command.author.id);

            if (!cards.length) {
                await command.reply('aún no has reclamado nada. Prueba `!!gacha 1 11` o `!!waifu 1`.');

                return;
            }

            const line = (c: { name: string, rarity: number, count: number }) => `${stars(c.rarity)} ${c.name}${c.count > 1 ? ` x${c.count}` : ''}`;
            const servants = cards.filter((c) => c.type === CardType.Servant);
            const essences = cards.filter((c) => c.type === CardType.Essence);
            const text = [
                `**Tu colección:** ${servants.length} servants · ${essences.length} esencias`,
                servants.length ? `\n**Servants**\n${servants.slice(0, 25).map(line).join('\n')}` : '',
                essences.length ? `\n**Esencias**\n${essences.slice(0, 15).map(line).join('\n')}` : '',
            ].join('\n');

            await command.reply(text.slice(0, 1900));
        } catch (error) {
            console.error('collection command failed:', error);
            await command.reply('no pude cargar tu colección, intenta de nuevo.');
        }
    }
}
