export interface ICard {
    id: number,
    atlasId?: number,
    type: CardType,
    name: string,
    rarity: number,
    url: string,
    image?: string,
}

export enum CardType {
    Servant = 'servant',
    Essence = 'essence'
}

export interface IServant extends ICard {
    class: string
}

export interface IResponse {
    description: string,
    image: Buffer,
    cards?: ICard[],
}
