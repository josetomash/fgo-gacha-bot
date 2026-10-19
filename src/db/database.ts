/* eslint-disable @typescript-eslint/no-explicit-any */
import { economy, getClaimCost } from '../config/economy';
import { CardType } from '../fgo/types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { MongoClient, ObjectId } = require('mongodb');

export interface IPlayer {
    _id: string,
    quartz: number,
    lastRegen: number,
    createdAt: number,
}

export interface IPullCard {
    type: CardType,
    id: number,
    name: string,
    rarity: number,
    claimed?: boolean,
}

export interface IPull {
    userId: string,
    channelId: string,
    command: string,
    stage: string,
    cards: IPullCard[],
    createdAt: number,
    expiresAt: number,
}

export interface IClaimedCard {
    type: CardType,
    cardId: number,
    name: string,
    rarity: number,
    count: number,
}

export type ClaimResult =
    | { status: 'ok', card: IPullCard, cost: number, quartz: number, cards: IPullCard[] }
    | { status: 'not_found' }
    | { status: 'not_owner' }
    | { status: 'expired' }
    | { status: 'already_claimed' }
    | { status: 'insufficient', cost: number, quartz: number, minutes: number };

let players: any;
let pulls: any;
let claims: any;

export async function connectDatabase(): Promise<void> {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
        throw new Error('MONGODB_URI is not set');
    }

    const client = new MongoClient(uri);

    await client.connect();

    const db = client.db(process.env.MONGODB_DB || 'fgo-gacha');

    players = db.collection('players');
    pulls = db.collection('pulls');
    claims = db.collection('claims');

    await claims.createIndex({ userId: 1, type: 1, cardId: 1 }, { unique: true });
    await pulls.createIndex({ userId: 1, createdAt: -1 });

    console.log('Database connected');
}

export function minutesUntilRegen(player: IPlayer): number {
    const remaining = player.lastRegen + economy.regenIntervalMs - Date.now();

    return Math.max(1, Math.ceil(remaining / 60000));
}

// Crea al jugador si no existe y aplica la regeneración pendiente
export async function getPlayer(userId: string): Promise<IPlayer> {
    const now = Date.now();
    let player: IPlayer | null = await players.findOne({ _id: userId });

    if (!player) {
        const fresh: IPlayer = {
            _id: userId,
            quartz: economy.startingQuartz,
            lastRegen: now,
            createdAt: now,
        };

        try {
            await players.insertOne(fresh);

            return fresh;
        } catch (error) {
            player = await players.findOne({ _id: userId });

            if (!player) {
                throw error;
            }
        }
    }

    let { quartz, lastRegen } = player;

    if (quartz >= economy.maxQuartz) {
        lastRegen = now;
    } else {
        const ticks = Math.floor((now - lastRegen) / economy.regenIntervalMs);

        if (ticks > 0) {
            quartz = Math.min(economy.maxQuartz, quartz + ticks * economy.regenAmount);
            lastRegen = quartz >= economy.maxQuartz
                ? now
                : lastRegen + ticks * economy.regenIntervalMs;
        }
    }

    if (quartz !== player.quartz || lastRegen !== player.lastRegen) {
        await players.updateOne(
            { _id: userId, lastRegen: player.lastRegen },
            { $set: { quartz, lastRegen } },
        );

        const updated = await players.findOne({ _id: userId });

        return updated || { ...player, quartz, lastRegen };
    }

    return player;
}

export async function savePull(pull: IPull): Promise<string> {
    const result = await pulls.insertOne(pull);

    return result.insertedId.toString();
}

async function getPull(pullId: string): Promise<any> {
    let id;

    try {
        id = new ObjectId(pullId);
    } catch (error) {
        return null;
    }

    return pulls.findOne({ _id: id });
}

export async function claimCard(
    pullId: string,
    index: number,
    userId: string,
): Promise<ClaimResult> {
    const pull = await getPull(pullId);

    if (!pull || !Number.isInteger(index) || index < 0 || index >= pull.cards.length) {
        return { status: 'not_found' };
    }

    if (pull.userId !== userId) {
        return { status: 'not_owner' };
    }

    const card: IPullCard = pull.cards[index];

    if (card.claimed) {
        return { status: 'already_claimed' };
    }

    if (Date.now() > pull.expiresAt) {
        return { status: 'expired' };
    }

    const cost = getClaimCost(card.type, card.rarity);
    const player = await getPlayer(userId);

    if (player.quartz < cost) {
        return {
            status: 'insufficient', cost, quartz: player.quartz, minutes: minutesUntilRegen(player),
        };
    }

    // 1) marca la carta como reclamada (solo si nadie la reclamó antes)
    const flag = `cards.${index}.claimed`;
    const marked = await pulls.updateOne(
        { _id: pull._id, [flag]: { $ne: true } },
        { $set: { [flag]: true } },
    );

    if (!marked.modifiedCount) {
        return { status: 'already_claimed' };
    }

    // 2) cobra solo si todavía alcanza el saldo
    const paid = await players.findOneAndUpdate(
        { _id: userId, quartz: { $gte: cost } },
        { $inc: { quartz: -cost } },
        { returnDocument: 'after' },
    );
    const updatedPlayer = paid && (Object.prototype.hasOwnProperty.call(paid, 'value') ? paid.value : paid);

    if (!updatedPlayer) {
        await pulls.updateOne({ _id: pull._id }, { $set: { [flag]: false } });
        const current = await getPlayer(userId);

        return {
            status: 'insufficient', cost, quartz: current.quartz, minutes: minutesUntilRegen(current),
        };
    }

    // 3) guarda la carta en la colección del jugador
    const now = Date.now();

    await claims.updateOne(
        { userId, type: card.type, cardId: card.id },
        {
            $inc: { count: 1 },
            $set: { name: card.name, rarity: card.rarity, lastClaimedAt: now },
            $setOnInsert: { firstClaimedAt: now },
        },
        { upsert: true },
    );

    pull.cards[index].claimed = true;

    return {
        status: 'ok', card, cost, quartz: updatedPlayer.quartz, cards: pull.cards,
    };
}

export async function getCollection(userId: string): Promise<IClaimedCard[]> {
    return claims.find({ userId }).sort({ rarity: -1, cardId: 1 }).toArray();
}
