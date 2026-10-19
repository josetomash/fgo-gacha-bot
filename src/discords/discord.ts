/* eslint-disable @typescript-eslint/no-explicit-any */
import { Command, CommandMessage, Discord } from '@typeit/discord';
import { MessageAttachment, MessageEmbed } from 'discord.js';
import { Gacha } from '../fgo/gacha';
import { CardType, ICard, IResponse } from '../fgo/types';
import { economy, getClaimCost, stars } from '../config/economy';
import { constants } from '../config/constants';
import { cache } from '../util/cache';
import { ScraperServants } from '../fgo/scraper.servants';
import { ScraperEssences } from '../fgo/scraper.essences';
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

    @Command(/(collection|col|c)/)
    async collection(command: CommandMessage<CommandArgs>): Promise<void> {
        try {
            const rawArgs = command.content
                .replace(/^!!(collection|col|c)\s*/i, '')
                .trim();
            const parts = rawArgs.split(/\s+/).filter(Boolean);

            const cards = await getCollection(command.author.id);

            if (!cards.length) {
                await command.reply('Aún no has reclamado nada en tu colección. Prueba `!!gacha 1 11` o `!!waifu 1` y reclama tus cartas.');
                return;
            }

            const servants = cards.filter((c) => c.type === CardType.Servant);
            const essences = cards.filter((c) => c.type === CardType.Essence);

            // Si no se pasaron argumentos: listar con índices
            if (parts.length === 0) {
                const line = (c: { name: string, rarity: number, count: number }, idx: number) =>
                    `[${idx + 1}] ${stars(c.rarity)} ${c.name}${c.count > 1 ? ` x${c.count}` : ''}`;

                const text = [
                    `**Tu colección:** ${servants.length} servants · ${essences.length} esencias\n`
                    + '*(Usa `!!collection servant {índice}` o `!!collection essence {índice}` para ver la imagen y detalles)*',
                    servants.length ? `\n**Servants**\n${servants.map((c, i) => line(c, i)).join('\n')}` : '',
                    essences.length ? `\n**Esencias**\n${essences.map((c, i) => line(c, i)).join('\n')}` : '',
                ].join('\n');

                if (text.length > 1950) {
                    // Si excede el límite de mensaje de Discord, truncar amigablemente
                    await command.reply(text.slice(0, 1900) + '\n\n*... (más cartas en tu colección)*');
                } else {
                    await command.reply(text);
                }
                return;
            }

            // Determinar tipo e índice según argumentos y aliases
            let targetType = CardType.Servant;
            let indexStr = '';

            const servantAliases = ['servant', 's', 'svt', 'serv'];
            const essenceAliases = ['essence', 'ce', 'e', 'ess', 'esencia', 'esencias'];

            if (parts.length === 1) {
                // Solo un argumento: si es número, por defecto se toma como servant
                if (/^\d+$/.test(parts[0])) {
                    targetType = CardType.Servant;
                    indexStr = parts[0];
                } else {
                    await command.reply('Por favor especifica un índice numérico. Ejemplo: `!!collection 1` o `!!collection ce 1`');
                    return;
                }
            } else {
                const first = parts[0].toLowerCase();
                const second = parts[1].toLowerCase();

                if (servantAliases.includes(first)) {
                    targetType = CardType.Servant;
                    indexStr = second;
                } else if (essenceAliases.includes(first)) {
                    targetType = CardType.Essence;
                    indexStr = second;
                } else if (/^\d+$/.test(first)) {
                    // Por si el usuario escribe `!!collection 1 servant` o `!!collection 1 ce`
                    indexStr = first;
                    if (essenceAliases.includes(second)) {
                        targetType = CardType.Essence;
                    } else {
                        targetType = CardType.Servant;
                    }
                } else {
                    // Tipo desconocido, asumir servant y comprobar si segundo es número
                    targetType = CardType.Servant;
                    indexStr = second;
                }
            }

            const targetIndex = parseInt(indexStr, 10);
            if (Number.isNaN(targetIndex) || targetIndex <= 0) {
                await command.reply('El índice debe ser un número mayor a 0. Ejemplo: `!!collection s 1` o `!!collection ce 1`');
                return;
            }

            const targetList = targetType === CardType.Servant ? servants : essences;
            const typeLabel = targetType === CardType.Servant ? 'servants' : 'esencias';

            if (targetIndex > targetList.length) {
                await command.reply(`El índice **${targetIndex}** no existe en tu lista de ${typeLabel}. Tienes **${targetList.length}** en total.`);
                return;
            }

            const claimedItem = targetList[targetIndex - 1];

            // Buscar la carta en el pool cacheado para tener atlasId, url, class, etc.
            const cardPool: ICard[] = cache.get(
                targetType === CardType.Servant ? constants.servantCacheKey : constants.essenceCacheKey,
            ) || [];
            const fullCard = cardPool.find((c) => c.id === claimedItem.cardId) || {
                id: claimedItem.cardId,
                name: claimedItem.name,
                rarity: claimedItem.rarity,
                type: targetType,
                url: `https://apps.atlasacademy.io/db/NA/${targetType === CardType.Servant ? 'servant' : 'craft-essence'}/${claimedItem.cardId}`,
            } as ICard;

            // Obtener descripción (NP o Lore o Habilidad)
            let lore: string | undefined;
            try {
                lore = await (targetType === CardType.Servant
                    ? new ScraperServants().getDescription(fullCard)
                    : new ScraperEssences().getDescription(fullCard));
            } catch (err) {
                console.error('Error al obtener descripción:', err);
            }

            const claimCost = getClaimCost(claimedItem.type, claimedItem.rarity);
            const imageBuffer = await gacha.renderSingleCard(fullCard, '1');

            const attachment = new MessageAttachment(imageBuffer, 'card.png');
            const embed = new MessageEmbed()
                .setTitle(`[${targetIndex}] ${stars(claimedItem.rarity)} ${claimedItem.name}${claimedItem.count > 1 ? ` (x${claimedItem.count})` : ''}`)
                .setURL(fullCard.url)
                .setColor(targetType === CardType.Servant ? 0xe74c3c : 0x3498db)
                .addField('Tipo', targetType === CardType.Servant ? 'Servant' : 'Craft Essence', true)
                .addField('ID', `#${claimedItem.cardId}`, true)
                .addField('Precio de obtención', `${economy.quartzEmoji} **${claimCost}** de quarzo santo`, true)
                .attachFiles([attachment])
                .setImage('attachment://card.png');

            if (lore) {
                embed.setDescription(lore);
            }

            await command.reply(embed);
        } catch (error) {
            console.error('collection command failed:', error);
            await command.reply('no pude procesar el comando collection, intenta de nuevo.');
        }
    }
}

