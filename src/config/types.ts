import { CardType } from '../fgo/types';

export interface IRate {
    type: CardType,
    rarity: number,
    rate: number,
}

export interface IImageSize {
    width: number,
    height: number,
    offset: number,
}

export interface IConstants {
    wikiBaseUrl: string,
    servantListPage: string,
    essenceListPage: string,

    servantCacheKey: string,
    essenceCacheKey: string,

    stages: string[],

    rates: {
        [CardType.Servant]: IRate[],
        [CardType.Essence]: IRate[],
    },

    images: {
        frame: IImageSize,
        class: IImageSize,
        [CardType.Servant]: IImageSize,
        [CardType.Essence]: IImageSize,
    }
}

export interface IRules {
    [CardType.Servant]: string[]
}

export interface IConfig {
    cardsPerRoll: number,
    cardsPerRow: number,
    cardMargin: number,
}
