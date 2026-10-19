/* eslint-disable @typescript-eslint/no-explicit-any */
import { economy, stars } from './config/economy';
import { claimCard } from './db/database';
import { buildClaimComponents } from './claimUi';

async function handleComponent(client: any, interaction: any): Promise<void> {
    const customId: string = (interaction.data && interaction.data.custom_id) || '';

    if (!customId.startsWith('claim:')) {
        return;
    }

    const [, pullId, indexText] = customId.split(':');
    const user = (interaction.member && interaction.member.user) || interaction.user;

    if (!user) {
        return;
    }

    const { api } = client;
    const callback = (type: number, data: any) => api
        .interactions(interaction.id, interaction.token)
        .callback.post({ data: { type, data } });
    const reply = (content: string) => callback(4, { content, flags: 64 });

    const result = await claimCard(pullId, parseInt(indexText, 10), user.id);

    switch (result.status) {
    case 'not_found':
        await reply('Este roll ya no existe.');
        break;
    case 'not_owner':
        await reply('Solo quien hizo el roll puede reclamar sus cartas.');
        break;
    case 'expired':
        await reply('Este roll expiró. Haz uno nuevo con `!!gacha` o `!!waifu`.');
        break;
    case 'already_claimed':
        await reply('Esa carta ya fue reclamada.');
        break;
    case 'insufficient':
        await reply(
            `${economy.quartzEmoji} No te alcanza el quarzo santo: necesitas **${result.cost}** y tienes **${result.quartz}**. `
            + `Próxima recarga de +${economy.regenAmount} en ~${result.minutes} min.`,
        );
        break;
    case 'ok':
        await callback(7, { components: buildClaimComponents(pullId, result.cards) });
        await api.webhooks(client.user ? client.user.id : '', interaction.token).post({
            data: {
                content: `${economy.quartzEmoji} <@${user.id}> reclamó ${stars(result.card.rarity)} **${result.card.name}** `
                    + `por **${result.cost}**. Saldo: **${result.quartz}**`,
                allowed_mentions: { parse: [] },
            },
        });
        break;
    default:
        break;
    }
}

export function registerInteractions(client: any): void {
    client.on('raw', (packet: any) => {
        if (packet && packet.t === 'INTERACTION_CREATE' && packet.d && packet.d.type === 3) {
            handleComponent(client, packet.d).catch((error) => {
                console.error('Interaction failed:', error);
            });
        }
    });
}
